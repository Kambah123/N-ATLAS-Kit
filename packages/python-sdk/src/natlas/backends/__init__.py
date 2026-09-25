"""Backend adapters.

``openai-compatible`` and ``hf-endpoint`` speak the same wire protocol as
``/serve``. ``official`` and ``local`` are reserved and raise, rather than
pretending a public NCAIR API or an in-process model exists.
"""

from __future__ import annotations

from natlas.backends.hf_endpoint import resolve_hf_endpoint_base
from natlas.backends.local import local_backend_unavailable
from natlas.backends.official import official_backend_unavailable
from natlas.backends.openai_compatible import resolve_openai_compatible_base

__all__ = [
    "local_backend_unavailable",
    "official_backend_unavailable",
    "resolve_hf_endpoint_base",
    "resolve_openai_compatible_base",
]
