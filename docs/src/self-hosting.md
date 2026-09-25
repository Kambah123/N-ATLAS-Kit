# Self-hosting

The gateway is `serve/`. Two ways to run it are documented here: Modal, and
Docker Compose on a machine with an NVIDIA GPU. Both need a Hugging Face
account that has accepted the model terms, because every NCAIR1 repo is gated.

This page does not repeat the VRAM spreadsheet. The arithmetic (weights, KV
cache, and the Modal price table the maintainers used for planning) is in
[`serve/README.md`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/serve/README.md)
and [`serve/MODAL_SETUP.md`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/serve/MODAL_SETUP.md).
Treat those tables as planning notes from the model card and `config.json`,
not as a benchmark this docs site measured.

## Accept the model terms

Log in to Hugging Face with the account that will own the token. Open each
repo and accept the terms:

- [NCAIR1/N-ATLaS](https://huggingface.co/NCAIR1/N-ATLaS)
- [NCAIR1/Hausa-ASR](https://huggingface.co/NCAIR1/Hausa-ASR)
- [NCAIR1/Igbo-ASR](https://huggingface.co/NCAIR1/Igbo-ASR)
- [NCAIR1/Yoruba-ASR](https://huggingface.co/NCAIR1/Yoruba-ASR)
- [NCAIR1/NigerianAccentedEnglish](https://huggingface.co/NCAIR1/NigerianAccentedEnglish)

Create a read token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
A 401 from the hub during startup almost always means this token's account has
not accepted one of those cards.

## GPU

N-ATLaS is a Llama-3 8B fine-tune in BF16. `serve/README.md` sizes the weights
at about 15 GiB, so a 24 GB card is the practical minimum they planned for.
Below that there is no useful KV cache left.

The Modal app requests `gpu=["A10", "L4"]`: an A10 when Modal has one, an L4
otherwise. Both are 24 GB. Modal's GPU string is `A10`, not `A10G`.

ASR is Whisper Small (244M) and runs on CPU (`NATLAS_ASR_DEVICE=cpu`, 4 CPUs
on Modal). vLLM pre-allocates its KV cache from free VRAM at startup. A second
CUDA process on the same card is likely to run out of memory. Set
`NATLAS_ASR_DEVICE=cuda` only when ASR has its own GPU.

vLLM is started with `--max-model-len` 8192 (the card says 8092 usable tokens;
8192 is what the launcher asks vLLM to reserve) and
`--gpu-memory-utilization` 0.90.

## Modal

The public entrypoint is `serve/modal_app.py`. One container runs vLLM as a
subprocess on the GPU, Whisper in-process on CPU, and the gateway as the ASGI
app Modal exposes. Cold start loads the weights. The first start also
downloads them onto the volume `natlas-hf-cache`. `scaledown_window` is 300
seconds: after the last request the container stays warm for five minutes,
then scales to zero. `min_containers` is not set.

Two secrets, created by you. Names are exact.

```bash
pip install "modal>=1.0"
modal setup

# Hugging Face read token. The container reads HF_TOKEN from this secret.
modal secret create natlas-hf HF_TOKEN=hf_xxxxxxxx

# Bearer keys the gateway will accept. This is not the Hugging Face token.
modal secret create natlas-api NATLAS_API_KEYS="$(openssl rand -hex 32)"
```

`natlas-api` must contain the key `NATLAS_API_KEYS`. `modal_app.py` sets
`required_keys=["NATLAS_API_KEYS"]`, so a missing secret fails at deploy time.

Check access before a full deploy:

```bash
modal run serve/modal_preflight.py --skip-gpu   # token + terms, no GPU
modal run serve/modal_preflight.py              # also asks for an A10
modal deploy serve/modal_app.py
```

`modal deploy` prints a URL of the form
`https://<workspace>--natlas-serve-natlasservice-serve.modal.run`.
`GET /health` on that host needs no key. Put the same URL in `NATLAS_BASE_URL`
and one of the `NATLAS_API_KEYS` values in `NATLAS_API_KEY`.

The image is `vllm/vllm-openai:v0.11.0` plus ffmpeg and the gateway's Python
dependencies. Source is copied to `/root/natlas_serve` rather than
pip-installed, so a Python-only change redeploys without rebuilding the CUDA
image. A longer Modal walkthrough, including billing notes, is
`serve/MODAL_SETUP.md`.

## Docker Compose

Needs Docker, the NVIDIA Container Toolkit, and a GPU with enough memory for
the 8B BF16 weights (24 GB is the floor described in `serve/README.md`).

```bash
cd serve
cp .env.example .env
# edit .env: set HF_TOKEN and NATLAS_API_KEYS
docker compose up --build
curl -fsS localhost:8080/health
```

Three services share one image:

| Service   | Role                                                 | Published port         |
| --------- | ---------------------------------------------------- | ---------------------- |
| `vllm`    | `python -m natlas_serve.vllm_launcher` on the GPU    | none                   |
| `asr`     | uvicorn `natlas_serve.asr_app:app` on port 8001, CPU | none                   |
| `gateway` | uvicorn `natlas_serve.gateway:app` on port 8080      | `${NATLAS_PORT:-8080}` |

vLLM and ASR set `NATLAS_ALLOW_ANONYMOUS=true` because they are not an edge.
Do not publish their ports. The gateway process exits if `NATLAS_API_KEYS` is
unset.

Weights cache in the named volume `hf-cache` (`/root/.cache/huggingface`).
The vLLM service sets `shm_size: 8gb`. Its health check allows a 20 minute
`start_period` because the first start downloads and loads the weights.

Compose wires `NATLAS_ASR_MODE=proxy` and `NATLAS_ASR_URL=http://asr:8001`.
The Modal app forces `local` instead, because ASR is in the same container.

## Without containers

```bash
pip install -e "serve[asr]"

# terminal 1 — GPU
NATLAS_ALLOW_ANONYMOUS=true HF_TOKEN=hf_... \
  python -m natlas_serve.vllm_launcher

# terminal 2 — speech, CPU
NATLAS_ALLOW_ANONYMOUS=true HF_TOKEN=hf_... \
  uvicorn natlas_serve.asr_app:app --port 8001

# terminal 3 — the only authenticated port
NATLAS_API_KEYS=dev-key NATLAS_ASR_MODE=proxy \
  uvicorn natlas_serve.gateway:app --port 8080
```

Generate `dev-key` with `openssl rand -hex 32`. Do not commit it.

## Clients

```bash
export NATLAS_BASE_URL=http://localhost:8080
export NATLAS_API_KEY=dev-key
```

Then use the [quickstart](/quickstart). The gateway injects `date_string` and
strips `language` on chat. You do not configure the chat template yourself.
