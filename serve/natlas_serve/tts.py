"""Text-to-speech for the languages the playground can speak.

Hausa, Yorùbá, and English use Meta's MMS-TTS checkpoints. The original
``facebook/mms-tts-ibo`` checkpoint now returns 401, so Igbo uses
``Shinzmann/soro-tts-ibo``, a VITS fine-tune of that checkpoint under the
same CC-BY-NC 4.0 licence. Nigerian Pidgin has no voice; callers get the
English voice plus a note.

Weights are not downloaded at import time. The Modal image prefetches the
Igbo voice into ``/opt/natlas-voices/ig``. Other voices load on first use.
Every clip is loudness-normalized so one language is not much quieter.
"""

from __future__ import annotations

import io
import re
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final, Literal, Protocol

import numpy as np

from natlas_serve.languages import Language

SpeechCode = Literal["ha", "ig", "yo", "en", "pcm"]

#: ``facebook/mms-tts-ibo`` is gone (401). This fine-tune still loads as VITS.
IGBO_MODEL_ID: Final = "Shinzmann/soro-tts-ibo"

MMS_MODEL_IDS: Final[dict[Language, str]] = {
    "ha": "facebook/mms-tts-hau",
    "ig": IGBO_MODEL_ID,
    "yo": "facebook/mms-tts-yor",
    "en": "facebook/mms-tts-eng",
}

#: Baked into the Modal image so the first Igbo request does not download.
BUNDLED_VOICE_DIR: Final[dict[Language, str]] = {
    "ig": "/opt/natlas-voices/ig",
}

#: About -24 dBFS. Quiet Yoruba clips and louder Hausa clips land together.
TARGET_RMS: Final = 0.06
PEAK_LIMIT: Final = 0.95

PIDGIN_NOTE: Final = "Nigerian Pidgin has no dedicated voice. This reply is read in English."

_SPEECH_ALIASES: Final[dict[str, SpeechCode]] = {
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
    "yoruba-ng": "yo",
    "yo-ng": "yo",
    "en": "en",
    "eng": "en",
    "english": "en",
    "en-ng": "en",
    "en-us": "en",
    "en-gb": "en",
    "pcm": "pcm",
    "pidgin": "pcm",
    "naija": "pcm",
    "nigerian pidgin": "pcm",
}

MAX_SPEECH_CHARS: Final = 800


class SpeechError(RuntimeError):
    """The voice could not be loaded or the clip could not be rendered."""


class UnsupportedSpeechLanguageError(ValueError):
    """Raised when speech was asked for a language we do not voice."""

    def __init__(self, value: object) -> None:
        self.value = value
        super().__init__(
            f"No speech voice for {value!r}. Voices: Hausa (ha), Igbo (ig), "
            "Yoruba (yo), English (en). Pidgin (pcm) is read in English."
        )


@dataclass(frozen=True)
class SpeechClip:
    wav: bytes
    sample_rate: int
    voice: Language
    note: str | None


class Speaker(Protocol):
    def synthesize(self, text: str, language: str) -> SpeechClip:
        """Render ``text`` and return a WAV clip."""


def normalise_speech_language(value: object) -> SpeechCode:
    """Map loose input onto ``ha``, ``ig``, ``yo``, ``en``, or ``pcm``."""
    if not isinstance(value, str):
        raise UnsupportedSpeechLanguageError(value)
    key = value.strip().lower().replace("_", "-")
    if key not in _SPEECH_ALIASES:
        raise UnsupportedSpeechLanguageError(value)
    return _SPEECH_ALIASES[key]


_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_CODE = re.compile(r"`{1,3}([^`]*)`{1,3}")
_MD_BOLD = re.compile(r"(\*\*|__)(.+?)\1")
_MD_ITALIC = re.compile(r"(?<![*\w])[*_]([^*_\n]+)[*_](?!\w)")
_MD_HEADING = re.compile(r"(?m)^#{1,6}\s+")
_MD_LIST = re.compile(r"(?m)^\s*(?:[-*+]|\d+[.)])\s+")


def strip_markdown(text: str) -> str:
    """Drop chat markup so a voice does not read asterisks and list numbers."""
    cleaned = _MD_LINK.sub(r"\1", text)
    cleaned = _MD_CODE.sub(r"\1", cleaned)
    cleaned = _MD_BOLD.sub(r"\2", cleaned)
    cleaned = _MD_ITALIC.sub(r"\1", cleaned)
    cleaned = cleaned.replace("**", "").replace("__", "")
    cleaned = _MD_HEADING.sub("", cleaned)
    cleaned = _MD_LIST.sub("", cleaned)
    return cleaned


def prepare_speech_text(text: object) -> str:
    if not isinstance(text, str):
        raise ValueError("Speech input must be a string.")
    cleaned = " ".join(strip_markdown(text).split())
    if not cleaned:
        raise ValueError("There is nothing to read out.")
    if len(cleaned) > MAX_SPEECH_CHARS:
        cleaned = cleaned[: MAX_SPEECH_CHARS - 1].rstrip() + "…"
    return cleaned


def normalize_loudness(samples: Any) -> Any:
    """Raise quiet clips and tame loud ones to one RMS, then cap the peak."""
    flat = np.asarray(samples, dtype=np.float32).reshape(-1)
    if flat.size == 0:
        return flat
    rms = float(np.sqrt(np.mean(np.square(flat))))
    if rms < 1e-5:
        return flat
    gained = flat * (TARGET_RMS / rms)
    peak = float(np.max(np.abs(gained)))
    if peak > PEAK_LIMIT:
        gained = gained * (PEAK_LIMIT / peak)
    return np.asarray(gained, dtype=np.float32)


def voice_source(voice: Language) -> str:
    """A local directory when the Modal image bundled the weights, else the hub id."""
    folder = BUNDLED_VOICE_DIR.get(voice)
    if folder and (Path(folder) / "config.json").is_file():
        return folder
    return MMS_MODEL_IDS[voice]


def voice_for(language: str) -> tuple[Language, str | None]:
    """The MMS language to load, and a note when it is a stand-in."""
    code = normalise_speech_language(language)
    if code == "pcm":
        return "en", PIDGIN_NOTE
    return code, None


def pcm_to_wav(samples: Any, sample_rate: int) -> bytes:
    """Encode a mono float waveform in ``[-1, 1]`` as 16-bit WAV."""
    if sample_rate < 1:
        raise SpeechError("The speech model returned a bad sample rate.")
    flat = normalize_loudness(samples)
    if flat.size == 0:
        raise SpeechError("The speech model returned silence.")
    ints = np.clip(flat, -1.0, 1.0)
    ints = (ints * 32767.0).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(sample_rate))
        handle.writeframes(ints.tobytes())
    return buffer.getvalue()


class MmsSpeaker:
    """Lazy MMS-TTS. One model stays in memory per language code."""

    def __init__(self) -> None:
        self._loaded: dict[Language, tuple[Any, Any]] = {}

    def synthesize(self, text: str, language: str) -> SpeechClip:
        spoken = prepare_speech_text(text)
        voice, note = voice_for(language)
        model, tokenizer = self._model(voice)
        try:
            import torch
        except ImportError as exc:  # pragma: no cover - present in the vLLM image
            raise SpeechError("PyTorch is not installed in this environment.") from exc

        try:
            inputs = tokenizer(spoken, return_tensors="pt")
            with torch.no_grad():
                waveform = model(**inputs).waveform
            samples = waveform.squeeze().detach().cpu().numpy()
            rate = int(getattr(getattr(model, "config", None), "sampling_rate", 16_000))
            wav = pcm_to_wav(samples, rate)
        except SpeechError:
            raise
        except Exception as exc:  # pragma: no cover - model and encode failures
            raise SpeechError("Could not render the spoken reply.") from exc
        return SpeechClip(wav=wav, sample_rate=rate, voice=voice, note=note)

    def _model(self, voice: Language) -> tuple[Any, Any]:
        cached = self._loaded.get(voice)
        if cached is not None:
            return cached
        model_id = voice_source(voice)
        try:
            from transformers import AutoTokenizer, VitsModel
        except ImportError as exc:
            raise SpeechError(
                "The speech libraries are not installed in this environment."
            ) from exc
        try:
            tokenizer = AutoTokenizer.from_pretrained(model_id)
            model = VitsModel.from_pretrained(model_id)
            model.eval()
        except Exception as exc:
            name = {"ha": "Hausa", "ig": "Igbo", "yo": "Yoruba", "en": "English"}[voice]
            raise SpeechError(f"Spoken {name} isn't available right now.") from exc
        loaded = (model, tokenizer)
        self._loaded[voice] = loaded
        return loaded
