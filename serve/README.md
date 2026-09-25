# `/serve` — run the real N-ATLaS yourself

There is no public hosted N-ATLaS API. `/serve` is the one-command way to run
the real thing on your own GPU, putting **the LLM and all four ASR models
behind a single OpenAI-compatible base URL**.

```
                       ┌──────────────────────────────────────┐
 your app ──Bearer──▶  │  gateway   auth · CORS · logging      │
                       │            :8080                      │
                       └───────┬───────────────────┬───────────┘
                               │                   │
                 /v1/chat/completions      /v1/audio/transcriptions
                               │                   │
                       ┌───────▼───────┐   ┌───────▼────────────────┐
                       │ vLLM  :8000   │   │ Whisper  :8001         │
                       │ NCAIR1/N-ATLaS│   │ ha · ig · yo · en      │
                       │ GPU, BF16     │   │ CPU                    │
                       └───────────────┘   └────────────────────────┘
```

Point any OpenAI client at it:

```python
from openai import OpenAI

client = OpenAI(base_url="https://your-endpoint/v1", api_key="your-key")
client.chat.completions.create(
    model="NCAIR1/N-ATLaS",
    messages=[{"role": "user", "content": "Sannu! Yaya za a shirya jollof rice?"}],
)
```

---

## Endpoints

| Method | Path | Auth | What it does |
|---|---|---|---|
| `POST` | `/v1/chat/completions` | Bearer | `NCAIR1/N-ATLaS` via vLLM. Streaming supported. |
| `POST` | `/v1/audio/transcriptions` | Bearer | Routes to the NCAIR1 ASR model for `language`. |
| `POST` | `/v1/audio/speech` | Bearer | MMS-TTS for `ha`, `yo`, and `en`. Igbo uses `Shinzmann/soro-tts-ibo` because `facebook/mms-tts-ibo` is gone. Pidgin (`pcm`) is read in English and the response says so. Clips are loudness-normalized. |
| `GET`  | `/v1/models` | Bearer | Proxied from vLLM. |
| `GET`  | `/health` | none | Upstream status. Safe for a load balancer. |

`/health` on a live stack (real output, `NATLAS_ASR_MODE=proxy`):

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
    "mode": "proxy",
    "status": "ok"
  },
  "attribution": "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies."
}
```

---

## Before anything: get access

All five NCAIR1 repos are **gated**. Nothing below works without a Hugging Face
token from an account that has opened each model page and accepted the N-ATLaS
Terms of Use.

| Language | Model |
|---|---|
| — (LLM) | [`NCAIR1/N-ATLaS`](https://huggingface.co/NCAIR1/N-ATLaS) |
| Hausa | [`NCAIR1/Hausa-ASR`](https://huggingface.co/NCAIR1/Hausa-ASR) |
| Igbo | [`NCAIR1/Igbo-ASR`](https://huggingface.co/NCAIR1/Igbo-ASR) |
| Yoruba | [`NCAIR1/Yoruba-ASR`](https://huggingface.co/NCAIR1/Yoruba-ASR) |
| Nigerian English | [`NCAIR1/NigerianAccentedEnglish`](https://huggingface.co/NCAIR1/NigerianAccentedEnglish) |

Then create a read token at <https://huggingface.co/settings/tokens>.

---

## Option A — Modal (no GPU of your own)

Full walkthrough, including the Nigerian-card gotcha on Modal billing:
**[`MODAL_SETUP.md`](./MODAL_SETUP.md)**.

```bash
pip install modal
modal setup

# Two secrets: one for Hugging Face, one for your gateway's own API keys.
modal secret create natlas-hf  HF_TOKEN=hf_xxxxxxxx
modal secret create natlas-api NATLAS_API_KEYS="$(openssl rand -hex 32)"

# Verify gated access + VRAM budget before spending on a real deploy (~2 min).
modal run serve/modal_preflight.py

modal deploy serve/modal_app.py
```

`modal deploy` prints your base URL. One container holds everything: vLLM on
the GPU, Whisper on the CPU, the gateway in front.

```bash
curl https://<your-app>.modal.run/health
```

Run `modal run serve/modal_preflight.py --skip-gpu` to check the Hugging Face
half for free, with no payment method on file.

## Option B — your own GPU box, via Docker

Needs Docker with the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
and a 24 GB+ card.

```bash
cd serve
cp .env.example .env
#   HF_TOKEN=hf_...
#   NATLAS_API_KEYS=$(openssl rand -hex 32)

docker compose up --build
curl localhost:8080/health
```

Three containers from one image: `vllm` (GPU), `asr` (CPU), `gateway`.
**Only the gateway publishes a port** — the other two have no authentication of
their own and must never be reachable from outside the compose network.

First start downloads ~15 GB into a named volume, so budget 10–25 minutes.
Restarts reuse the cache.

## Option C — no containers

```bash
pip install -e "serve[asr]"

# terminal 1 — the GPU half
NATLAS_ALLOW_ANONYMOUS=true HF_TOKEN=hf_... \
  python -m natlas_serve.vllm_launcher

# terminal 2 — speech, on CPU
NATLAS_ALLOW_ANONYMOUS=true HF_TOKEN=hf_... \
  uvicorn natlas_serve.asr_app:app --port 8001

# terminal 3 — the authenticated front door
NATLAS_API_KEYS=dev-key NATLAS_ASR_MODE=proxy \
  uvicorn natlas_serve.gateway:app --port 8080
```

---

## Using it

### Chat, streaming

```bash
curl -N localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
        "model": "NCAIR1/N-ATLaS",
        "messages": [{"role": "user", "content": "Sannu! Ka gaya mini labarin Kano."}],
        "stream": true,
        "language": "ha"
      }'
```

`language` is optional and non-standard: the gateway strips it before
forwarding and keeps it only to label the log line. It does not change the
prompt.

### Speech to text

```bash
curl localhost:8080/v1/audio/transcriptions \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -F file=@voice-note.ogg \
  -F language=ha
```

```json
{ "text": "sannu da zuwa" }
```

`language` is **required** — it selects the model, because each NCAIR1 ASR
checkpoint is monolingual. Accepted: `ha`/`hau`/`hausa`, `ig`/`ibo`/`igbo`,
`yo`/`yor`/`yoruba`, `en`/`eng`/`english` (case- and space-insensitive).

`response_format` accepts `json` (default), `text`, and `verbose_json`, which
adds duration, the resolved model id, and the chunk count.

Any format ffmpeg can read works — `.ogg` (WhatsApp voice notes), `.mp3`,
`.m4a`, `.wav`, `.flac`, `.webm`. Everything is normalised to 16 kHz mono.

---

## Two N-ATLaS-specific behaviours

**`date_string` injection.** N-ATLaS's chat template takes a `date_string`
variable — the model card's own example passes
`datetime.now().strftime('%d %b %Y')`. The gateway injects exactly that into
every chat request via vLLM's `chat_template_kwargs`, so the rendered prompt
matches what the model was fine-tuned and evaluated on. Disable with
`NATLAS_INJECT_DATE_STRING=false`.

**The chat template is never overridden.** We deliberately do not pass
`--chat-template` to vLLM. N-ATLaS ships its own in `tokenizer_config.json`;
replacing it would silently change the prompt format the model expects.

---

## GPU memory

N-ATLaS is a Llama-3 8B fine-tune in BF16. From the real `config.json`
(32 layers, 8 KV heads, 128 head dim):

| | |
|---|---|
| LLM weights, BF16 | **14.96 GiB** |
| KV cache per token | 128 KiB |
| KV cache per full 8,092-token conversation | **0.99 GiB** |
| 4 × Whisper Small, fp16 | 1.82 GiB (**CPU by default**, not on the card) |

At `--gpu-memory-utilization 0.90`:

| GPU | VRAM | vLLM pool | KV cache left | Concurrent full-context chats |
|---|---|---|---|---|
| L4 | 24 GB | 20.4 GiB | 5.45 GiB | ~5 |
| A10 | 24 GB | 20.4 GiB | 5.45 GiB | ~5 |
| L40S | 48 GB | 40.8 GiB | 25.9 GiB | ~26 |
| A100 | 40 GB | 34.0 GiB | 19.1 GiB | ~19 |

Real conversations are far shorter than 8,092 tokens, so a 24 GB card comfortably
serves more than five concurrent users — five is the floor, not the ceiling.

**24 GB is the practical minimum.** Below that the weights alone leave no room
for a useful KV cache.

**Why ASR runs on the CPU.** vLLM pre-allocates its KV pool at startup from
whatever VRAM is free. A second CUDA process on the same card is an OOM waiting
to happen. Whisper Small is 244M parameters; on 4 vCPUs a 30-second clip
transcribes in roughly 2–6 seconds. Set `NATLAS_ASR_DEVICE=cuda` only when ASR
has a card to itself.

---

## Cost

Modal, per second, scale-to-zero — you pay only while requests are in flight
([pricing](https://modal.com/pricing)).

| GPU | $/hour | 8 h | 24 h | Always-on month |
|---|---|---|---|---|
| **L4** 24 GB | **$0.80** | $6.39 | $19.18 | $575 |
| **A10** 24 GB | **$1.10** | $8.80 | $26.40 | $792 |
| L40S 48 GB | $1.95 | $15.60 | $46.80 | $1,404 |
| A100 40 GB | $2.10 | $16.80 | $50.40 | $1,512 |

Modal's Starter plan includes **$30/month of free credits** — about **27 hours
on an A10** or **38 hours on an L4**. That is enough to develop against, demo,
and run a beta.

`modal_app.py` requests `gpu=["A10", "L4"]`: A10 preferred, L4 as fallback when
capacity is tight. `scaledown_window=300` keeps the container warm for five
minutes after the last request — a cold start reloads 15 GB, so five idle
minutes is cheaper than making the next user wait.

`min_containers` is deliberately **not** set. Pinning a warm GPU costs ~$790/month.

---

## Configuration

Every value comes from the environment. See [`.env.example`](./.env.example).

| Variable | Default | Notes |
|---|---|---|
| `NATLAS_API_KEYS` | — | Comma-separated Bearer tokens. **Required.** |
| `NATLAS_ALLOW_ANONYMOUS` | `false` | Disables auth. Local throwaway boxes only. |
| `NATLAS_CORS_ORIGINS` | none | Comma-separated. Empty = no CORS headers. |
| `NATLAS_REQUEST_TIMEOUT` | `120` | Seconds. |
| `NATLAS_MAX_UPLOAD_BYTES` | `67108864` | 64 MiB. |
| `NATLAS_LLM_MODEL` | `NCAIR1/N-ATLaS` | Point at a fine-tune or local mirror. |
| `NATLAS_VLLM_URL` | `http://127.0.0.1:8000` | |
| `NATLAS_VLLM_MAX_MODEL_LEN` | `8192` | Card states 8,092 usable. |
| `NATLAS_VLLM_GPU_MEMORY_UTILIZATION` | `0.90` | |
| `NATLAS_VLLM_EXTRA_ARGS` | none | Extra vLLM flags, shell-quoted. |
| `NATLAS_INJECT_DATE_STRING` | `true` | See above. |
| `NATLAS_INCLUDE_USAGE` | `true` | Final usage chunk when streaming, for token logging. |
| `NATLAS_ASR_MODE` | `local` | `local` = in-process, `proxy` = separate service. |
| `NATLAS_ASR_URL` | `http://127.0.0.1:8001` | Used when `proxy`. |
| `NATLAS_ASR_DEVICE` | `cpu` | `cpu` \| `cuda` \| `auto`. |
| `NATLAS_ASR_CHUNK_SECONDS` | `25` | Target chunk length for long audio. |
| `NATLAS_ASR_MODEL_{HA,IG,YO,EN}` | NCAIR1 ids | Override individually. |

The gateway **refuses to start** with no API keys unless
`NATLAS_ALLOW_ANONYMOUS=true`. A misconfigured deployment fails loudly instead
of quietly serving your GPU to the internet.

---

## Long audio

Each NCAIR1 ASR model is Whisper Small, which sees **30 seconds at a time**.
Longer uploads are split automatically.

Naive 30-second slicing cuts words in half. Instead the splitter targets
`NATLAS_ASR_CHUNK_SECONDS` (default 25 s), searches ±4 s around that target for
the quietest 20 ms frame, and cuts there — but only if that frame is genuinely
quiet relative to the surrounding window (below half the local median RMS).
Otherwise it cuts at the target rather than at an arbitrary dip in continuous
speech. The split is lossless, no chunk ever exceeds 30 s, and transcripts are
joined with a single space.

---

## Privacy

**Prompts, transcripts and completions are never logged.** One JSON line per
request, shape and counts only:

```json
{"completion_tokens":12,"event":"request","feature":"chat","key":"k_c48a01f49fd0",
 "language":"ha","latency_ms":1.14,"method":"POST","model":"NCAIR1/N-ATLaS",
 "path":"/v1/chat/completions","prompt_tokens":31,"request_id":"eb96ffcb9d1d4fae",
 "status":200,"stream":false,"total_tokens":43,"ts":1790289915.72}
```

That is a real log line, copied from the test suite.

- `key` is `k_` + 12 hex of the SHA-256 of the API key — enough to attribute
  usage, useless for replaying it.
- `log_request()` **raises** if asked to log a field that could hold content.
  `tests/test_gateway.py::test_logs_shape_and_tokens_but_never_content` asserts
  the prompt, the completion and the raw key never appear anywhere in the line.
- vLLM's own per-request prompt logging is switched off. The flag name changed
  across vLLM versions, so `vllm_launcher.probe_help()` reads `--help` at
  startup and picks whichever of `--disable-log-requests` /
  `--no-enable-log-requests` the installed build accepts.

---

## Development

```bash
pip install -e "serve[dev]"
cd serve
pytest              # 149 tests, ~9 s, no GPU and no model downloads
mypy natlas_serve   # strict
ruff check .
```

The audio tests need a real ffmpeg. `tests/conftest.py` finds a system one, or
falls back to the static build from `imageio-ffmpeg` (a `dev` dependency), so
`pytest` works on a bare machine. Override with `NATLAS_FFMPEG_BINARY`.

That fallback is **test-only on purpose**: `audio.ffmpeg_binary()` itself
raises rather than quietly depending on a development dependency, so a
production container that forgot to install ffmpeg fails at startup instead of
at the first voice note.

---

## ⚠️ What is tested, and what is not

Honest status. **No GPU was available while this was written**, so the split
below matters.

### Verified by the test suite (149 tests, CPU only)

- **Audio decoding** through real ffmpeg, end to end: `.wav`, `.ogg`/Opus,
  `.mp3`, `.flac`, `.m4a` → 16 kHz mono int16 at the correct duration. Empty
  and corrupt uploads produce clean 400s, not stack traces.
- **Chunking**: real 70-second clips with engineered pauses; cuts land inside
  the pauses, nothing exceeds 30 s, and concatenating the chunks reproduces the
  input sample-for-sample.
- **Gateway behaviour** against a mocked vLLM: auth accept/reject, CORS,
  `X-Request-Id`, `date_string` injection, `language` stripping, upstream error
  passthrough, 502 on an unreachable backend, and SSE streaming relayed
  byte-for-byte.
- **Privacy**, as described above.
- **ASR routing**: each language reaches its own NCAIR1 model id, aliases
  normalise, unsupported languages get a helpful 400, all three response
  formats are correctly shaped. The transcriber itself is stubbed.
- **vLLM argv**: the exact command, the log-flag probe against real `--help`
  text, and that `--chat-template` is never passed.
- **Deployment manifests**: only the gateway is published, the gateway never
  ships with auth disabled, only vLLM reserves a GPU, and `modal_app.py` and
  `modal_preflight.py` agree on secret names.

### NOT tested — needs a GPU and the gated weights

- **vLLM actually loading `NCAIR1/N-ATLaS`.** The argv is unit-tested; that it
  boots, and the real throughput and cold-start time, are not.
- **Real transcription quality.** Every ASR test uses a stub transcriber.
  `WhisperTranscriber` — the lazy torch import, the per-language model cache,
  device selection — has never run against real weights.
- **The VRAM figures above are arithmetic**, computed from `config.json`, not
  measured. `modal_preflight.py` checks them against a real card; run it.
- **`docker compose up`.** The compose file is parsed and structurally asserted
  in tests, but no image has been built and no container started.
- **`modal deploy`.** A real image build of `vllm/vllm-openai:v0.11.0` failed
  at Modal's `pip_install` with `/bin/sh: 1: python: not found` (that image
  only has `python3`). `modal_app.py` now links `python3` to `python` before
  installing packages. A deploy that finishes, loads the weights, and serves
  traffic has still not been completed here.
- **Cold-start time** and whether the 20-minute healthcheck `start_period` is
  generous enough for a first-run download.
- End-to-end **streaming from real vLLM**, and whether the usage chunk arrives
  as expected from the installed build.

Running any of this on a real GPU is the first task of the deployment
milestone, and the results will be recorded in `docs/evidence/`.

---

## Attribution

> N-ATLaS is an initiative of the Federal Ministry of Communications,
> Innovation and Digital Economy, and powered by Awarri Technologies.

Required by the N-ATLaS Terms of Use. The gateway surfaces it on `/health` so
anyone integrating sees it without reading the licence.
