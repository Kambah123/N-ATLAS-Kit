"""Shared fixtures.

Everything here runs offline, with no GPU and no model weights. The only
external binary is ffmpeg; if the machine has none we fall back to the static
build that ``imageio-ffmpeg`` ships, so the audio tests are never skipped.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterator

import numpy as np
import pytest

from natlas_serve.config import Settings
from natlas_serve.languages import ASR_MODEL_IDS, Language

SAMPLE_RATE = 16_000


def _resolve_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
    except ImportError:
        return None
    return str(imageio_ffmpeg.get_ffmpeg_exe())


@pytest.fixture(scope="session", autouse=True)
def ffmpeg_on_path() -> Iterator[str]:
    """Point natlas_serve.audio at a usable ffmpeg for the whole session."""
    binary = _resolve_ffmpeg()
    if binary is None:  # pragma: no cover
        pytest.skip("no ffmpeg available (pip install imageio-ffmpeg)")
    previous = os.environ.get("NATLAS_FFMPEG_BINARY")
    os.environ["NATLAS_FFMPEG_BINARY"] = binary
    yield binary
    if previous is None:
        os.environ.pop("NATLAS_FFMPEG_BINARY", None)
    else:  # pragma: no cover
        os.environ["NATLAS_FFMPEG_BINARY"] = previous


@pytest.fixture
def settings() -> Settings:
    """A fully configured gateway, with one known API key."""
    return Settings(
        api_keys=frozenset({"test-key"}),
        cors_origins=("http://localhost:3000",),
        vllm_url="http://vllm.test",
        asr_url="http://asr.test",
        asr_models=dict(ASR_MODEL_IDS),
    )


@pytest.fixture
def encode(ffmpeg_on_path: str):
    """Encode a synthetic tone into a real container/codec via ffmpeg."""

    def _encode(args: list[str], *, seconds: float = 5.0, rate: int = 48_000) -> bytes:
        proc = subprocess.run(
            [
                ffmpeg_on_path,
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency=440:sample_rate={rate}:duration={seconds}",
                *args,
                "-",
            ],
            capture_output=True,
            check=True,
        )
        return proc.stdout

    return _encode


@pytest.fixture
def tone():
    """Raw 16 kHz mono int16 PCM: a tone, optionally with silent pauses."""

    def _tone(seconds: float, pauses: list[tuple[float, float]] | None = None) -> np.ndarray:
        t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
        samples = (0.6 * np.sin(2 * np.pi * 220 * t) * 32767).astype(np.int16)
        for start, end in pauses or []:
            samples[int(start * SAMPLE_RATE) : int(end * SAMPLE_RATE)] = 0
        return samples

    return _tone


class StubTranscriber:
    """Stands in for the Whisper models. Mocks are fine *inside tests only*."""

    def __init__(self, text: str = "sannu da zuwa") -> None:
        self.text = text
        self.calls: list[tuple[int, Language]] = []
        self.fail_with: Exception | None = None

    def transcribe(self, samples: np.ndarray, language: Language) -> str:
        if self.fail_with is not None:
            raise self.fail_with
        self.calls.append((len(samples), language))
        return f"{self.text} [{language}:{len(self.calls)}]"

    def loaded_languages(self) -> list[Language]:
        return sorted({lang for _, lang in self.calls})


@pytest.fixture
def stub_transcriber() -> StubTranscriber:
    return StubTranscriber()
