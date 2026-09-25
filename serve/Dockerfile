# syntax=docker/dockerfile:1
#
# One image, three roles. Which role a container plays is decided by the
# command in docker-compose.yml, not by building three near-identical images:
#
#   vllm     -> python -m vllm.entrypoints.openai.api_server  (needs a GPU)
#   asr      -> uvicorn natlas_serve.asr_app:app              (CPU is fine)
#   gateway  -> uvicorn natlas_serve.gateway:app              (CPU only)
#
# The base is vLLM's official image because building vLLM from source pulls a
# CUDA toolchain and takes the best part of an hour. It already contains
# PyTorch with CUDA, so the `asr` extra resolves to the wheels already present.
ARG VLLM_VERSION=v0.11.0
FROM vllm/vllm-openai:${VLLM_VERSION}

# The upstream image sets an ENTRYPOINT that hard-codes the vLLM server. We
# need to run three different commands, so clear it and use CMD instead.
ENTRYPOINT []

# ffmpeg is the one non-Python dependency: every upload is normalised to
# 16 kHz mono PCM before it reaches Whisper.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Models are gated and large; keep them on a mounted volume so a container
    # restart does not re-download 15 GB.
    HF_HOME=/root/.cache/huggingface

WORKDIR /app

# Copy the dependency metadata on its own first so that editing a .py file
# does not invalidate the pip layer.
COPY pyproject.toml README.md ./
COPY natlas_serve/__init__.py ./natlas_serve/__init__.py
RUN pip install --no-cache-dir -e ".[asr]"

COPY natlas_serve ./natlas_serve

# Documents intent; docker-compose maps the real ports.
EXPOSE 8000 8001 8080

# Safe default: the gateway. It is the only role that needs no GPU and no
# model download, so `docker run` without arguments does something sensible.
CMD ["uvicorn", "natlas_serve.gateway:app", "--host", "0.0.0.0", "--port", "8080"]
