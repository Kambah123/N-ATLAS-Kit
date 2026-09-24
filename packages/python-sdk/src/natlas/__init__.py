"""``natlas`` -- the Python SDK for N-ATLaS, Nigeria's sovereign multilingual LLM.

Status
------
Scaffold only. This package currently exposes verified model metadata; the
sync and async clients, backend adapters, ``local`` transformers backend and
the ``natlas`` CLI arrive in the next milestone. See the planned-features list
in the repository README.

Design commitments
------------------
* Every inference path talks to ``NCAIR1/N-ATLaS`` or an ``NCAIR1`` ASR model.
  No other LLM is ever called.
* Sync and async clients share one API surface, both built on ``httpx``.
* Backends are pluggable, so the official NCAIR API can be added in one file.
"""

from __future__ import annotations

from natlas.constants import (
    ASR_MAX_SEGMENT_SECONDS,
    ASR_MODEL_IDS,
    ASR_SAMPLE_RATE,
    ATTRIBUTION,
    BACKENDS,
    LANGUAGE_NAMES,
    LANGUAGES,
    LLM_CONTEXT_TOKENS,
    LLM_MODEL_ID,
    Backend,
    Language,
    is_language,
)

__version__ = "0.0.0"

__all__ = [
    "ASR_MAX_SEGMENT_SECONDS",
    "ASR_MODEL_IDS",
    "ASR_SAMPLE_RATE",
    "ATTRIBUTION",
    "BACKENDS",
    "LANGUAGES",
    "LANGUAGE_NAMES",
    "LLM_CONTEXT_TOKENS",
    "LLM_MODEL_ID",
    "Backend",
    "Language",
    "__version__",
    "is_language",
]
