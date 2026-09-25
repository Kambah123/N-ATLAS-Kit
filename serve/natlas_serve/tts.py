"""Text-to-speech for the languages the playground can speak.

Hausa, Igbo, Yorùbá, and English use Meta's MMS-TTS checkpoints
(``facebook/mms-tts-*``). They are small VITS models and run on CPU.
Nigerian Pidgin has no MMS voice; callers get the English voice plus a note.

The weights are CC-BY-NC 4.0. This module does not download them at import
time. The first ``MmsSpeaker.synthesize`` call for a language loads that
one model.
"""

from __future__ import annotations

import io
import wave
from dataclasses import dataclass
from typing import Any, Final, Literal, Protocol

import numpy as np

from natlas_serve.languages import Language

SpeechCode = Literal["ha", "ig", "yo", "en", "pcm"]

MMS_MODEL_IDS: Final[dict[Language, str]] = {
    "ha": "facebook/mms-tts-hau",
    "ig": "facebook/mms-tts-ibo",
    "yo": "facebook/mms-tts-yor",
    "en": "facebook/mms-tts-eng",
}

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


def prepare_speech_text(text: object) -> str:
    if not isinstance(text, str):
        raise ValueError("Speech input must be a string.")
    cleaned = " ".join(text.split())
    if not cleaned:
        raise ValueError("There is nothing to read out.")
    if len(cleaned) > MAX_SPEECH_CHARS:
        cleaned = cleaned[: MAX_SPEECH_CHARS - 1].rstrip() + "…"
    return cleaned


def voice_for(language: str) -> tuple[Language, str | None]:
    """The MMS language to load, and a note when it is a stand-in."""
    code = normalise_speech_language(language)
    if code == "pcm":
        return "en", PIDGIN_NOTE
    return code, None


def pcm_to_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    """Encode a mono float waveform in ``[-1, 1]`` as 16-bit WAV."""
    if sample_rate < 1:
        raise SpeechError("The speech model returned a bad sample rate.")
    flat = np.asarray(samples, dtype=np.float32).reshape(-1)
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
        model_id = MMS_MODEL_IDS[voice]
        try:
            from transformers import AutoTokenizer, VitsModel
        except ImportError as exc:
            raise SpeechError(
                "The speech libraries are not installed in this environment. "
                "Redeploy the Modal app from a checkout that includes TTS."
            ) from exc
        try:
            tokenizer = AutoTokenizer.from_pretrained(model_id)
            model = VitsModel.from_pretrained(model_id)
            model.eval()
        except Exception as exc:
            raise SpeechError(
                f"Could not load the {voice} voice ({model_id}). "
                "On Modal, confirm the Hugging Face cache volume is mounted and redeploy."
            ) from exc
        loaded = (model, tokenizer)
        self._loaded[voice] = loaded
        return loaded
