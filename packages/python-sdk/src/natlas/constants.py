"""Stable facts about N-ATLaS, verified against the Hugging Face model cards.

Verified 2025-09-24. Everything here is descriptive metadata about the real
models -- no inference logic lives in this module.
"""

from __future__ import annotations

from typing import Final, Literal, TypeGuard, get_args

#: The four languages N-ATLaS supports.
Language = Literal["ha", "ig", "yo", "en"]

LANGUAGES: Final[tuple[Language, ...]] = get_args(Language)

#: Human-readable names, in English and in the language itself.
LANGUAGE_NAMES: Final[dict[Language, tuple[str, str]]] = {
    "ha": ("Hausa", "Hausa"),
    "ig": ("Igbo", "Igbo"),
    "yo": ("Yoruba", "Yorùbá"),
    "en": ("Nigerian English", "Nigerian English"),
}

#: The N-ATLaS text model: ``LlamaForCausalLM``, a Llama-3 8B fine-tune.
#: 32 layers, hidden size 4096, 32 attention heads, 8 KV heads,
#: vocab 128,256, BF16. Gated on Hugging Face -- accept the terms and set
#: ``HF_TOKEN`` before downloading.
#: https://huggingface.co/NCAIR1/N-ATLaS
LLM_MODEL_ID: Final = "NCAIR1/N-ATLaS"

#: Context window to plan against.
#:
#: ``config.json`` reports ``max_position_embeddings: 131072``, but the model
#: card states a usable context of 8,092 tokens, so that is what we budget for.
LLM_CONTEXT_TOKENS: Final = 8092

#: The four ASR models, keyed by language.
#:
#: Each is a Whisper Small (244M) fine-tune with a hard 30-second input window,
#: expecting 16 kHz mono audio. Longer audio has to be chunked. All gated.
ASR_MODEL_IDS: Final[dict[Language, str]] = {
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "yo": "NCAIR1/Yoruba-ASR",
    "en": "NCAIR1/NigerianAccentedEnglish",
}

#: Maximum audio the ASR models accept in a single forward pass, in seconds.
ASR_MAX_SEGMENT_SECONDS: Final = 30

#: Sample rate the ASR models expect, in Hz. Mono.
ASR_SAMPLE_RATE: Final = 16_000

#: Backend adapters. ``official`` is reserved for the NCAIR API once it exists.
Backend = Literal["openai-compatible", "hf-endpoint", "official", "local"]

BACKENDS: Final[tuple[Backend, ...]] = get_args(Backend)

#: Attribution required by the N-ATLaS Terms of Use for any public use.
ATTRIBUTION: Final = (
    "N-ATLaS is an initiative of the Federal Ministry of Communications, "
    "Innovation and Digital Economy, and powered by Awarri Technologies."
)


def is_language(value: object) -> TypeGuard[Language]:
    """Narrow untrusted input to a supported :data:`Language`."""
    return value in LANGUAGES
