"""``natlas`` — the Python SDK for N-ATLaS, Nigeria's sovereign multilingual LLM.

Every inference path talks to ``NCAIR1/N-ATLaS`` or an ``NCAIR1`` ASR model.
Point :class:`NAtlas` at a ``/serve`` gateway (``NATLAS_BASE_URL`` +
``NATLAS_API_KEY``). There is no public hosted API, and this package will
not call any other vendor's model.

Sync and async clients share one API surface, both built on ``httpx``.
"""

from __future__ import annotations

from natlas.async_client import AsyncNAtlas as AsyncNAtlas
from natlas.client import NAtlas as NAtlas
from natlas.constants import (
    ASR_MAX_SEGMENT_SECONDS as ASR_MAX_SEGMENT_SECONDS,
)
from natlas.constants import (
    ASR_MODEL_IDS as ASR_MODEL_IDS,
)
from natlas.constants import (
    ASR_SAMPLE_RATE as ASR_SAMPLE_RATE,
)
from natlas.constants import (
    ATTRIBUTION as ATTRIBUTION,
)
from natlas.constants import (
    BACKENDS as BACKENDS,
)
from natlas.constants import (
    LANGUAGE_NAMES as LANGUAGE_NAMES,
)
from natlas.constants import (
    LANGUAGES as LANGUAGES,
)
from natlas.constants import (
    LLM_CONTEXT_TOKENS as LLM_CONTEXT_TOKENS,
)
from natlas.constants import (
    LLM_MODEL_ID as LLM_MODEL_ID,
)
from natlas.constants import (
    Backend as Backend,
)
from natlas.constants import (
    Language as Language,
)
from natlas.constants import (
    is_language as is_language,
)
from natlas.errors import AbortError as AbortError
from natlas.errors import AuthError as AuthError
from natlas.errors import BadRequestError as BadRequestError
from natlas.errors import NAtlasError as NAtlasError
from natlas.errors import NetworkError as NetworkError
from natlas.errors import RateLimitError as RateLimitError
from natlas.errors import ServerError as ServerError
from natlas.errors import TimeoutError as TimeoutError
from natlas.languages import language_from_model_text as language_from_model_text
from natlas.languages import normalise_language as normalise_language
from natlas.models import ChatResult as ChatResult
from natlas.models import ChatStreamChunk as ChatStreamChunk
from natlas.models import HealthStatus as HealthStatus
from natlas.models import LanguageDetection as LanguageDetection
from natlas.models import ModelInfo as ModelInfo
from natlas.models import ModelList as ModelList
from natlas.models import Summary as Summary
from natlas.models import Transcription as Transcription
from natlas.models import Translation as Translation
from natlas.models import Usage as Usage
from natlas.models import VoiceChatResult as VoiceChatResult
from natlas.version import __version__ as __version__

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
    "AbortError",
    "AsyncNAtlas",
    "AuthError",
    "Backend",
    "BadRequestError",
    "ChatResult",
    "ChatStreamChunk",
    "HealthStatus",
    "Language",
    "LanguageDetection",
    "ModelInfo",
    "ModelList",
    "NAtlas",
    "NAtlasError",
    "NetworkError",
    "RateLimitError",
    "ServerError",
    "Summary",
    "TimeoutError",
    "Transcription",
    "Translation",
    "Usage",
    "VoiceChatResult",
    "__version__",
    "is_language",
    "language_from_model_text",
    "normalise_language",
]
