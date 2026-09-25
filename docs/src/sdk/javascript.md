# JavaScript SDK

Package: `n-atlas`. Source: `packages/js-sdk`. Node.js 20+ and modern browsers.
ESM and CJS. The runtime dependency is global `fetch`. Reading a filesystem
path uses `node:fs` and only works on Node.

`npm install n-atlas` works after the package is published. It is not on npm
yet. Not on npm/PyPI yet? Install from GitHub (the repository must be public):
`pnpm add "github:Kambah123/N-ATLAS-Kit#path:packages/js-sdk"`. `npm install` of
the repository URL installs the private workspace root, not `n-atlas`.

```ts
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL,
  apiKey: process.env.NATLAS_API_KEY,
});
```

Constructor fields override the environment. A missing `baseURL` throws
`NAtlasError` before any request: there is no public default host baked into
the client.

## Environment

| Variable             | Default             | Meaning                                                        |
| -------------------- | ------------------- | -------------------------------------------------------------- |
| `NATLAS_BASE_URL`    | none                | Origin, with or without a trailing `/v1`                       |
| `NATLAS_API_KEY`     | none                | Bearer token. Omit only if the gateway allows anonymous access |
| `NATLAS_BACKEND`     | `openai-compatible` | `openai-compatible` or `hf-endpoint`                           |
| `NATLAS_MODEL`       | `NCAIR1/N-ATLaS`    | Must start with `NCAIR1/`                                      |
| `NATLAS_TIMEOUT_MS`  | `60000`             | Milliseconds                                                   |
| `NATLAS_MAX_RETRIES` | `2`                 | Extra attempts for idempotent GETs. Integer 0–8                |

`new NAtlas({ timeout, maxRetries, retryNonIdempotent, backend, model })` uses
the same units: `timeout` is milliseconds.

`backend: 'official'` throws. There is no public NCAIR HTTP API to call, and
the client does not substitute another vendor. `hf-endpoint` uses the same URL
rules as the gateway. A bare Hugging Face LLM endpoint will not have
`/v1/audio/transcriptions`.

## `chat`

```ts
const result = await natlas.chat({
  messages: [{ role: 'user', content: 'Sannu!' }],
  language: 'ha',
  temperature: 0.3,
  maxTokens: 256,
});
```

`result` is `{ id, content, role, finishReason, model, usage, raw }`.
`usage` is `{ promptTokens, completionTokens, totalTokens }` or `null`.
`raw` is the JSON object the gateway returned.

`messages` must be a non-empty array of `{ role, content }` with role
`system`, `user`, or `assistant` and non-empty string content.

`stream: true` resolves to an async iterable of
`{ delta, finishReason, model, usage, raw }`. HTTP errors reject that promise
before iteration starts. `delta` is `''` on events that only carry a role,
finish reason, or usage.

`language` is normalised (`hausa` → `ha`) and sent for the gateway log. `model`
defaults to the client model and must start with `NCAIR1/`. `maxTokens` is sent
as `max_tokens`. `topP` is sent as `top_p`. `stop` is a string or an array of
strings.

## `transcribe`

```ts
const heard = await natlas.transcribe({
  audio: voiceNote,
  language: 'ha',
  filename: 'note.ogg',
  responseFormat: 'json',
});
```

`language` is required. `audio` is a Node path, `Blob`, `File`, `Buffer`,
`Uint8Array`, or `ArrayBuffer`. An empty payload throws `BadRequestError`
locally. `responseFormat` is `json` (default), `text`, or `verbose_json`.

The result is `{ text, language, task, duration, model, chunks, raw }`.
`duration`, `model`, and `chunks` are filled from `verbose_json` and `null`
otherwise.

## `translate`, `summarize`, `detectLanguage`, `voiceChat`

These are chat prompts, not separate models. The prompts are English
instructions that name the target language. They have not had native-speaker
review.

| Method                                         | What it sends                                                                                     | Result                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `translate({ text, from, to })`                | System prompt asking for a translation only. Default temperature `0.2`, `maxTokens` `1024`        | `{ text, from, to, model }`              |
| `summarize({ text, language })`                | System prompt asking for a summary in that language. Default temperature `0.3`, `maxTokens` `512` | `{ text, language, model }`              |
| `detectLanguage(text)`                         | Asks for one of `ha`, `ig`, `yo`, `en`. Temperature `0`, `maxTokens` `16`                         | `{ language, text, model }`              |
| `voiceChat({ audio, language, instruction? })` | Transcribes, then chats. Default reply instruction is to answer in that language                  | `{ transcript, reply, language, model }` |

`from` and `to` must be different languages. Empty `text` throws locally.
`detectLanguage` sets `language` to `null` when the reply is not a recognised
code. It does not guess a fourth option into existence beyond the small alias
list (`ha`, `Hausa.`, `The language is Yoruba` all parse; an unrelated
sentence does not).

`voiceChat` throws `BadRequestError` when the transcript is empty or
whitespace. It does not invent a reply.

## `listModels` and `health`

`listModels()` is `GET /v1/models`. `health()` is `GET /health`. A 503 health
body is returned with `ok: false`.

## Errors

Every failure is an `NAtlasError`. `status` is the HTTP status, or `null` for
local failures. `requestId` is the gateway `X-Request-Id` when present.
Messages do not include the API key, the prompt, or a transcript.

| Class             | When                                                            |
| ----------------- | --------------------------------------------------------------- |
| `AuthError`       | HTTP 401 or 403                                                 |
| `RateLimitError`  | HTTP 429. `retryAfterMs` from `Retry-After` when it is a number |
| `BadRequestError` | Other 4xx, and local validation                                 |
| `ServerError`     | 5xx, or a 2xx body that is not the JSON the client expected     |
| `NetworkError`    | DNS, connection, or other transport failure                     |
| `TimeoutError`    | The timeout elapsed, or HTTP 408                                |
| `AbortError`      | The supplied `AbortSignal` fired. Never retried                 |

`isNAtlasError(error)` is the type guard.

## Retries and cancellation

`listModels` and `health` retry on 408, 429, 500, 502, 503, 504, network
errors, and timeouts. Chat and transcription are POST and are not retried
unless that call passes `maxRetries` or the client was constructed with
`retryNonIdempotent: true`. A retry can run the model twice.

Backoff starts at 200 ms and doubles, capped at 8 seconds, plus up to 100 ms
of jitter. A numeric `Retry-After` on HTTP 429 replaces that delay.

Pass `signal` to cancel. An aborted attempt is not retried. Per-call `timeout`
and `maxRetries` override the client for that call.

## Constants

Exported from the package entry: `LANGUAGES`, `LANGUAGE_NAMES`, `LLM_MODEL_ID`
(`NCAIR1/N-ATLaS`), `LLM_CONTEXT_TOKENS` (`8092`), `ASR_MODEL_IDS`,
`ASR_MAX_SEGMENT_SECONDS` (`30`), `ASR_SAMPLE_RATE` (`16000`), `BACKENDS`,
`ATTRIBUTION`, `isLanguage`, `VERSION`.

`LLM_CONTEXT_TOKENS` is the model card's usable context. `config.json` reports
`max_position_embeddings` of 131072. The gateway asks vLLM for 8192.
