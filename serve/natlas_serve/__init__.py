"""``natlas_serve`` - the self-hosting kit for N-ATLaS.

Puts Nigeria's sovereign LLM and its four ASR models behind one
OpenAI-compatible base URL:

* ``POST /v1/chat/completions``     -> ``NCAIR1/N-ATLaS`` via vLLM, streaming
* ``POST /v1/audio/transcriptions`` -> the matching ``NCAIR1`` Whisper model
* ``GET  /health``                  -> upstream status, unauthenticated

Deployed either as three containers (``docker-compose.yml``) or as a single
Modal container sharing one GPU (``modal_app.py``).
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]
