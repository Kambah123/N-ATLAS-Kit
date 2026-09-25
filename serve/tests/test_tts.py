"""Speech endpoint and WAV encoding. No model download."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from natlas_serve.gateway import create_app
from natlas_serve.tts import (
    IGBO_MODEL_ID,
    MMS_MODEL_IDS,
    SpeechClip,
    SpeechError,
    normalize_loudness,
    pcm_to_wav,
    prepare_speech_text,
    voice_for,
    voice_source,
)

AUTH = {"Authorization": "Bearer test-key"}


class StubSpeaker:
    def synthesize(self, text: str, language: str) -> SpeechClip:
        spoken = prepare_speech_text(text)
        voice, note = voice_for(language)
        wav = pcm_to_wav(np.linspace(-0.2, 0.2, 160, dtype=np.float32), 16_000)
        assert spoken
        return SpeechClip(wav=wav, sample_rate=16_000, voice=voice, note=note)


def test_pcm_to_wav_is_a_mono_riff() -> None:
    wav = pcm_to_wav(np.array([0.0, 0.5, -0.5], dtype=np.float32), 16_000)
    assert wav.startswith(b"RIFF")
    assert b"WAVE" in wav[:16]


def test_igbo_voice_is_the_replacement_checkpoint() -> None:
    assert MMS_MODEL_IDS["ig"] == IGBO_MODEL_ID
    assert IGBO_MODEL_ID == "Shinzmann/soro-tts-ibo"
    assert "facebook/mms-tts-ibo" not in MMS_MODEL_IDS.values()
    assert voice_source("ig") == IGBO_MODEL_ID


def test_prepare_speech_text_strips_markdown() -> None:
    spoken = prepare_speech_text("**Rice** is ready.\n1. Wash it\n- Cook it")
    assert "**" not in spoken
    assert "1." not in spoken
    assert spoken == "Rice is ready. Wash it Cook it"


def test_loudness_normalization_matches_a_quiet_clip_to_a_loud_one() -> None:
    quiet = normalize_loudness(np.full(1600, 0.02, dtype=np.float32))
    loud = normalize_loudness(np.full(1600, 0.5, dtype=np.float32))
    quiet_rms = float(np.sqrt(np.mean(np.square(quiet))))
    loud_rms = float(np.sqrt(np.mean(np.square(loud))))
    assert abs(quiet_rms - loud_rms) / loud_rms < 0.05
    wav = pcm_to_wav(np.full(800, 0.01, dtype=np.float32), 16_000)
    assert wav.startswith(b"RIFF")


def test_pidgin_uses_the_english_voice_and_says_so() -> None:
    voice, note = voice_for("pidgin")
    assert voice == "en"
    assert note is not None
    assert "Pidgin" in note


def test_speech_requires_a_speaker(settings) -> None:
    with TestClient(create_app(settings)) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "Sannu", "language": "ha"},
            headers=AUTH,
        )
    assert response.status_code == 501
    assert "Redeploy" in response.json()["detail"]


def test_speech_requires_auth(settings) -> None:
    with TestClient(create_app(settings, speaker=StubSpeaker())) as test_client:
        response = test_client.post("/v1/audio/speech", json={"input": "Sannu", "language": "ha"})
    assert response.status_code == 401


def test_speech_returns_wav_and_a_pidgin_note(settings) -> None:
    with TestClient(create_app(settings, speaker=StubSpeaker())) as test_client:
        hausa = test_client.post(
            "/v1/audio/speech",
            json={"input": "Sannu", "language": "ha"},
            headers=AUTH,
        )
        pidgin = test_client.post(
            "/v1/audio/speech",
            json={"text": "How you dey", "language": "pcm"},
            headers=AUTH,
        )
    assert hausa.status_code == 200
    assert hausa.headers["content-type"].startswith("audio/wav")
    assert hausa.headers["x-natlas-voice"] == "ha"
    assert hausa.content.startswith(b"RIFF")
    assert "x-natlas-voice-note" not in hausa.headers
    assert pidgin.status_code == 200
    assert pidgin.headers["x-natlas-voice"] == "en"
    assert "Pidgin" in pidgin.headers["x-natlas-voice-note"]


def test_speech_rejects_an_empty_clip(settings) -> None:
    class Empty:
        def synthesize(self, text: str, language: str) -> SpeechClip:
            raise ValueError("There is nothing to read out.")

    with TestClient(create_app(settings, speaker=Empty())) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "   ", "language": "en"},
            headers=AUTH,
        )
    assert response.status_code == 400


def test_speech_reports_a_missing_voice_library(settings) -> None:
    class Broken:
        def synthesize(self, text: str, language: str) -> SpeechClip:
            del text, language
            raise SpeechError("The speech libraries are not installed in this environment.")

    with TestClient(create_app(settings, speaker=Broken())) as test_client:
        response = test_client.post(
            "/v1/audio/speech",
            json={"input": "Hello", "language": "en"},
            headers=AUTH,
        )
    assert response.status_code == 503
    assert "speech libraries" in response.json()["detail"]
