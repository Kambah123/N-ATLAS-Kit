"""Whisper inference against the four NCAIR1 ASR models.

``torch`` and ``transformers`` are imported lazily, inside methods. That keeps
the gateway image small (it never needs them), lets the unit tests run without
a 2.5 GB torch install, and means a misconfigured language fails fast with a
clear error instead of an import error.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

from natlas_serve.languages import Language

if TYPE_CHECKING:  # pragma: no cover
    import numpy as np


class Transcriber(Protocol):
    """What the ASR routes need. Implemented for real below, stubbed in tests."""

    def transcribe(self, samples: np.ndarray, language: Language) -> str:
        """Transcribe one <=30 s chunk of 16 kHz mono int16 PCM."""
        ...

    def loaded_languages(self) -> list[Language]:
        """Languages whose model is currently resident in memory."""
        ...


def resolve_device(requested: str) -> str:
    """Turn ``auto`` into a concrete device, without importing torch eagerly."""
    if requested != "auto":
        return requested
    try:
        import torch
    except ImportError:  # pragma: no cover - torch absent means CPU anyway
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


class WhisperTranscriber:
    """Loads each NCAIR1 ASR model on first use and keeps it resident.

    Lazy loading matters: holding all four costs ~1.8 GB, and most deployments
    only ever see one or two languages. It also keeps cold start short - the
    container answers ``/health`` before any model is downloaded.
    """

    def __init__(
        self,
        models: dict[Language, str],
        *,
        device: str = "cpu",
        dtype: str | None = None,
    ) -> None:
        self._models = models
        self._device = resolve_device(device)
        self._dtype = dtype
        self._cache: dict[Language, Any] = {}

    @property
    def device(self) -> str:
        return self._device

    def model_id(self, language: Language) -> str:
        return self._models[language]

    def loaded_languages(self) -> list[Language]:
        return sorted(self._cache)

    def _pipeline(self, language: Language) -> Any:
        cached = self._cache.get(language)
        if cached is not None:
            return cached

        import torch
        from transformers import pipeline

        if self._dtype is not None:
            torch_dtype = getattr(torch, self._dtype)
        else:
            torch_dtype = torch.float16 if self._device == "cuda" else torch.float32

        asr = pipeline(
            "automatic-speech-recognition",
            model=self._models[language],
            device=0 if self._device == "cuda" else -1,
            torch_dtype=torch_dtype,
        )
        self._cache[language] = asr
        return asr

    def warmup(self, language: Language) -> None:
        """Force a model into memory ahead of the first real request."""
        self._pipeline(language)

    def transcribe(self, samples: np.ndarray, language: Language) -> str:
        from natlas_serve.audio import SAMPLE_RATE, to_float32

        asr = self._pipeline(language)
        result = asr(
            {"raw": to_float32(samples), "sampling_rate": SAMPLE_RATE},
            generate_kwargs={"task": "transcribe"},
        )
        text = result.get("text", "") if isinstance(result, dict) else str(result)
        return str(text).strip()
