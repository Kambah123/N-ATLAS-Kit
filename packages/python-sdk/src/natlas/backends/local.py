"""In-process weights are a later milestone. This build only speaks HTTP."""

from __future__ import annotations

from natlas.errors import NAtlasError


def local_backend_unavailable() -> None:
    raise NAtlasError(
        "The local transformers backend is not implemented in this version. "
        "Point base_url at a /serve gateway. Loading NCAIR1 weights in-process "
        "needs a GPU and is not part of the HTTP client."
    )
