"""The metadata in :mod:`natlas.constants` is load-bearing: `/serve`, the CLI and
the local backend all route on it. These tests pin it to the real model cards.
"""

from __future__ import annotations

import pytest

import natlas
from natlas import (
    ASR_MAX_SEGMENT_SECONDS,
    ASR_MODEL_IDS,
    ASR_SAMPLE_RATE,
    ATTRIBUTION,
    BACKENDS,
    LANGUAGE_NAMES,
    LANGUAGES,
    LLM_CONTEXT_TOKENS,
    LLM_MODEL_ID,
    is_language,
)


def test_points_at_the_real_llm_repo() -> None:
    assert LLM_MODEL_ID == "NCAIR1/N-ATLaS"


def test_budgets_the_documented_context_not_max_position_embeddings() -> None:
    assert LLM_CONTEXT_TOKENS == 8092


def test_maps_every_language_to_its_ncair1_asr_repo() -> None:
    assert ASR_MODEL_IDS == {
        "ha": "NCAIR1/Hausa-ASR",
        "ig": "NCAIR1/Igbo-ASR",
        "yo": "NCAIR1/Yoruba-ASR",
        "en": "NCAIR1/NigerianAccentedEnglish",
    }


def test_never_references_a_non_ncair1_model() -> None:
    for model_id in (LLM_MODEL_ID, *ASR_MODEL_IDS.values()):
        assert model_id.startswith("NCAIR1/"), model_id


def test_records_the_whisper_small_constraints() -> None:
    assert ASR_MAX_SEGMENT_SECONDS == 30
    assert ASR_SAMPLE_RATE == 16_000


def test_covers_all_four_languages_exactly_once() -> None:
    assert LANGUAGES == ("ha", "ig", "yo", "en")
    assert len(set(LANGUAGES)) == len(LANGUAGES)
    assert set(LANGUAGE_NAMES) == set(LANGUAGES)
    assert set(ASR_MODEL_IDS) == set(LANGUAGES)


def test_exposes_the_planned_backend_adapters() -> None:
    assert BACKENDS == ("openai-compatible", "hf-endpoint", "official", "local")


def test_carries_the_required_attribution() -> None:
    assert "Awarri Technologies" in ATTRIBUTION
    assert "Federal Ministry of Communications" in ATTRIBUTION


def test_exposes_a_version() -> None:
    assert natlas.__version__.count(".") >= 2


@pytest.mark.parametrize("value", LANGUAGES)
def test_is_language_accepts_supported_codes(value: str) -> None:
    assert is_language(value) is True


@pytest.mark.parametrize("value", ["fr", "HA", "", None, 42, object()])
def test_is_language_rejects_everything_else(value: object) -> None:
    assert is_language(value) is False
