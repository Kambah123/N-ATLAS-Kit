# `natlas`

Python client for **N-ATLaS**, Nigeria's sovereign multilingual LLM — Hausa,
Igbo, Yorùbá and Nigerian English — and its four ASR models.

Part of [N-ATLAS Kit](https://github.com/Kambah123/N-ATLAS-Kit). Point
`NAtlas` or `AsyncNAtlas` at a
[`/serve`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/serve) gateway.
There is no public hosted API, and this package will not call any other
vendor's model.

---

## Install

```bash
pip install natlas
```

Python 3.10+. Sync and async clients both use `httpx`. Responses are Pydantic
models.

`natlas[cli]` and `natlas[local]` are reserved extras. The CLI is not wired
up, and `backend="local"` raises: loading the weights with `transformers`
is a later milestone and needs a GPU plus `HF_TOKEN`.

## Quickstart

```python
import os
from natlas import NAtlas

natlas = NAtlas(
    base_url=os.environ["NATLAS_BASE_URL"],  # http://localhost:8080 or .../v1
    api_key=os.environ["NATLAS_API_KEY"],
)

reply = natlas.chat(
    messages=[{"role": "user", "content": "Menene ake nufi da gwagwarmaya?"}],
    language="ha",
)
print(reply.content)

for chunk in natlas.chat(
    messages=[{"role": "user", "content": "Sannu!"}],
    language="ha",
    stream=True,
):
    print(chunk.delta, end="", flush=True)

natlas.transcribe(audio=b"...", language="ha", filename="note.ogg")
natlas.translate(text="Good morning", from_="en", to="yo")
natlas.close()
```

Async uses the same methods. `stream=True` returns an async iterator, so you
both await the call and iterate it:

```python
from natlas import AsyncNAtlas

async with AsyncNAtlas() as natlas:
    reply = await natlas.chat(
        messages=[{"role": "user", "content": "Sannu!"}],
        language="ha",
    )
    async for chunk in await natlas.chat(
        messages=[{"role": "user", "content": "Sannu!"}],
        stream=True,
    ):
        print(chunk.delta, end="", flush=True)
```

If you omit the arguments, the constructor reads the environment.

| Env var              | Meaning                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `NATLAS_BASE_URL`    | Gateway origin, with or without `/v1`                                               |
| `NATLAS_API_KEY`     | Bearer token the gateway expects                                                    |
| `NATLAS_BACKEND`     | `openai-compatible` (default) or `hf-endpoint`                                      |
| `NATLAS_MODEL`       | Defaults to `NCAIR1/N-ATLaS`. Must start with `NCAIR1/`                             |
| `NATLAS_TIMEOUT_MS`  | Milliseconds, shared with the JS SDK. Default 60000. The constructor `timeout` is **seconds** |
| `NATLAS_MAX_RETRIES` | Extra attempts for idempotent GETs. Default `2`                                    |

`GET /health` does not require a key. A trailing slash on the base URL is
ignored. `http://host` and `http://host/v1` both work; health is always
`http://host/health`.

## What you can call

- `chat(messages, language=..., stream=..., temperature=..., max_tokens=..., top_p=..., stop=..., model=...)`
  — `stream=False` (the default) returns a `ChatResult`. `stream=True` returns
  an iterator of `ChatStreamChunk` (`delta`, `finish_reason`, `usage`).
- `transcribe(audio, language, filename=..., response_format=...)` — `language`
  is required and selects the monolingual ASR model (`ha`, `ig`, `yo`, `en`,
  plus aliases such as `hausa` and `Yorùbá`). `audio` is a path, `bytes`,
  `bytearray`, or a binary file object. `response_format` is `json` (default),
  `text`, or `verbose_json`.
- `list_models()` — `GET /v1/models`.
- `health()` — `GET /health`. HTTP 503 with a JSON body is returned with
  `ok=False`, not raised.
- `translate(text, from_, to)`, `summarize(text, language)`, and
  `detect_language(text)` ask N-ATLaS with an English prompt that names the
  language. They are not a separate translation or detection model.
  `detect_language` sets `language` to `None` when the reply is not a
  recognised code.
- `voice_chat(audio, language)` transcribes, then chats. The result is
  `transcript`, `reply`, `language`, and `model`. An empty transcript is an
  error; nothing is invented in its place.

`language` on chat is for the gateway's logs. The gateway strips it before
vLLM and injects `date_string` itself.

## Errors

| Class             | When                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `AuthError`       | HTTP 401 or 403                                                         |
| `RateLimitError`  | HTTP 429. `retry_after_s` comes from `Retry-After` when present        |
| `BadRequestError` | Other 4xx, including local validation                                   |
| `ServerError`     | 5xx, or a success body that is not the JSON the gateway promised       |
| `NetworkError`    | DNS, connection, or other transport failure                            |
| `TimeoutError`    | The configured timeout elapsed, or HTTP 408                            |
| `AbortError`      | Reserved. Cancelling an async task still raises `CancelledError`      |

All of them subclass `NAtlasError`. Messages never include the API key, the
prompt, or a transcript.

## Retries

`list_models` and `health` retry on 408, 429, 500, 502, 503, 504, network
errors, and timeouts. Chat and transcription do **not** retry unless you pass
`max_retries` on that call or construct the client with
`retry_non_idempotent=True`. A retry can run the model twice.

Backoff is 0.2 s × 2^attempt, capped at 8 seconds, plus up to 0.1 s of jitter.
A numeric `Retry-After` on 429 replaces that delay.

## Backends

- `openai-compatible` — the `/serve` gateway. Default.
- `hf-endpoint` — same HTTP shapes, for an OpenAI-compatible Hugging Face
  endpoint serving `NCAIR1/N-ATLaS`.
- `official` and `local` — both raise. There is no public NCAIR API yet, and
  this release does not load the weights.

## Runnable examples

From the repo root, after `pip install -e packages/python-sdk`:

```bash
python examples/python/chat.py
python examples/python/stream.py
python examples/python/transcribe.py path/to/note.ogg
```

Each script exits if `NATLAS_BASE_URL` or `NATLAS_API_KEY` is missing. They
never print a fabricated reply.

## Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

ruff check . && ruff format --check .
mypy src
pytest
```

## Licence

Code: **Apache-2.0**.

The models are **not** Apache-2.0 — they carry Awarri's Open-Source Research and
Innovation License, which requires attribution and caps you at 1,000 active
end-users per 30 days. See
[`NOTICE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/NOTICE).

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation
> and Digital Economy, and powered by Awarri Technologies.
