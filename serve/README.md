# `/serve` — the real N-ATLaS backend

> **🚧 Mostly not built yet.** The deployment itself lands in the next
> milestone. What works today is the **pre-flight check** below.

There is no public hosted N-ATLaS API. `/serve` will be the one-command way to
run the real thing yourself, putting the LLM **and** all four ASR models behind
a single OpenAI-compatible base URL.

## Start here: `MODAL_SETUP.md`

**→ [`MODAL_SETUP.md`](./MODAL_SETUP.md)** walks you through getting a GPU
endpoint: Hugging Face gated access, the Modal account and payment method
(including the Nigerian-card gotcha), the CLI, the secret, GPU choice and real
cost estimates.

It ends with:

```bash
modal run serve/modal_preflight.py
```

`modal_preflight.py` is real and runnable today. In ~2 minutes and for a few
cents it verifies the full chain before we spend anything on the actual
deployment:

- Modal is authenticated and can schedule work
- `HF_TOKEN` reaches the container
- that token can read **all five** gated NCAIR1 repos
- the GPU has room for N-ATLaS *plus* the four ASR models, with the KV-cache
  budget computed from the real model config

Run `--skip-gpu` to check the Hugging Face half for free, with no card on file.

## What is planned

```
serve/
├── vllm/              NCAIR1/N-ATLaS via vLLM, OpenAI-compatible, streaming,
│                      using the model's own chat template
├── asr/               FastAPI: POST /v1/audio/transcriptions
│                      multipart file + `language` (ha | ig | yo | en)
│                      ffmpeg -> 16 kHz mono, chunked for >30 s audio
├── gateway/           one base URL, Bearer auth, CORS, GET /health,
│                      request logging (latency, language, token counts only)
├── docker-compose.yml for a GPU box
└── modal_app.py       `modal deploy serve/modal_app.py` -> one A10G or L4
```

## Why each piece exists

- **vLLM** gives us streaming `/v1/chat/completions` and applies the model's own
  Llama-3 chat template — which takes a `date_string` variable, so hand-rolling
  the prompt is a bug waiting to happen.
- **The ASR server** exists because the four `NCAIR1` models are Whisper Small
  fine-tunes with a hard 30-second, 16 kHz mono input. Real users send WhatsApp
  `.ogg`/opus voice notes of arbitrary length. Somebody has to do the ffmpeg
  conversion and the chunking; it should not be every app developer.
- **The gateway** means an app configures one `baseURL` and one API key, not
  two services on two ports.

## Models served

| Role | Hugging Face repo | Notes |
|---|---|---|
| LLM | `NCAIR1/N-ATLaS` | Llama-3 8B fine-tune, BF16, ~16 GB of weights, 8,092-token usable context |
| ASR `ha` | `NCAIR1/Hausa-ASR` | Whisper Small, 244M |
| ASR `ig` | `NCAIR1/Igbo-ASR` | Whisper Small, 244M |
| ASR `yo` | `NCAIR1/Yoruba-ASR` | Whisper Small, 244M |
| ASR `en` | `NCAIR1/NigerianAccentedEnglish` | Whisper Small, 244M |

**All five repos are gated.** Accept the terms on each model page with one
Hugging Face account, create a read token, and pass it as `HF_TOKEN`.

The README shipped with the real implementation will carry exact commands, GPU
memory requirements and an estimated cost per hour.

## Licence reminder

Running this makes you a licensee of the N-ATLaS terms: attribution is
mandatory, there is a cap of 1,000 active end-users per rolling 30 days, and
enterprise or commercial deployment needs a separate agreement with Awarri.
See [`NOTICE`](../NOTICE).
