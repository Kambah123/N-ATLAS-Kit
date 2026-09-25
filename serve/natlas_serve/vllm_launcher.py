"""Building and supervising the vLLM subprocess that serves N-ATLaS.

Two things here are less obvious than they look.

**1. Request logging must be off.** vLLM's OpenAI server logs full prompts at
INFO by default in some versions. We promise never to log user content, so the
flag has to be correct - but its *name* changed across versions
(``--disable-log-requests`` became the negatable ``--enable-log-requests``).
Rather than pin a vLLM version and hope, :func:`log_request_flag` asks the
installed binary what it accepts and picks the right one.

**2. The chat template.** We never pass ``--chat-template``. N-ATLaS ships its
own in ``tokenizer_config.json`` and vLLM applies it automatically; overriding
it would silently change the prompt the model was fine-tuned on. The template
takes a ``date_string`` variable, which the gateway supplies per request via
``chat_template_kwargs``.
"""

from __future__ import annotations

import subprocess
import sys
import time
from collections.abc import Mapping, Sequence

from natlas_serve.config import Settings
from natlas_serve.languages import LLM_MODEL_ID

DEFAULT_MAX_MODEL_LEN = 8192
DEFAULT_GPU_MEMORY_UTILIZATION = 0.90
DEFAULT_DTYPE = "bfloat16"


def log_request_flag(help_text: str) -> list[str]:
    """Choose the flag that turns vLLM's per-request prompt logging OFF.

    Newer vLLM exposes ``--enable-log-requests`` (default off) and accepts
    ``--no-enable-log-requests``; older vLLM exposes ``--disable-log-requests``.
    Passing the wrong one is fatal - argparse rejects unknown flags - so we read
    ``--help`` and decide.
    """
    if "--disable-log-requests" in help_text:
        return ["--disable-log-requests"]
    if "--enable-log-requests" in help_text:
        # Default is already off; be explicit so an upstream default flip
        # cannot start leaking prompts into our logs.
        return ["--no-enable-log-requests"]
    return []


def probe_help(command: Sequence[str], timeout: float = 120.0) -> str:
    """Run ``<command> --help`` and return its output (stdout + stderr)."""
    try:
        proc = subprocess.run(
            [*command, "--help"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return (proc.stdout or "") + (proc.stderr or "")


def build_command(
    *,
    model: str = LLM_MODEL_ID,
    host: str = "127.0.0.1",
    port: int = 8000,
    max_model_len: int = DEFAULT_MAX_MODEL_LEN,
    gpu_memory_utilization: float = DEFAULT_GPU_MEMORY_UTILIZATION,
    dtype: str = DEFAULT_DTYPE,
    help_text: str | None = None,
    extra_args: Sequence[str] = (),
    python: str | None = None,
) -> list[str]:
    """The exact argv used to serve N-ATLaS.

    Deliberately absent: ``--chat-template``. The model's own template wins.
    """
    base = [python or sys.executable, "-m", "vllm.entrypoints.openai.api_server"]
    command = [
        *base,
        "--model",
        model,
        # Clients address the model by its Hugging Face id, which is also what
        # the SDKs and the docs use.
        "--served-model-name",
        model,
        "--host",
        host,
        "--port",
        str(port),
        # The model card caps useful context at 8,092 tokens even though
        # max_position_embeddings is 131,072. Asking for more would make vLLM
        # reserve a KV cache we cannot fit on a 24 GB card.
        "--max-model-len",
        str(max_model_len),
        "--gpu-memory-utilization",
        str(gpu_memory_utilization),
        "--dtype",
        dtype,
    ]
    command += log_request_flag(help_text if help_text is not None else probe_help(base))
    command += list(extra_args)
    return command


def wait_until_healthy(
    url: str,
    *,
    timeout: float = 900.0,
    interval: float = 3.0,
    process: subprocess.Popen[bytes] | None = None,
) -> bool:
    """Poll vLLM's ``/health`` until it answers, the process dies, or we time out.

    Loading 15 GB of BF16 weights takes minutes on a cold cache, hence the
    generous default.
    """
    import urllib.error
    import urllib.request

    deadline = time.monotonic() + timeout
    health_url = url.rstrip("/") + "/health"

    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(health_url, timeout=5) as resp:
                if 200 <= resp.status < 300:
                    return True
        except (urllib.error.URLError, OSError, TimeoutError):
            pass
        time.sleep(interval)
    return False


def command_from_settings(
    settings: Settings,
    *,
    host: str = "127.0.0.1",
    port: int = 8000,
    help_text: str | None = None,
) -> list[str]:
    """Bridge :class:`Settings` to :func:`build_command`.

    Used by both deployment paths so a docker-compose stack and a Modal
    container start vLLM with byte-identical arguments.
    """
    return build_command(
        model=settings.llm_model,
        host=host,
        port=port,
        max_model_len=settings.vllm_max_model_len,
        gpu_memory_utilization=settings.vllm_gpu_memory_utilization,
        extra_args=settings.vllm_extra_args,
        help_text=help_text,
    )


def environment(hf_token: str | None, base: Mapping[str, str]) -> dict[str, str]:
    """Environment for the vLLM child process.

    The HF token is passed through because every NCAIR1 repo is gated. It is
    never written to disk or echoed.
    """
    env = dict(base)
    if hf_token:
        env["HF_TOKEN"] = hf_token
        env["HUGGING_FACE_HUB_TOKEN"] = hf_token
    env.setdefault("VLLM_LOGGING_LEVEL", "WARNING")
    return env


def main() -> None:
    """Entry point for ``python -m natlas_serve.vllm_launcher``.

    Reads the same ``NATLAS_*`` environment the gateway reads, then *replaces*
    this process with vLLM via ``execvpe`` - so vLLM becomes PID 1 in the
    container and receives Docker's stop signals directly, with no supervisor
    in between to swallow them.
    """
    import os

    settings = Settings.from_env()
    host = os.environ.get("NATLAS_VLLM_HOST", "0.0.0.0")
    port = int(os.environ.get("NATLAS_VLLM_PORT", "8000"))

    command = command_from_settings(settings, host=host, port=port)
    env = environment(os.environ.get("HF_TOKEN"), os.environ)

    # Log the argv (never the token) so an operator can see what was launched.
    print("starting vLLM:", " ".join(command), flush=True)
    os.execvpe(command[0], command, env)


if __name__ == "__main__":  # pragma: no cover - process replacement
    main()
