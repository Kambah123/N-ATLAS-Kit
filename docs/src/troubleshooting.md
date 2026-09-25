# Limits and troubleshooting

## Cold starts

The Modal deployment scales to zero. `scaledown_window` keeps the container
for five minutes after the last request (`serve/modal_app.py`). After that,
the next request waits while vLLM loads N-ATLaS into GPU memory. The first
start on an empty volume also downloads the weights (on the order of 15 GB).

`modal_app.py` waits up to 30 minutes for vLLM's `/health` during container
enter, then Modal will route traffic. Your client does not wait that long.
The SDK default timeout is 60 seconds (`NATLAS_TIMEOUT_MS`). A cold start
often looks like `TimeoutError` or a hung curl, not like an auth failure.

What to do:

- Hit `GET /health` first and give it several minutes if the deployment has
  been idle. `/health` itself cannot succeed until vLLM is up, because the
  gateway process starts only after vLLM is healthy — but the TCP connection
  may sit until Modal finishes the cold start.
- Raise `NATLAS_TIMEOUT_MS` for that first call (it is milliseconds in both
  SDKs).
- For a demo, the operator can set `min_containers` on the Modal class. The
  app deliberately does not set it, because a warm GPU is a standing bill.
  See the cost notes in `serve/README.md` before turning that on.

Docker Compose does not scale to zero. The first `docker compose up` still
waits on the vLLM health check (20 minute start period) while weights download
into the `hf-cache` volume.

## Auth errors

| Symptom                               | Cause                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| HTTP 401 `Missing or invalid API key` | No `Authorization` header, wrong scheme, or the token is not in `NATLAS_API_KEYS`                                      |
| SDK `AuthError`                       | HTTP 401 or 403                                                                                                        |
| Gateway process exits at startup      | `NATLAS_API_KEYS` is empty and `NATLAS_ALLOW_ANONYMOUS` is not true. The message includes `refuses to start wide open` |
| Modal deploy fails on `natlas-api`    | The secret is missing or does not contain the key `NATLAS_API_KEYS`                                                    |
| Hub 401 while vLLM starts             | `HF_TOKEN` inside the `natlas-hf` secret is missing, or that Hugging Face user has not accepted a model card           |

The header must be exactly `Authorization: Bearer <key>` with a space. Keys
are compared in constant time. Extra whitespace around a key in the
environment is stripped when the settings object is built from a comma-separated
list; a key with an embedded newline is rejected by the JavaScript client as
`BadRequestError`.

`/health` never checks the key. A 401 on `/health` means you are not talking
to this gateway.

The client will still send a key on `/health` if you configured one. That is
harmless. The route does not require it.

## Language codes

Chat and transcription do not accept an open-ended language list. The four
codes are `ha`, `ig`, `yo`, and `en`.

| Code | Language         | ASR model                        |
| ---- | ---------------- | -------------------------------- |
| `ha` | Hausa            | `NCAIR1/Hausa-ASR`               |
| `ig` | Igbo             | `NCAIR1/Igbo-ASR`                |
| `yo` | Yorùbá           | `NCAIR1/Yoruba-ASR`              |
| `en` | Nigerian English | `NCAIR1/NigerianAccentedEnglish` |

Aliases accepted by both the gateway and the SDKs include `hausa`, `igbo`,
`yoruba`, `yorùbá`, `english`, `nigerian english`, `naija`, and region tags
`ha-NG`, `ig-NG`, `yo-NG`, `en-NG`, `en-US`, `en-GB`. ISO 639-2 forms `hau`,
`ibo`, `yor`, and `eng` work too. `_` is normalised to `-`.

On **transcription**, an unknown language is HTTP 400 from the gateway, or
`BadRequestError` from the SDK before the request is sent.

On **chat**, `language` is optional. The gateway uses it only for logs. An
unknown chat language is discarded, not rejected. It does not switch the model.
The model is always `NATLAS_LLM_MODEL` (default `NCAIR1/N-ATLaS`) unless the
request sets `model`.

`translate` / `summarize` / `detect_language` only know these four languages.
`detectLanguage` returns `language: null` (Python: `None`) when the model
reply is not a code. That is not a failure and not a guess.

## Other limits

| Limit                       | Value in code                      | What you see                                                                               |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Whisper window              | 30 seconds per forward pass        | Longer files are chunked near silence. Default target is 25 s (`NATLAS_ASR_CHUNK_SECONDS`) |
| Sample rate                 | 16 kHz mono                        | The gateway converts. You can send WhatsApp ogg/opus, mp3, m4a, wav, flac, webm            |
| Upload size                 | 64 MiB (`NATLAS_MAX_UPLOAD_BYTES`) | HTTP 413                                                                                   |
| Context the card recommends | 8092 tokens                        | vLLM is asked for `max-model-len` 8192                                                     |
| Client retries on chat      | off                                | POSTs are not retried unless you opt in. A retry would run the model twice                 |
| Gateway request timeout     | 120 s (`NATLAS_REQUEST_TIMEOUT`)   | Upstream calls use this httpx timeout                                                      |
| Logged fields               | metadata only                      | Prompts, transcripts, audio, and raw API keys are not log fields                           |

## HTTP 502

`LLM upstream unreachable` or `ASR upstream unreachable` means the gateway
process is alive and vLLM or the ASR service is not. On Compose, wait until
the vLLM health check is green. On Modal, you are usually still inside a cold
start, or vLLM exited because the token cannot read `NCAIR1/N-ATLaS` or the
GPU is too small. `modal run serve/modal_preflight.py` distinguishes a bad
token from a GPU allocation error.

## Empty transcripts

`voiceChat` / `voice_chat` refuse to call the chat model when the transcript
is empty or whitespace. The error is `BadRequestError`: `The transcription was
empty, so there is nothing to reply to.` The example apps do the same for
translation. Silence is not filled in with a sample sentence.
