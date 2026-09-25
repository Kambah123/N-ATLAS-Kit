<script setup>
const chatSrc = '/videos/chat-code.mp4';
const chatPoster = '/videos/chat-code.jpg';
const speechSrc = '/videos/speech-yoruba.mp4';
const speechPoster = '/videos/speech-yoruba.jpg';
</script>

# N-ATLAS Kit

Developer toolkit for **N-ATLaS**, Nigeria's sovereign multilingual model, and
the four NCAIR1 speech models that sit beside it.

N-ATLaS speaks **Hausa, Igbo, Yorùbá, and Nigerian English**. The playground
also offers Nigerian Pidgin (beta). The speech models are separate Whisper
Small checkpoints, one per language, trained on voice recorded across Nigeria's
six geopolitical zones. This repository is the client and the self-hosting kit.
It does not ship weights.

A Hausa draft of this page is at [Bayani](/ha/). It has not been reviewed by a
native speaker.

## See it in action {#see-it-in-action}

Two recordings from the [playground](https://natlas-playground.vercel.app).

<figure class="demo-figure">
  <video class="demo-video" controls muted playsinline preload="metadata" :poster="chatPoster" :src="chatSrc"></video>
  <figcaption>Hausa chat in the playground, then Get code copies a working SDK call.</figcaption>
</figure>

<figure class="demo-figure">
  <video class="demo-video" controls muted playsinline preload="metadata" :poster="speechPoster" :src="speechSrc"></video>
  <figcaption>Yorùbá chat and the Tune panel, then Speech transcribes audio and translates it.</figcaption>
</figure>

## Why this exists

The weights are on Hugging Face. Using them still means accepting gated terms,
downloading about 15 GB, learning that the chat template needs a `date_string`,
finding four separate ASR repositories, and discovering that each one only
accepts 30 seconds of 16 kHz mono audio.

N-ATLAS Kit is the layer in front of that:

| Piece                                                                | What it is                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`serve/`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/serve) | One OpenAI-compatible gateway for chat and all four speech models        |
| [`n-atlas`](https://www.npmjs.com/package/n-atlas)                   | JavaScript / TypeScript SDK. `npm install n-atlas` or `pnpm add n-atlas` |
| [`natlas`](https://pypi.org/project/natlas/)                         | Python SDK, sync and async. `pip install natlas`                         |
| [Examples](/examples)                                                | Small apps you can run against a gateway                                 |
| [Playground](https://natlas-playground.vercel.app)                   | Live browser app: chat, speech, and get-code                             |

There is no public NCAIR inference API in this release. Every client takes a
`baseURL`. The hosted gateway used for the National AI Innovation Challenge
demo is:

```text
https://kambah123--natlas-serve-natlasservice-serve.modal.run
```

`GET /health` on that host does not need an API key. It scales to zero, so the
first request after an idle period is a cold start (the container reloads the
weights). Chat and transcription need the Bearer key stored in the Modal
secret `natlas-api`. That key is not in this repository.

## Ten minutes, if a gateway is already up

1. Install Node.js 20 or newer, or Python 3.10 or newer.
2. Set `NATLAS_BASE_URL` to the gateway origin (with or without `/v1`) and
   `NATLAS_API_KEY` to a key that gateway accepts.
3. Follow the [quickstart](/quickstart) for one chat call and one
   transcription, or run the [voice-note translator](/examples#voice-note-translator).

If those variables are missing, the SDKs and the example apps stop and say so.
They do not print a made-up transcript or reply.

## What the kit will not do

- It will not call GPT, Claude, Gemini, or any other vendor's model. A model
  id that does not start with `NCAIR1/` is rejected in the client.
- It will not download weights for you unless you self-host. The HTTP SDKs
  only speak to a gateway.
- It does not include a reviewed Hausa translation of the whole site. Overview
  and quickstart exist in Hausa and are marked as needing native-speaker
  review.
- Benchmark numbers are not invented here. GPU sizing in the
  [self-hosting guide](/self-hosting) is the planning arithmetic already
  written in `serve/README.md`, from the model card and `config.json`.

## Where to go next

- [Quickstart](/quickstart) — install, environment, first chat, first transcription
- [Gateway API](/gateway) — the HTTP surface `serve/` actually implements
- [JavaScript SDK](/sdk/javascript) and [Python SDK](/sdk/python)
- [Self-hosting](/self-hosting) — Modal, Docker Compose, Hugging Face terms, GPUs
- [Limits and troubleshooting](/troubleshooting)
- [Licensing and attribution](/licensing)
- [How the kit uses N-ATLaS](/integration)
