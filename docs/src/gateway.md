# Gateway API

`serve/` is a FastAPI app (`natlas_serve.gateway`) that exposes one base URL.
The implementation is `serve/natlas_serve/gateway.py` and
`serve/natlas_serve/asr_app.py`. This page matches that code.

| Method | Path                       | Auth   |
| ------ | -------------------------- | ------ |
| `GET`  | `/health`                  | none   |
| `GET`  | `/v1/models`               | Bearer |
| `POST` | `/v1/chat/completions`     | Bearer |
| `POST` | `/v1/audio/transcriptions` | Bearer |

Send the key as `Authorization: Bearer <key>`. The comparison is constant-time
against every entry in `NATLAS_API_KEYS` (comma-separated). A missing or
unknown key is HTTP 401:

```json
{ "detail": "Missing or invalid API key. Send 'Authorization: Bearer <key>'." }
```

The response includes `WWW-Authenticate: Bearer`. Every response also sets
`X-Request-Id` (16 hex characters).

The gateway refuses to start if `NATLAS_API_KEYS` is empty, unless
`NATLAS_ALLOW_ANONYMOUS=true`. That flag is for a throwaway local process. The
Docker Compose gateway does not set it. vLLM and the ASR process inside Compose
do set it, and they publish no host port — only the gateway is reachable.

CORS headers are sent only when `NATLAS_CORS_ORIGINS` is a comma-separated
list. Methods allowed are `GET`, `POST`, and `OPTIONS`. Headers allowed are
`Authorization` and `Content-Type`. Credentials are not allowed.

## `GET /health`

No API key. The handler asks vLLM `GET {NATLAS_VLLM_URL}/health` (5 second
timeout) and, when ASR is a separate process, `GET {NATLAS_ASR_URL}/health`.
On the Modal deployment, ASR is in-process and reported as `"mode": "local"`.

HTTP 200 when both sides are up, HTTP 503 when either is down. The body is
JSON either way:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "llm": { "model": "NCAIR1/N-ATLaS", "status": "ok" },
  "asr": {
    "languages": ["ha", "ig", "yo", "en"],
    "models": {
      "ha": "NCAIR1/Hausa-ASR",
      "ig": "NCAIR1/Igbo-ASR",
      "yo": "NCAIR1/Yoruba-ASR",
      "en": "NCAIR1/NigerianAccentedEnglish"
    },
    "status": "ok",
    "mode": "local"
  },
  "attribution": "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies."
}
```

`status` is `"degraded"` when `llm.status` or `asr.status` is not `"ok"`. A
down upstream adds `"error"` with the httpx exception class name, not a
traceback of user content. The SDKs return this body with `ok: false` instead
of throwing.

## `GET /v1/models`

Proxied to vLLM `GET /v1/models`. The status code and body are passed through.
If vLLM cannot be reached, the gateway returns HTTP 502
`LLM upstream unreachable: <ExceptionName>`.

## `POST /v1/chat/completions`

JSON body, proxied to vLLM after two N-ATLaS-specific edits.

**`language` is removed before vLLM sees the body.** Clients may send
`ha`, `ig`, `yo`, `en`, or an alias (`hausa`, `igbo`, `yoruba`, `en-NG`, …).
A recognised value is kept for the log line only. An unrecognised value is
dropped (logged as no language) and does not fail the request. This field does
not change the prompt.

**`date_string` is injected** when `NATLAS_INJECT_DATE_STRING` is true (the
default). The gateway sets `chat_template_kwargs.date_string` to today's UTC
date in the same format as the model card example: `strftime("%d %b %Y")`,
for example `25 Sep 2026`. An existing `date_string` from the client is left
alone. vLLM then renders N-ATLaS's own chat template. The gateway does not
pass a custom `--chat-template`.

Other behaviour:

- `model` defaults to `NATLAS_LLM_MODEL`, which defaults to `NCAIR1/N-ATLaS`.
- When `stream` is true and `NATLAS_INCLUDE_USAGE` is true (the default), the
  gateway sets `stream_options.include_usage` so the last SSE event can carry
  token counts.
- Non-streaming: the gateway reads `usage` from the JSON for its log, then
  returns vLLM's body unchanged.
- Streaming: bytes are relayed as `text/event-stream` with `Cache-Control: no-cache` and `X-Accel-Buffering: no`. The gateway scans each SSE line only for a `usage` object. Deltas are not stored.
- A non-JSON body is HTTP 400 `Request body must be JSON.`
- vLLM down is HTTP 502, same shape as `/v1/models`.
- An upstream HTTP error status on a stream is read fully and returned with that status. It is not wrapped.

The log line records feature, path, language, model, latency, token counts,
and a 12-hex SHA-256 prefix of the API key (`k_` + 12 hex chars). It does not
record messages, completions, or the key itself. See
`serve/natlas_serve/observability.py`.

### Minimal body

```json
{
  "model": "NCAIR1/N-ATLaS",
  "messages": [{ "role": "user", "content": "Sannu!" }],
  "language": "ha",
  "stream": false
}
```

Standard OpenAI fields the gateway forwards (because it proxies the JSON)
include `temperature`, `max_tokens`, `top_p`, and `stop`. The gateway does not
re-validate them; vLLM does.

## `POST /v1/audio/transcriptions`

Multipart form. `language` is required. There is no single multilingual ASR
checkpoint: the code picks the model.

| `language` | Also accepted                                                            | Model                            |
| ---------- | ------------------------------------------------------------------------ | -------------------------------- |
| `ha`       | `hau`, `hausa`, `ha-NG`                                                  | `NCAIR1/Hausa-ASR`               |
| `ig`       | `ibo`, `igbo`, `ig-NG`                                                   | `NCAIR1/Igbo-ASR`                |
| `yo`       | `yor`, `yoruba`, `yorùbá`, `yo-NG`                                       | `NCAIR1/Yoruba-ASR`              |
| `en`       | `eng`, `english`, `en-NG`, `en-US`, `en-GB`, `nigerian english`, `naija` | `NCAIR1/NigerianAccentedEnglish` |

Matching is case-insensitive. `_` is treated as `-`. Anything else is HTTP 400
with `Unsupported language ...`.

| Field             | Required | Notes                                       |
| ----------------- | -------- | ------------------------------------------- |
| `file`            | yes      | Any container ffmpeg can read               |
| `language`        | yes      | Selects the checkpoint                      |
| `response_format` | no       | `json` (default), `text`, or `verbose_json` |
| `model`           | no       | Accepted and ignored                        |
| `prompt`          | no       | Accepted and ignored                        |
| `temperature`     | no       | Accepted and ignored                        |

`json` returns `{ "text": "..." }`.

`text` returns the transcript as `text/plain`.

`verbose_json` adds:

| Field      | Meaning                                |
| ---------- | -------------------------------------- |
| `task`     | always `"transcribe"`                  |
| `language` | normalised code                        |
| `duration` | seconds of audio after decode          |
| `model`    | NCAIR1 repo id that ran                |
| `chunks`   | how many Whisper windows were stitched |

Audio larger than `NATLAS_MAX_UPLOAD_BYTES` (default 64 MiB, 67108864) is
HTTP 413. A file ffmpeg cannot decode is HTTP 400.

Before the model runs, `natlas_serve.audio` converts the bytes to 16 kHz mono
and splits them near silence so each piece stays under Whisper's hard 30-second
window. The target length is `NATLAS_ASR_CHUNK_SECONDS` (default 25). ASR runs
on CPU by default (`NATLAS_ASR_DEVICE=cpu`) so it does not fight vLLM for the
GPU.

On Modal, this route is mounted in the gateway process behind the same Bearer
dependency. In Docker Compose, the gateway reads the raw body and proxies it
to the internal ASR service. The external shape is the same.

## What is not implemented

There is no `/v1/embeddings`, no `/v1/audio/translations` (OpenAI's
speech-to-English endpoint), and no tool-calling schema of our own. Translation
between Hausa, Igbo, Yorùbá, and Nigerian English is a chat prompt in the
SDKs, not a gateway route.
