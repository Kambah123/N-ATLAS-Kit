# Python SDK

Package: `natlas`. Source: `packages/python-sdk`. Python 3.10+. Sync and async
clients both use `httpx`. Responses are Pydantic models.

`pip install natlas` works after the package is published. It is not on PyPI
yet. Not on npm/PyPI yet? Install from GitHub (the repository must be public):
`pip install "git+https://github.com/Kambah123/N-ATLAS-Kit.git#subdirectory=packages/python-sdk"`.

```python
from natlas import NAtlas

with NAtlas() as natlas:
    reply = natlas.chat(
        messages=[{"role": "user", "content": "Sannu!"}],
        language="ha",
    )
```

If you omit `base_url` and `api_key`, the constructor reads
`NATLAS_BASE_URL` and `NATLAS_API_KEY`. A missing base URL raises
`NAtlasError` before any socket is opened.

`AsyncNAtlas` has the same methods. They are coroutines. Use it as
`async with AsyncNAtlas() as natlas`. For streaming, await the call and then
async-iterate:

```python
async for chunk in await natlas.chat(messages=messages, stream=True):
    print(chunk.delta, end="", flush=True)
```

Call `close()` if you do not use the context manager. The sync client closes
the `httpx.Client` it created. Pass your own `http_client` if you need to
share a connection pool; in that case the SDK does not close it.

## Environment

| Variable             | Default             | Meaning                                         |
| -------------------- | ------------------- | ----------------------------------------------- |
| `NATLAS_BASE_URL`    | none                | Origin, with or without `/v1`                   |
| `NATLAS_API_KEY`     | none                | Bearer token                                    |
| `NATLAS_BACKEND`     | `openai-compatible` | See below                                       |
| `NATLAS_MODEL`       | `NCAIR1/N-ATLaS`    | Must start with `NCAIR1/`                       |
| `NATLAS_TIMEOUT_MS`  | `60000`             | Milliseconds. Divided by 1000 for httpx         |
| `NATLAS_MAX_RETRIES` | `2`                 | Extra attempts for idempotent GETs. Integer 0–8 |

The constructor argument `timeout` is **seconds**, not milliseconds. Per-call
`timeout` is also seconds. This is the one unit that differs from the
JavaScript SDK. The environment variable is shared and stays in milliseconds
so a single `.env` works for both.

`max_retries` and `retry_non_idempotent` match the JavaScript client.

## Backends

| Value               | Behaviour                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `openai-compatible` | Default. The `/serve` gateway                                                                   |
| `hf-endpoint`       | Same HTTP shapes, for an OpenAI-compatible Hugging Face endpoint serving an `NCAIR1/` model     |
| `official`          | Raises `NAtlasError`. No public NCAIR API                                                       |
| `local`             | Raises `NAtlasError`. In-process `transformers` is not implemented. `natlas[local]` is reserved |

## Methods

Names are snake_case. `from` is spelled `from_` because it is a Python keyword.

### `chat`

```python
reply = natlas.chat(
    messages=[{"role": "user", "content": "Sannu!"}],
    language="ha",
    temperature=0.3,
    max_tokens=256,
    top_p=None,
    stop=None,
    model=None,
    stream=False,
)
```

`stream=False` returns `ChatResult`: `content`, `role`, `finish_reason`,
`model`, `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`), `id`,
`raw`.

`stream=True` returns an iterator of `ChatStreamChunk` (`delta`,
`finish_reason`, `model`, `usage`, `raw`). On the async client it returns an
async iterator, and the call itself is awaited.

`language` is optional and is for the gateway log. The gateway removes it
before vLLM and injects `date_string` itself.

### `transcribe`

```python
heard = natlas.transcribe(
    audio="voice-note.ogg",
    language="ha",
    filename=None,
    response_format="json",
)
```

`audio` is a filesystem path, `bytes`, `bytearray`, or a binary file object.
`language` is required and accepts the same aliases as the gateway (`hausa`,
`Yorùbá`, `en-NG`, …). `response_format` is `json`, `text`, or `verbose_json`.

`Transcription` has `text`, `language`, `task`, `duration`, `model`, `chunks`,
and `raw`. Duration, model, and chunk count come from `verbose_json`.

### Helpers

These call `chat` with an English system prompt. They are not a separate
translation or language-id model, and the prompt text has not had
native-speaker review.

| Method                                          | Defaults                               | Returns                                                       |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `translate(text, from_, to)`                    | temperature `0.2`, `max_tokens` `1024` | `Translation`: `text`, `source`, `target`, `model`            |
| `summarize(text, language)`                     | temperature `0.3`, `max_tokens` `512`  | `Summary`: `text`, `language`, `model`                        |
| `detect_language(text)`                         | temperature `0`, `max_tokens` `16`     | `LanguageDetection`: `language` or `None`, `text`, `model`    |
| `voice_chat(audio, language, instruction=None)` | temperature `0.3`, `max_tokens` `512`  | `VoiceChatResult`: `transcript`, `reply`, `language`, `model` |

`from_` and `to` must differ. Empty text raises `BadRequestError` locally.
`detect_language` leaves `language` as `None` when the reply is not a
recognised code. `voice_chat` raises `BadRequestError` when the transcript is
empty. Nothing is substituted.

### `list_models` and `health`

`list_models()` is `GET /v1/models`. `health()` is `GET /health`. HTTP 503 with
a JSON body is returned as `HealthStatus` with `ok=False`, not raised.

## Errors

| Class             | When                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `AuthError`       | HTTP 401 or 403                                                  |
| `RateLimitError`  | HTTP 429. `retry_after_s` from `Retry-After` when present        |
| `BadRequestError` | Other 4xx, and local validation                                  |
| `ServerError`     | 5xx, or a success body that is not the expected JSON             |
| `NetworkError`    | DNS, connection, or other transport failure                      |
| `TimeoutError`    | The timeout elapsed, or HTTP 408                                 |
| `AbortError`      | Reserved. Cancelling an async task still raises `CancelledError` |

All subclass `NAtlasError` (`status`, `request_id`, `body`, `code`). Messages
do not include the API key, the prompt, or a transcript.

## Retries

`list_models` and `health` retry on 408, 429, 500, 502, 503, 504, network
errors, and timeouts. Chat and transcription do not retry unless you pass
`max_retries` on that call or construct the client with
`retry_non_idempotent=True`.

Backoff is 0.2 s × 2^attempt, capped at 8 seconds, plus up to 0.1 s of jitter.
A numeric `Retry-After` on HTTP 429 replaces that delay.

## Constants

`LLM_MODEL_ID`, `LLM_CONTEXT_TOKENS` (8092), `ASR_MODEL_IDS`,
`ASR_MAX_SEGMENT_SECONDS` (30), `ASR_SAMPLE_RATE` (16000), `LANGUAGES`,
`LANGUAGE_NAMES`, `BACKENDS`, `ATTRIBUTION`, `is_language`, `__version__`.

The CLI extras in `pyproject.toml` (`natlas[cli]`) are not wired to a console
script in this version.
