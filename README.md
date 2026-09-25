<div align="center">

# N-ATLAS Kit

**The developer toolkit for N-ATLaS — Nigeria's sovereign multilingual LLM.**

Hausa 🇳🇬 Igbo 🇳🇬 Yorùbá 🇳🇬 Nigerian English

[![CI](https://github.com/Kambah123/N-ATLAS-Kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Kambah123/N-ATLAS-Kit/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/code%20license-Apache--2.0-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/badge/npm-n--atlas-CB3837.svg)](https://www.npmjs.com/package/n-atlas)
[![PyPI](https://img.shields.io/badge/PyPI-natlas-3775A9.svg)](https://pypi.org/project/natlas/)

_Built for the National AI Innovation Challenge 2026 — Problem Statement 1:
"Build the tools that make N-ATLAS easy to build with."_

</div>

---

## The pitch

Nigeria built a sovereign LLM. **N-ATLaS** is a Llama-3 8B fine-tune that speaks
Hausa, Igbo, Yorùbá and Nigerian English, trained on ~392 million tokens of
multilingual instruction data, shipped alongside four Whisper-Small ASR models
tuned on voice recorded across all six geopolitical zones.

Right now, using it looks like this: find the gated Hugging Face repo, request
access, download 16 GB of weights, work out that the chat template needs a
`date_string` variable, find the four separate ASR repos, discover each one only
accepts 30 seconds of 16 kHz mono audio, write your own resampling with ffmpeg,
write your own chunking, write your own HTTP layer — and only then write your
app.

**A national model that is hard to build with is a national model nobody builds
with.** The distance between "the weights exist" and "a developer in Kano ships
a Hausa voice-note app on a Friday night" is the entire problem.

N-ATLAS Kit closes that distance:

```bash
npm install n-atlas          #  JS / TS
pip install natlas           #  Python
```

```ts
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({ baseURL: process.env.NATLAS_BASE_URL });

// Hausa, streaming, out of the box
for await (const chunk of await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
  stream: true,
})) {
  process.stdout.write(chunk.delta);
}

// A WhatsApp voice note -> Hausa text -> English, in two lines
const { transcript, reply } = await natlas.voiceChat({
  audio: await fs.openAsBlob('voice-note.ogg'),
  language: 'ha',
});
```

Same API in Python. Same API in the browser. Same API on the edge.

### Four things, one repo

|                                  |                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 🧰 **Two SDKs**                  | `n-atlas` (npm) and `natlas` (PyPI). Typed, tested, zero heavy deps, pluggable backends.                                                |
| 🖥️ **A self-hosting kit**        | One command puts the LLM _and_ all four ASR models behind a single OpenAI-compatible base URL, on one GPU.                              |
| 🎛️ **A playground**              | Chat, speech and tools in the browser — with a "get the code" panel that hands you the exact JS, Python and curl for what you just did. |
| 📚 **Docs in English and Hausa** | VitePress site in [`docs/`](./docs/). Hausa overview and quickstart are drafts and say so until a native speaker reviews them.          |

### Principles

- **It really is N-ATLaS.** Every code path talks to `NCAIR1/N-ATLaS` or the
  `NCAIR1` ASR models. No GPT, Claude or Gemini is wrapped, proxied or used as a
  fallback — anywhere.
- **No fake output, ever.** If no backend is configured, the UI says
  "No N-ATLAS backend connected". Mocks live inside unit tests and nowhere else.
- **Pluggable backends.** There is no public hosted N-ATLaS API yet. Every
  client takes a `baseURL` and a backend adapter, so the official NCAIR
  credentials drop in by changing one string.
- **Secrets stay in env vars.** Nothing is committed, nothing reaches the
  browser.

---

## Start here

|                |                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Docs           | [`docs/`](./docs/) — `pnpm --filter @n-atlas/docs build` writes a static site to `docs/.vitepress/dist`                               |
| JavaScript SDK | [`packages/js-sdk`](./packages/js-sdk/) — npm name `n-atlas`                                                                          |
| Python SDK     | [`packages/python-sdk`](./packages/python-sdk/) — import name `natlas`                                                                |
| Examples       | [`examples/`](./examples/) — voice-note translator and a support-reply helper, plus short scripts                                     |
| Playground     | [`apps/playground`](./apps/playground/) — browser chat, speech, and get-code                                                          |
| Gateway        | [`serve/`](./serve/) — self-host with Modal or Docker Compose                                                                         |
| Live health    | <https://kambah123--natlas-serve-natlasservice-serve.modal.run/health> (no API key; scales to zero, so a cold start can take minutes) |

Chat and transcription on that host need `NATLAS_API_KEY`, a Bearer key from
the Modal secret `natlas-api`. The key is not in this repository. A ten-minute
path, once you have it, is the [docs quickstart](./docs/src/quickstart.md) or
[`examples/voice-note-translator`](./examples/voice-note-translator/).

---

## Status

**The gateway, both client SDKs, the docs site, two example apps, and the
playground are in the tree.** The Python CLI and the local `transformers`
backend are not.

[`serve/`](./serve/) puts N-ATLaS and all four ASR models behind one
OpenAI-compatible base URL (`docker compose up` or `modal deploy`).
[`packages/js-sdk`](./packages/js-sdk/) (`n-atlas`) and
[`packages/python-sdk`](./packages/python-sdk/) (`natlas`) call that gateway:
chat, streaming, transcription, health, and a few prompt helpers. Install
instructions and quickstarts are in each package README. Runnable scripts live
in [`examples/`](./examples/).

SDK tests mock HTTP. Nothing in this repo was run against a real GPU.

> No GPU was available while `serve/` was written. Its 149 tests all run on
> CPU against real ffmpeg and a mocked vLLM; what that leaves unverified is
> listed openly in
> [`serve/README.md`](./serve/README.md#️-what-is-tested-and-what-is-not).

### Planned features

#### `packages/js-sdk` — npm `n-atlas`

- [x] `new NAtlas({ baseURL, apiKey, backend })`
- [x] `chat({ messages, language, temperature, maxTokens, stream })` — streaming returns an async iterator
- [x] `translate({ text, from, to })` across `ha` / `ig` / `yo` / `en` (an N-ATLaS prompt, not a separate model)
- [x] `summarize({ text, language })`
- [x] `detectLanguage(text)` — returns `null` when the reply is not a language code
- [x] `transcribe({ audio, language })` — `File` | `Blob` | `Buffer` | path (Node)
- [x] `voiceChat({ audio, language })` — transcribe then chat, returns both
- [x] Typed errors: `AuthError`, `RateLimitError`, `BadRequestError`, `ServerError`, `NetworkError`, `TimeoutError`, `AbortError`
- [x] Retries with exponential backoff, timeouts, `AbortSignal`
- [ ] Native-speaker review of the helper prompts (they are English instructions that name the target language)
- [x] Backend adapters in separate files: `openai-compatible`, `hf-endpoint`. `official` throws until an NCAIR API exists
- [x] Node 20+ and modern browsers via `fetch`; ESM + CJS via tsup. Node 18 is EOL and is not supported: global `File` (used when reading a transcription upload back out of `FormData`) arrived in Node 20, and the Node 18 CI job failed with `ReferenceError: File is not defined`

#### `packages/python-sdk` — PyPI `natlas`

- [x] Same API surface, sync **and** async, on `httpx`
- [ ] `local` backend running the models directly via `transformers` (`pip install natlas[local]`) — constructing `backend="local"` raises
- [x] Pydantic response models
- [ ] CLI: `natlas chat --lang ha`, `natlas transcribe voice.ogg --lang ha`, `natlas translate "..." --to yo`

#### `serve/` — the real backend ✅ **built** — see [`serve/README.md`](./serve/README.md)

- [x] vLLM serving `NCAIR1/N-ATLaS` as an OpenAI-compatible API with streaming, using the model's own chat template
- [x] FastAPI ASR server: `POST /v1/audio/transcriptions`, multipart + `language`
- [x] Routes `ha`/`ig`/`yo`/`en` to the matching `NCAIR1` ASR model
- [x] ffmpeg conversion of ogg/opus (WhatsApp voice notes), mp3, m4a, wav → 16 kHz mono
- [x] Silence-aware chunking for audio longer than Whisper's 30-second window
- [x] Gateway: one base URL, Bearer auth, CORS, `GET /health`
- [x] Request logging — latency, language, token counts, **never user content**
- [x] `docker-compose.yml` for a GPU box + `modal deploy serve/modal_app.py` for one A10/L4

> 149 tests run on CPU with no gated weights. Everything that requires a real
> GPU is still unverified and is listed explicitly under
> [“What is tested, and what is not”](./serve/README.md#️-what-is-tested-and-what-is-not).

#### `apps/playground` — Next.js on Vercel

- [x] Streaming chat with a language hint (English, Hausa, Igbo, Yorùbá, Pidgin), example prompts, temperature and max-token controls
- [x] Speech: record from the mic or upload audio, transcribe, reply in chat, optionally translate to English
- [x] "Get the code" — curl, JavaScript (`n-atlas`) and Python (`natlas`) for the last request
- [x] `/health` status, including a cold-start "waking the model up" state
- [x] Keys stay in server env; in-memory per-IP limits plus input and audio limits
- [x] Clear "No N-ATLAS backend connected" state when env vars are missing
- [x] Responsive light/dark UI. See [`apps/playground/README.md`](./apps/playground/README.md)
- [ ] Dedicated summarize panel, anonymous usage counters, and a full Hausa UI translation

#### `docs/` — English + Hausa

- [x] Overview, quickstart (JS / Python / curl), gateway API, both SDK references, self-hosting, limits, licensing
- [x] **N-ATLAS integration** — how chat and speech reach `NCAIR1/N-ATLaS` and the four ASR repos, including a Mermaid diagram of the data flow
- [x] Key handling and the no-content-logging guarantee, on the integration and gateway pages
- [x] Language switcher. Hausa overview and quickstart are flagged for native-speaker review and are not described as reviewed
- [ ] Fine-tuning guide and a full Hausa translation of every page

#### `examples/`

- [x] `examples/js` and `examples/python` — chat, streaming chat, and transcription against a gateway you already run
- [x] `examples/voice-note-translator` — audio in Hausa, Igbo, Yorùbá, or Nigerian English → transcript → translation or reply. CLI and a local page
- [x] `examples/support-reply` — draft a support reply in the customer's language via N-ATLaS
- [ ] `yoruba-summarizer` as its own app (the SDK `summarize` helper already exists)
- [ ] `nextjs-chat-starter` — clone-and-go template
- [ ] `colab-notebook`

---

## Repo layout

```
N-ATLAS-Kit/
├── packages/
│   ├── js-sdk/              npm package `n-atlas`   — TS, ESM + CJS, zero heavy deps
│   └── python-sdk/          pip package `natlas`    — sync + async, CLI, optional local backend
├── serve/                   self-hosting kit: vLLM (LLM) + FastAPI (ASR) + gateway
│                            docker-compose for GPU boxes, modal_app.py for Modal
├── apps/
│   └── playground/          Next.js App Router playground, deploys to Vercel
├── docs/                    docs site, every page in English and Hausa
├── examples/                runnable examples, each with its own README
├── .github/workflows/       CI (lint, typecheck, test) and release pipelines
├── LICENSE                  Apache-2.0 — applies to this repo's CODE only
├── NOTICE                   model attribution + the N-ATLaS terms you inherit
└── .env.example             every variable the kit reads, documented
```

---

## The models

Verified against Hugging Face on 2026-09-24. All five repos are **gated** —
accept the terms with a Hugging Face account and supply an `HF_TOKEN`.

### LLM

|               |                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo          | [`NCAIR1/N-ATLaS`](https://huggingface.co/NCAIR1/N-ATLaS)                                                                                                                                                                                                            |
| Architecture  | `LlamaForCausalLM` — Llama-3 8B fine-tune                                                                                                                                                                                                                            |
| Shape         | 32 layers · hidden 4096 · 32 heads · 8 KV heads · vocab 128,256 · BF16                                                                                                                                                                                               |
| Context       | **8,092 tokens recommended** (`max_position_embeddings` is 131,072, but the card caps useful context at ~8k)                                                                                                                                                         |
| Chat template | Llama-3 header tokens (`<\|begin_of_text\|>`, `<\|start_header_id\|>`, `<\|eot_id\|>`), and the template takes a `date_string` variable. **Always use the model's own template** via `apply_chat_template` / vLLM's built-in handling — do not hand-roll the prompt. |
| Training      | ~391,956,264 tokens of SFT data — ~318k English, ~200k each Hausa / Igbo / Yorùbá                                                                                                                                                                                    |

### ASR

All four are **Whisper Small** (244M) fine-tunes with a hard **30-second** input
window, expecting **16 kHz mono** audio. Longer audio must be chunked — that's
what `serve/` does for you.

| Language         | `language` code | Hugging Face repo                                                                         |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------- |
| Hausa            | `ha`            | [`NCAIR1/Hausa-ASR`](https://huggingface.co/NCAIR1/Hausa-ASR)                             |
| Igbo             | `ig`            | [`NCAIR1/Igbo-ASR`](https://huggingface.co/NCAIR1/Igbo-ASR)                               |
| Yorùbá           | `yo`            | [`NCAIR1/Yoruba-ASR`](https://huggingface.co/NCAIR1/Yoruba-ASR)                           |
| Nigerian English | `en`            | [`NCAIR1/NigerianAccentedEnglish`](https://huggingface.co/NCAIR1/NigerianAccentedEnglish) |

---

## Licensing — read this before you deploy

**This repository's code is Apache-2.0. The models are not.**

We checked, and the two are compatible _for this project_ — but only because
N-ATLAS Kit is a client toolkit that ships **no weights** and is **not a
derivative work** of any model. If we ever vendored weights or published a
fine-tune, that artefact would have to carry the N-ATLaS terms instead.

N-ATLaS and the four ASR models are released under an **"Open-Source Research
and Innovation License"** — the model cards describe it as _inspired by_ Apache
2.0 and MIT, but it adds restrictions that make it **not OSI open-source**:

| N-ATLaS model terms                                 | What it means for you                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Attribution is mandatory                            | Ship the strings in [`NOTICE`](./NOTICE); the playground shows them in the footer                           |
| Share-alike on model derivatives                    | A fine-tune of N-ATLaS must be released under the same terms. Our client code is unaffected.                |
| **Cap of 1,000 active end-users / rolling 30 days** | A public app that outgrows this needs a commercial licence from Awarri                                      |
| Not for enterprise or commercial deployment         | Research, education, civic tech, accessibility, cultural preservation and community projects are fine       |
| Prohibited uses                                     | Surveillance, discriminatory profiling, disinformation and impersonation, military or weaponised deployment |
| Renamed derivatives                                 | Must carry the suffix **"Powered by Awarri"**                                                               |
| Governing law                                       | Federal Republic of Nigeria                                                                                 |

Full detail and the exact required attribution text: [`NOTICE`](./NOTICE).
Authoritative text: the Terms of Use section on each Hugging Face model card.

> **N-ATLaS is an initiative of the Federal Ministry of Communications,
> Innovation and Digital Economy, and powered by Awarri Technologies.**

---

## Local development

Requires **Node ≥ 20**, **pnpm 9**, **Python ≥ 3.10** and **ffmpeg** (for the
speech pieces). Node 18 is end-of-life and is not in CI.

```bash
git clone https://github.com/Kambah123/N-ATLAS-Kit.git
cd N-ATLAS-Kit

corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install

cp .env.example .env     # then fill in NATLAS_BASE_URL / NATLAS_API_KEY

# JavaScript / TypeScript
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Python
python -m venv .venv && source .venv/bin/activate
pnpm py:install
pnpm py:lint
pnpm py:typecheck
pnpm py:test

# The self-hosting kit (no GPU needed to run its tests)
pip install -e "serve[dev]"
cd serve && pytest && mypy natlas_serve
```

`pnpm check` runs format, lint, typecheck and test for the JS side in one go —
the same gates CI enforces.

---

## Contributing

Issues and pull requests are very welcome, especially:

- **Hausa, Igbo and Yorùbá speakers** reviewing our translations and system
  prompts — anything we weren't sure about is flagged in the docs.
- Backend adapters, framework integrations, and examples.

Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

---

## Acknowledgements

N-ATLaS is built by **Awarri Technologies** with the **National Centre for
Artificial Intelligence and Robotics (NCAIR)**, the **National Information
Technology Development Agency (NITDA)** and the **Federal Ministry of
Communications, Innovation and Digital Economy**, with voice data contributed by
Nigerians across all six geopolitical zones via the Langeasy platform.

This toolkit is an independent, community-built client for their work.
