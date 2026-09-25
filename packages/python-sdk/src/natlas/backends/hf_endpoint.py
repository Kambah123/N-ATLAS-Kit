"""A Hugging Face Inference Endpoint running N-ATLaS under vLLM.

It speaks the same OpenAI-compatible protocol as ``/serve``. Point
``base_url`` at that endpoint. Speech routes exist only when the endpoint
is the N-ATLAS Kit gateway.
"""

from __future__ import annotations

from natlas.backends.openai_compatible import (
    resolve_openai_compatible_base as resolve_hf_endpoint_base,
)

__all__ = ["resolve_hf_endpoint_base"]
