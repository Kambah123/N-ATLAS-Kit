"""Loose language tags, matching the aliases the gateway accepts.

See ``serve/natlas_serve/languages.py``. The client normalises these before
the request so a typo fails here, with a typed error, instead of as a 400
from the ASR service.
"""

from __future__ import annotations

import re

from natlas.constants import LANGUAGE_NAMES, Language
from natlas.errors import BadRequestError

_ALIASES: dict[str, Language] = {
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
    "yorùbá": "yo",
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

_LANGUAGE_RE = re.compile(
    r"\b(hausa|igbo|yoruba|yorùbá|nigerian english|english|naija|hau|ibo|yor|eng|ha|ig|yo|en)\b"
)


def normalise_language(value: object) -> Language:
    """Map loose user input onto ``ha`` | ``ig`` | ``yo`` | ``en``."""
    if not isinstance(value, str):
        raise BadRequestError(_unsupported(value))
    key = value.strip().lower().replace("_", "-")
    language = _ALIASES.get(key)
    if language is None:
        raise BadRequestError(_unsupported(value))
    return language


def try_normalise_language(value: object) -> Language | None:
    """Like :func:`normalise_language`, but returns ``None`` instead of raising."""
    try:
        return normalise_language(value)
    except BadRequestError:
        return None


def language_from_model_text(text: str) -> Language | None:
    """Pull a language code out of a short model reply.

    ``detect_language`` asks N-ATLaS to answer with a bare code. Replies
    sometimes grow a word or a full stop. This accepts ``ha``, ``Hausa.``,
    and ``The language is Yoruba``. It returns ``None`` when nothing matches
    — the helper does not guess.
    """
    trimmed = text.strip().lower().rstrip(".!?").strip()
    exact = try_normalise_language(trimmed)
    if exact is not None:
        return exact
    match = _LANGUAGE_RE.search(trimmed)
    if match is None:
        return None
    return try_normalise_language(match.group(0))


def _unsupported(value: object) -> str:
    names = ", ".join(f"{code} ({LANGUAGE_NAMES[code][0]})" for code in LANGUAGE_NAMES)
    shown = repr(value) if isinstance(value, str) else str(value)
    return f"Unsupported language {shown}. N-ATLaS supports: {names}. Pass one of: ha, ig, yo, en."
