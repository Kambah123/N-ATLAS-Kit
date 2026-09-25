"""N-ATLaS on Modal: one GPU container, one base URL, LLM + speech.

    modal secret create natlas-hf HF_TOKEN=hf_xxxx   # once
    modal run serve/modal_preflight.py               # verify access + VRAM
    modal deploy serve/modal_app.py                  # go live

Read ``serve/MODAL_SETUP.md`` first if you have never used Modal.

Why one container instead of three
----------------------------------
The docker-compose stack splits vLLM, ASR and the gateway across three
services. On Modal that would mean three containers, and the two that matter
would each hold a GPU. Instead this module runs all three *inside* one
container:

* vLLM is started as a **subprocess** in ``@modal.enter()`` and owns the GPU.
* Whisper runs in-process on the **CPU** (``NATLAS_ASR_DEVICE=cpu``). vLLM
  pre-allocates its KV cache from free VRAM at startup, so a second CUDA
  process on the same card is an OOM waiting to happen. Whisper Small is 244M
  parameters; on the 4 vCPUs this container requests, a 30-second clip
  transcribes in a few seconds.
* The gateway is the ASGI app Modal exposes, with the ASR router mounted
  in-process behind the same Bearer auth.

One container also means one cold start, one HF cache volume, and one URL.

Cost
----
Modal bills per second and scales to zero. ``A10`` is $0.000306/s
(~$1.10/hour); the ``L4`` fallback is $0.000222/s (~$0.80/hour). Nothing is
charged while no requests are in flight, but ``scaledown_window`` keeps the
container warm for five minutes after the last one - a cold start reloads
15 GB of weights, so paying for five idle minutes beats making the next user
wait several minutes.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import modal

# ---------------------------------------------------------------------------
# Names. These must match modal_preflight.py and MODAL_SETUP.md.
# ---------------------------------------------------------------------------

APP_NAME = "natlas-serve"
SECRET_NAME = "natlas-hf"
CACHE_VOLUME = "natlas-hf-cache"

#: Where vLLM listens *inside* the container. Never published; the gateway is
#: the only thing Modal exposes.
VLLM_HOST = "127.0.0.1"
VLLM_PORT = 8000
VLLM_URL = f"http://{VLLM_HOST}:{VLLM_PORT}"

#: Weights land here, on a persistent Volume. Without it every cold start
#: re-downloads ~15 GB from Hugging Face.
HF_CACHE_DIR = "/root/.cache/huggingface"

SOURCE_DIR = Path(__file__).parent / "natlas_serve"

# ---------------------------------------------------------------------------
# Image
# ---------------------------------------------------------------------------

image = (
    # vLLM's own image: CUDA, PyTorch and vLLM already resolved against each
    # other. Building vLLM from source here would add ~40 minutes per change.
    modal.Image.from_registry("vllm/vllm-openai:v0.11.0")
    # That image's ENTRYPOINT launches the vLLM server. Modal needs to run its
    # own process, so clear it.
    .entrypoint([])
    # v0.11.0 installs Python as `python3` only (`/usr/bin/python3` via
    # update-alternatives). There is no `python` binary. Modal's pip_install
    # runs `python -m pip`, which exits 127 (`/bin/sh: 1: python: not found`)
    # until this link exists. The container worker looks up `python` too.
    .run_commands('ln -sf "$(command -v python3)" /usr/local/bin/python')
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi>=0.115",
        "python-multipart>=0.0.9",
        "httpx>=0.27",
        "numpy>=1.26",
        # transformers/torch/accelerate are already in the base image.
    )
    .env(
        {
            "HF_HOME": HF_CACHE_DIR,
            # natlas_serve is copied to /root, not pip-installed, so that a
            # code change redeploys in seconds instead of rebuilding a layer.
            "PYTHONPATH": "/root",
            "PYTHONUNBUFFERED": "1",
        }
    )
    .add_local_dir(SOURCE_DIR, remote_path="/root/natlas_serve")
)

app = modal.App(APP_NAME)

hf_cache = modal.Volume.from_name(CACHE_VOLUME, create_if_missing=True)
hf_secret = modal.Secret.from_name(SECRET_NAME)

#: Gateway credentials. Created by the operator, separately from the HF token,
#: so rotating an API key never touches Hugging Face access:
#:
#:     modal secret create natlas-api NATLAS_API_KEYS=$(openssl rand -hex 32)
#:
#: ``required_keys`` makes a missing secret fail at deploy time with a clear
#: message rather than at the first request.
api_secret = modal.Secret.from_name("natlas-api", required_keys=["NATLAS_API_KEYS"])


@app.cls(
    image=image,
    # A10 (24 GB) is the cheapest card that fits 15 GB of BF16 weights with
    # room left for a useful KV cache. L4 is the fallback: same 24 GB, cheaper,
    # meaningfully slower. Modal writes this as "A10", not "A10G".
    gpu=["A10", "L4"],
    # Whisper runs on these cores, so do not skimp.
    cpu=4.0,
    memory=16384,
    volumes={HF_CACHE_DIR: hf_cache},
    secrets=[hf_secret, api_secret],
    # Cold start = download (first time only) + load 15 GB into VRAM.
    timeout=60 * 60,
    scaledown_window=300,
    # Deliberately absent: min_containers. Keeping a GPU warm around the clock
    # costs ~$790/month. Set it only for a judged demo, and set it back after.
)
@modal.concurrent(max_inputs=8)
class NatlasService:
    """vLLM + Whisper + gateway, sharing one container."""

    @modal.enter()
    def start(self) -> None:
        """Launch vLLM, wait for it, then build the ASGI app.

        Runs once per container, before any request is served. Modal will not
        route traffic here until this returns.
        """
        from natlas_serve import asr_app, gateway, vllm_launcher
        from natlas_serve.config import Settings
        from natlas_serve.observability import configure_logging
        from natlas_serve.transcriber import WhisperTranscriber

        configure_logging()

        # The gateway talks to vLLM over loopback and serves ASR in-process,
        # so pin those regardless of what the environment says.
        env = dict(os.environ)
        env["NATLAS_VLLM_URL"] = VLLM_URL
        env["NATLAS_ASR_MODE"] = "local"
        env.setdefault("NATLAS_ASR_DEVICE", "cpu")  # see module docstring
        settings = Settings.from_env(env)

        command = vllm_launcher.command_from_settings(settings, host=VLLM_HOST, port=VLLM_PORT)
        print("starting vLLM:", " ".join(command), flush=True)

        self.vllm = subprocess.Popen(
            command,
            env=vllm_launcher.environment(env.get("HF_TOKEN"), env),
        )

        # First ever start also downloads ~15 GB, hence the long timeout.
        healthy = vllm_launcher.wait_until_healthy(VLLM_URL, timeout=1800.0, process=self.vllm)
        if not healthy:
            code = self.vllm.poll()
            raise RuntimeError(
                "vLLM did not become healthy. "
                f"exit code={code}. "
                "Most likely causes: the HF token in the 'natlas-hf' secret has not "
                "accepted the N-ATLaS terms, or the model does not fit this GPU. "
                "Run `modal run serve/modal_preflight.py` to find out which."
            )

        # Persist the freshly downloaded weights so the next cold start skips
        # the download entirely.
        hf_cache.commit()

        transcriber = WhisperTranscriber(settings.asr_models, device=settings.asr_device)
        self.app = gateway.create_app(
            settings,
            asr_router=asr_app.build_router(settings, transcriber),
        )

    @modal.exit()
    def stop(self) -> None:
        """Shut vLLM down cleanly so the GPU is released promptly."""
        proc = getattr(self, "vllm", None)
        if proc is None or proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()

    @modal.asgi_app()
    def serve(self) -> Any:
        """The public surface: /v1/chat/completions, /v1/audio/transcriptions, /health."""
        return self.app


@app.local_entrypoint()
def main() -> None:
    """``modal run serve/modal_app.py`` - a smoke test against the live container.

    Deploys nothing permanent. Starts the container, checks /health, and prints
    the URL. Use `modal deploy` for a URL that outlives this process.
    """
    import urllib.request

    url = NatlasService().serve.get_web_url()
    print(f"\ngateway: {url}")
    print("waiting for the container to report healthy (cold start: several minutes)...")

    with urllib.request.urlopen(f"{url}/health", timeout=1800) as resp:
        print(f"/health -> {resp.status}")
        print(resp.read().decode())

    print(f"\nTry it:\n  curl {url}/health")
    print(f"  curl -H 'Authorization: Bearer $NATLAS_API_KEY' {url}/v1/models\n")
