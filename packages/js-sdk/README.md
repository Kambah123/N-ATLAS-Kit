# `n-atlas`

JavaScript / TypeScript client for **N-ATLaS**, Nigeria's sovereign multilingual
LLM — Hausa, Igbo, Yorùbá and Nigerian English — and its four ASR models.

Part of [N-ATLAS Kit](https://github.com/Kambah123/N-ATLAS-Kit). The client talks
to a [`/serve`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/serve)
gateway (or any OpenAI-compatible endpoint serving the `NCAIR1` models). There
is no public hosted API, and this package will not call any other vendor's model.

---

## Install

```bash
npm install n-atlas      # or: pnpm add n-atlas / yarn add n-atlas
```

That registry install works after the package is published. It is not on npm yet.

Not on npm/PyPI yet? Install from GitHub. The repository must be public.

```bash
pnpm add "github:Kambah123/N-ATLAS-Kit#path:packages/js-sdk"
```

`npm install` of the repository URL installs the private workspace root, not `n-atlas`. The `pnpm` command above is the one that selects `packages/js-sdk` and builds it.

Node 20+ and modern browsers. ESM and CJS, built with tsup. The runtime
dependency is `fetch` (global in Node 20+ and browsers). Reading a filesystem
path uses Node's `fs` and is not available in the browser — pass a `Blob`,
`File`, `ArrayBuffer`, or `Uint8Array` there instead.

## Quickstart

```ts
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL, // http://localhost:8080 or .../v1
  apiKey: process.env.NATLAS_API_KEY,
});

const reply = await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
});

for await (const chunk of await natlas.chat({
  messages: [{ role: 'user', content: 'Sannu!' }],
  language: 'ha',
  stream: true,
})) {
  process.stdout.write(chunk.delta);
}

await natlas.transcribe({ audio: voiceNote, language: 'ha' });
await natlas.translate({ text: 'Good morning', from: 'en', to: 'yo' });
```

`baseURL` and `apiKey` fall back to `NATLAS_BASE_URL` and `NATLAS_API_KEY`.
A trailing `/v1` is optional. `GET /health` is always on the host root, and it
does not require a key (the client still sends one if you configured it).

| Env var              | Meaning                                                 |
| -------------------- | ------------------------------------------------------- |
| `NATLAS_BASE_URL`    | Gateway origin, with or without `/v1`                   |
| `NATLAS_API_KEY`     | Bearer token the gateway expects                        |
| `NATLAS_BACKEND`     | `openai-compatible` (default) or `hf-endpoint`          |
| `NATLAS_MODEL`       | Defaults to `NCAIR1/N-ATLaS`. Must start with `NCAIR1/` |
| `NATLAS_TIMEOUT_MS`  | Milliseconds. Default `60000`                           |
| `NATLAS_MAX_RETRIES` | Extra attempts for idempotent GETs. Default `2`         |

Constructor fields use the same names as the TypeScript options: `baseURL`,
`apiKey`, `backend`, `model`, `timeout` (milliseconds), `maxRetries`,
`retryNonIdempotent`. A per-call `timeout` overrides the client. Pass
`signal: AbortSignal` to cancel; an aborted call is never retried.

## What you can call

- `chat({ messages, language, stream, temperature, maxTokens, topP, stop, model })`
  — non-streaming returns `{ content, role, finishReason, model, usage }`.
  `stream: true` resolves to an async iterable of `{ delta }` once the gateway
  accepts the request. HTTP errors reject that promise, before iteration.
- `transcribe({ audio, language, filename, responseFormat })` — `language` is
  required and selects the monolingual ASR model. Aliases such as `hausa`,
  `Igbo`, `Yorùbá`, and `Nigerian English` are accepted. `audio` is a path
  (Node), `Blob` / `File`, `Buffer`, `Uint8Array`, or `ArrayBuffer`.
  `responseFormat` is `json` (default), `text`, or `verbose_json`.
- `listModels()` — `GET /v1/models`.
- `health()` — `GET /health`. A degraded gateway answers 503 with JSON. That
  is returned with `ok: false`, not thrown.
- `translate({ text, from, to })`, `summarize({ text, language })`, and
  `detectLanguage(text)` ask N-ATLaS with an English prompt that names the
  language. They are not a separate translation or detection model.
  `detectLanguage` returns `language: null` when the reply is not a recognised
  code — it does not guess.
- `voiceChat({ audio, language })` transcribes, then chats. The result is
  `{ transcript, reply, language, model }`. An empty transcript is an error.

`language` on chat is forwarded for the gateway's logs and stripped before
vLLM. You do not send `date_string`; the gateway injects that.

## Errors

Every failure is an `NAtlasError`. Catch the subclass you care about:

| Class             | When                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `AuthError`       | HTTP 401 or 403                                                       |
| `RateLimitError`  | HTTP 429. `retryAfterMs` comes from `Retry-After` when present        |
| `BadRequestError` | Other 4xx, including local validation (empty audio, unknown language) |
| `ServerError`     | 5xx, or a 2xx body that is not the JSON the gateway promised          |
| `NetworkError`    | DNS, connection, or other transport failure                           |
| `TimeoutError`    | The configured timeout elapsed, or HTTP 408                           |
| `AbortError`      | The supplied `AbortSignal` fired                                      |

Messages never include the API key, the prompt, or a transcript.

## Retries

`listModels` and `health` retry on 408, 429, 500, 502, 503, 504, network
errors, and timeouts. Chat and transcription are POST and are **not** retried
unless you pass `maxRetries` on that call or set `retryNonIdempotent: true`.
A retry can run the model twice.

Backoff is 200 ms × 2^attempt, capped at 8 seconds, plus up to 100 ms of
jitter. A numeric `Retry-After` on 429 replaces that delay.

## Backends

- `openai-compatible` — the `/serve` gateway. This is the default.
- `hf-endpoint` — same request shapes, for an OpenAI-compatible Hugging Face
  endpoint that serves `NCAIR1/N-ATLaS`.
- `official` — reserved. Constructing the client throws until NCAIR publishes
  an API. It does not fall back to another model.

## Runnable examples

From the repo root, after `pnpm --filter n-atlas build`:

```bash
node examples/js/chat.mjs
node examples/js/stream.mjs
node examples/js/transcribe.mjs path/to/note.ogg
```

Each script exits with a message if `NATLAS_BASE_URL` or `NATLAS_API_KEY` is
missing. They never print a fabricated reply.

## Development

```bash
pnpm install
pnpm --filter n-atlas test
pnpm --filter n-atlas lint
pnpm --filter n-atlas typecheck
pnpm --filter n-atlas build
```

## Licence

Code: **Apache-2.0**.

The models are **not** Apache-2.0 — they carry Awarri's Open-Source Research and
Innovation License, which requires attribution and caps you at 1,000 active
end-users per 30 days. See
[`NOTICE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/NOTICE).

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation
> and Digital Economy, and powered by Awarri Technologies.
