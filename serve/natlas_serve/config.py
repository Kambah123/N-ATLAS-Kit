"""Environment-driven configuration.

Every secret arrives through the environment. Nothing is read from disk, and
nothing is baked into an image.
"""

from __future__ import annotations

import os
import shlex
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal

from natlas_serve.languages import ASR_MODEL_IDS, LLM_MODEL_ID, Language

AsrMode = Literal["local", "proxy"]


class ConfigError(RuntimeError):
    """Raised at startup when the environment is unsafe or incoherent."""


def _flag(env: Mapping[str, str], key: str, default: bool) -> bool:
    raw = env.get(key)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _float(env: Mapping[str, str], key: str, default: float) -> float:
    raw = env.get(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{key} must be a number, got {raw!r}") from exc


def _int(env: Mapping[str, str], key: str, default: int) -> int:
    raw = env.get(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{key} must be an integer, got {raw!r}") from exc


@dataclass(frozen=True, slots=True)
class Settings:
    """Resolved configuration for the gateway and the ASR server."""

    # --- auth -------------------------------------------------------------
    api_keys: frozenset[str] = frozenset()
    allow_anonymous: bool = False

    # --- http -------------------------------------------------------------
    cors_origins: tuple[str, ...] = ()
    request_timeout: float = 120.0
    max_upload_bytes: int = 64 * 1024 * 1024

    # --- llm --------------------------------------------------------------
    llm_model: str = LLM_MODEL_ID
    vllm_url: str = "http://127.0.0.1:8000"
    #: N-ATLaS's chat template takes a ``date_string``, exactly as the model
    #: card's own example does. We inject today's date so the prompt matches
    #: the shape the model was evaluated with.
    inject_date_string: bool = True
    #: Ask vLLM to emit a final usage chunk when streaming, so we can log token
    #: counts without ever touching the content.
    include_usage: bool = True

    # --- vllm launch (read by modal_app.py and the docker entrypoint) ------
    #: The model card caps useful context at 8,092 tokens; 8,192 is the nearest
    #: power of two and what vLLM is actually asked to reserve.
    vllm_max_model_len: int = 8192
    vllm_gpu_memory_utilization: float = 0.90
    #: Escape hatch for anything we have not modelled, e.g.
    #: ``NATLAS_VLLM_EXTRA_ARGS="--enable-prefix-caching --swap-space 8"``.
    vllm_extra_args: tuple[str, ...] = ()

    # --- asr --------------------------------------------------------------
    asr_mode: AsrMode = "local"
    asr_url: str = "http://127.0.0.1:8001"
    asr_models: dict[Language, str] = field(default_factory=lambda: dict(ASR_MODEL_IDS))
    asr_device: str = "cpu"
    asr_chunk_seconds: float = 25.0

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """Build settings from the process environment (or an injected map)."""
        env = os.environ if env is None else env

        keys = frozenset(_csv(env.get("NATLAS_API_KEYS")))
        allow_anonymous = _flag(env, "NATLAS_ALLOW_ANONYMOUS", default=False)

        if not keys and not allow_anonymous:
            raise ConfigError(
                "No API keys configured. The gateway refuses to start wide open.\n"
                "  Generate one:  openssl rand -hex 32\n"
                "  Then set:      NATLAS_API_KEYS=<key>[,<key2>]\n"
                "  For a throwaway local box only, set NATLAS_ALLOW_ANONYMOUS=true."
            )

        asr_mode = env.get("NATLAS_ASR_MODE", "local").strip().lower()
        if asr_mode not in ("local", "proxy"):
            raise ConfigError(f"NATLAS_ASR_MODE must be 'local' or 'proxy', got {asr_mode!r}")

        device = env.get("NATLAS_ASR_DEVICE", "cpu").strip().lower()
        if device not in ("cpu", "cuda", "auto"):
            raise ConfigError(f"NATLAS_ASR_DEVICE must be cpu, cuda or auto, got {device!r}")

        raw_extra = env.get("NATLAS_VLLM_EXTRA_ARGS", "")
        try:
            extra_args = tuple(shlex.split(raw_extra))
        except ValueError as exc:
            raise ConfigError(f"NATLAS_VLLM_EXTRA_ARGS is not shell-parseable: {exc}") from exc

        utilisation = _float(env, "NATLAS_VLLM_GPU_MEMORY_UTILIZATION", 0.90)
        if not 0.0 < utilisation <= 1.0:
            raise ConfigError(
                f"NATLAS_VLLM_GPU_MEMORY_UTILIZATION must be in (0, 1], got {utilisation}"
            )

        models: dict[Language, str] = dict(ASR_MODEL_IDS)
        for code in models:
            override = env.get(f"NATLAS_ASR_MODEL_{code.upper()}")
            if override and override.strip():
                models[code] = override.strip()

        return cls(
            api_keys=keys,
            allow_anonymous=allow_anonymous,
            cors_origins=_csv(env.get("NATLAS_CORS_ORIGINS")),
            request_timeout=_float(env, "NATLAS_REQUEST_TIMEOUT", 120.0),
            max_upload_bytes=_int(env, "NATLAS_MAX_UPLOAD_BYTES", 64 * 1024 * 1024),
            llm_model=env.get("NATLAS_LLM_MODEL", LLM_MODEL_ID).strip() or LLM_MODEL_ID,
            vllm_url=env.get("NATLAS_VLLM_URL", "http://127.0.0.1:8000").rstrip("/"),
            inject_date_string=_flag(env, "NATLAS_INJECT_DATE_STRING", default=True),
            include_usage=_flag(env, "NATLAS_INCLUDE_USAGE", default=True),
            vllm_max_model_len=_int(env, "NATLAS_VLLM_MAX_MODEL_LEN", 8192),
            vllm_gpu_memory_utilization=utilisation,
            vllm_extra_args=extra_args,
            asr_mode=asr_mode,  # type: ignore[arg-type]
            asr_url=env.get("NATLAS_ASR_URL", "http://127.0.0.1:8001").rstrip("/"),
            asr_models=models,
            asr_device=device,
            asr_chunk_seconds=_float(env, "NATLAS_ASR_CHUNK_SECONDS", 25.0),
        )
