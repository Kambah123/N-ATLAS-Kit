"""There is no public NCAIR API yet. Fail loudly rather than invent one."""

from __future__ import annotations

from natlas.errors import NAtlasError


def official_backend_unavailable() -> None:
    raise NAtlasError(
        "The official NCAIR API is not public yet. Use backend "
        '"openai-compatible" and point base_url at a /serve gateway '
        "(see serve/README.md)."
    )
