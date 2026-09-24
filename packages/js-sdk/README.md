# `n-atlas`

JavaScript / TypeScript SDK for **N-ATLaS**, Nigeria's sovereign multilingual
LLM — Hausa, Igbo, Yorùbá and Nigerian English — and its four ASR models.

Part of [N-ATLAS Kit](https://github.com/Kambah123/N-ATLAS-Kit).

> **🚧 Scaffold.** The package currently exports verified model metadata only.
> The `NAtlas` client lands in the next milestone — the shape below is the
> committed API, not something you can `npm install` and use yet.

---

## Install

```bash
npm install n-atlas      # or: pnpm add n-atlas / yarn add n-atlas / bun add n-atlas
```

Node 18+, browsers and edge runtimes. ESM and CJS. Zero heavy dependencies.

## Planned API

```ts
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL, //  e.g. your /serve gateway
  apiKey: process.env.NATLAS_API_KEY,
  backend: 'openai-compatible', // | 'hf-endpoint' | 'official'
});

// Streaming chat
for await (const chunk of await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
  temperature: 0.3,
  maxTokens: 512,
  stream: true,
})) {
  process.stdout.write(chunk.delta);
}

await natlas.translate({ text: 'Good morning', from: 'en', to: 'yo' });
await natlas.summarize({ text: longArticle, language: 'ig' });
await natlas.detectLanguage('Kedu ka ị mere?');
await natlas.transcribe({ audio: voiceNote, language: 'ha' }); // File | Blob | Buffer
await natlas.voiceChat({ audio: voiceNote, language: 'ha' }); // transcript + reply
```

Also planned: typed errors (`AuthError`, `RateLimitError`, `BackendError`),
retries with exponential backoff, timeouts and `AbortSignal` support.

## Available today

```ts
import {
  LLM_MODEL_ID, // 'NCAIR1/N-ATLaS'
  LLM_CONTEXT_TOKENS, // 8092
  ASR_MODEL_IDS, // { ha, ig, yo, en } -> NCAIR1 repos
  ASR_MAX_SEGMENT_SECONDS, // 30
  ASR_SAMPLE_RATE, // 16000
  LANGUAGES,
  LANGUAGE_NAMES,
  BACKENDS,
  ATTRIBUTION,
  isLanguage,
} from 'n-atlas';
```

## You need a backend

There is **no public hosted N-ATLaS API yet**. Run your own with
[`/serve`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/serve) — vLLM for
the LLM plus a FastAPI ASR server, behind one base URL — then point `baseURL`
at it. When official NCAIR credentials exist, switch `backend` to `'official'`.

## Licence

Code: **Apache-2.0**.

The models are **not** Apache-2.0 — they carry Awarri's Open-Source Research and
Innovation License, which requires attribution and caps you at 1,000 active
end-users per 30 days. See
[`NOTICE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/NOTICE).

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation
> and Digital Economy, and powered by Awarri Technologies.
