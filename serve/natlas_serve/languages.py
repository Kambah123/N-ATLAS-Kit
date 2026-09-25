"""Language codes and the ASR model each one routes to.

Verified against the Hugging Face model cards on 2026-09-24. All five repos are
gated: accept the terms and supply an ``HF_TOKEN``.
"""

from __future__ import annotations

from typing import Final, Literal, get_args

Language = Literal["ha", "ig", "yo", "en"]

LANGUAGES: Final[tuple[Language, ...]] = get_args(Language)

#: The N-ATLaS text model. LlamaForCausalLM, a Llama-3 8B fine-tune.
LLM_MODEL_ID: Final = "NCAIR1/N-ATLaS"

#: Whisper Small (244M) fine-tunes, one per language. 30 s window, 16 kHz mono.
ASR_MODEL_IDS: Final[dict[Language, str]] = {
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "yo": "NCAIR1/Yoruba-ASR",
    "en": "NCAIR1/NigerianAccentedEnglish",
}

LANGUAGE_NAMES: Final[dict[Language, str]] = {
    "ha": "Hausa",
    "ig": "Igbo",
    "yo": "Yoruba",
    "en": "Nigerian English",
}

# Accept what people actually type. ISO-639-1, ISO-639-2/3, the English name,
# the endonym, and BCP-47 tags with a region.
_ALIASES: Final[dict[str, Language]] = {
    "ha": "ha",
    "hau": "ha",
    "hausa": "ha",
    "ha-ng": "ha",
    "ig": "ig",
    "ibo": "ig",
    "igbo": "ig",
    "ig-ng": "ig",
    "yo": "yo",
    "yor": "yo",
    "yoruba": "yo",
    "yor\u00f9b\u00e1": "yo",
    "yo-ng": "yo",
    "en": "en",
    "eng": "en",
    "english": "en",
    "en-ng": "en",
    "en-us": "en",
    "en-gb": "en",
    "nigerian english": "en",
    "naija": "en",
}


class UnsupportedLanguageError(ValueError):
    """Raised when a caller asks for a language N-ATLaS does not cover."""

    def __init__(self, value: object) -> None:
        self.value = value
        supported = ", ".join(f"{code} ({LANGUAGE_NAMES[code]})" for code in LANGUAGES)
        super().__init__(
            f"Unsupported language {value!r}. N-ATLaS supports: {supported}. "
            "Pass one of: ha, ig, yo, en."
        )


def normalise_language(value: object) -> Language:
    """Map loose user input onto one of the four supported codes.

    >>> normalise_language("Hausa")
    'ha'
    >>> normalise_language("en-NG")
    'en'
    """
    if not isinstance(value, str):
        raise UnsupportedLanguageError(value)
    key = value.strip().lower().replace("_", "-")
    if key in _ALIASES:
        return _ALIASES[key]
    raise UnsupportedLanguageError(value)


def asr_model_for(language: Language) -> str:
    """The NCAIR1 ASR repo that serves this language."""
    return ASR_MODEL_IDS[language]
