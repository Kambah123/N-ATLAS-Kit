"""Config, language routing, logging guarantees and the vLLM command builder."""

from __future__ import annotations

import json
import logging

import pytest

from natlas_serve import observability, vllm_launcher
from natlas_serve.config import ConfigError, Settings
from natlas_serve.languages import (
    ASR_MODEL_IDS,
    LANGUAGES,
    LLM_MODEL_ID,
    UnsupportedLanguageError,
    asr_model_for,
    normalise_language,
)

# ---------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------


def test_the_five_model_ids_are_the_real_ones() -> None:
    assert LLM_MODEL_ID == "NCAIR1/N-ATLaS"
    assert ASR_MODEL_IDS == {
        "ha": "NCAIR1/Hausa-ASR",
        "ig": "NCAIR1/Igbo-ASR",
        "yo": "NCAIR1/Yoruba-ASR",
        "en": "NCAIR1/NigerianAccentedEnglish",
    }
    for model_id in (LLM_MODEL_ID, *ASR_MODEL_IDS.values()):
        assert model_id.startswith("NCAIR1/")


@pytest.mark.parametrize("language", LANGUAGES)
def test_every_language_has_a_model(language: str) -> None:
    assert asr_model_for(language)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ha", "ha"),
        ("HAU", "ha"),
        ("Hausa", "ha"),
        ("ha-NG", "ha"),
        ("igbo", "ig"),
        ("ibo", "ig"),
        ("Yoruba", "yo"),
        ("yor", "yo"),
        ("yor\u00f9b\u00e1", "yo"),
        ("en_NG", "en"),
        ("Nigerian English", "en"),
        ("naija", "en"),
        ("  english  ", "en"),
    ],
)
def test_normalise_language_accepts_what_people_type(value: str, expected: str) -> None:
    assert normalise_language(value) == expected


@pytest.mark.parametrize("value", ["fr", "swahili", "", None, 42, "zz-ZZ"])
def test_normalise_language_rejects_the_rest(value: object) -> None:
    with pytest.raises(UnsupportedLanguageError) as excinfo:
        normalise_language(value)
    assert "ha, ig, yo, en" in str(excinfo.value)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def test_reads_a_full_environment() -> None:
    cfg = Settings.from_env(
        {
            "NATLAS_API_KEYS": " k1 , k2 ,",
            "NATLAS_CORS_ORIGINS": "http://a.test,https://b.test",
            "NATLAS_VLLM_URL": "http://vllm:8000/",
            "NATLAS_ASR_URL": "http://asr:8001/",
            "NATLAS_ASR_DEVICE": "cuda",
            "NATLAS_ASR_CHUNK_SECONDS": "20",
            "NATLAS_REQUEST_TIMEOUT": "45.5",
            "NATLAS_INJECT_DATE_STRING": "false",
        }
    )
    assert cfg.api_keys == frozenset({"k1", "k2"})
    assert cfg.cors_origins == ("http://a.test", "https://b.test")
    assert cfg.vllm_url == "http://vllm:8000"  # trailing slash trimmed
    assert cfg.asr_device == "cuda"
    assert cfg.asr_chunk_seconds == 20.0
    assert cfg.request_timeout == 45.5
    assert cfg.inject_date_string is False


def test_asr_model_ids_can_be_overridden_for_a_local_mirror() -> None:
    cfg = Settings.from_env(
        {"NATLAS_API_KEYS": "k", "NATLAS_ASR_MODEL_HA": "my-org/hausa-finetune"}
    )
    assert cfg.asr_models["ha"] == "my-org/hausa-finetune"
    assert cfg.asr_models["ig"] == "NCAIR1/Igbo-ASR"


@pytest.mark.parametrize(
    "env",
    [
        {"NATLAS_API_KEYS": "k", "NATLAS_ASR_DEVICE": "tpu"},
        {"NATLAS_API_KEYS": "k", "NATLAS_ASR_MODE": "sideways"},
        {"NATLAS_API_KEYS": "k", "NATLAS_REQUEST_TIMEOUT": "soon"},
        {"NATLAS_API_KEYS": "k", "NATLAS_MAX_UPLOAD_BYTES": "lots"},
        {"NATLAS_API_KEYS": "k", "NATLAS_VLLM_GPU_MEMORY_UTILIZATION": "1.5"},
        {"NATLAS_API_KEYS": "k", "NATLAS_VLLM_GPU_MEMORY_UTILIZATION": "0"},
        {"NATLAS_API_KEYS": "k", "NATLAS_VLLM_EXTRA_ARGS": '--flag "unclosed'},
    ],
)
def test_bad_values_fail_loudly_at_startup(env: dict[str, str]) -> None:
    with pytest.raises(ConfigError):
        Settings.from_env(env)


def test_vllm_tuning_reaches_the_launcher() -> None:
    """Whatever the operator sets in the environment is what vLLM is started with."""
    cfg = Settings.from_env(
        {
            "NATLAS_API_KEYS": "k",
            "NATLAS_VLLM_MAX_MODEL_LEN": "4096",
            "NATLAS_VLLM_GPU_MEMORY_UTILIZATION": "0.85",
            "NATLAS_VLLM_EXTRA_ARGS": "--enable-prefix-caching --swap-space 8",
        }
    )
    assert cfg.vllm_extra_args == ("--enable-prefix-caching", "--swap-space", "8")

    cmd = vllm_launcher.command_from_settings(cfg, host="0.0.0.0", port=8000, help_text="")
    assert cmd[cmd.index("--model") + 1] == LLM_MODEL_ID
    assert cmd[cmd.index("--host") + 1] == "0.0.0.0"
    assert cmd[cmd.index("--max-model-len") + 1] == "4096"
    assert cmd[cmd.index("--gpu-memory-utilization") + 1] == "0.85"
    assert cmd[-3:] == ["--enable-prefix-caching", "--swap-space", "8"]


# ---------------------------------------------------------------------------
# Logging guarantees
# ---------------------------------------------------------------------------


def test_refuses_to_log_a_field_that_could_hold_content() -> None:
    entry = observability.RequestLog(request_id="r", feature="chat")
    entry.extra = {"Content": "the user said something private"}
    with pytest.raises(ValueError, match="Refusing to log user content"):
        observability.log_request(entry)


def test_emits_one_json_object_per_request(caplog: pytest.LogCaptureFixture) -> None:
    observability.configure_logging()
    entry = observability.RequestLog(
        request_id="abc", feature="chat", status=200, latency_ms=12.5, language="ha"
    )
    with caplog.at_level(logging.INFO, logger="natlas.serve"):
        observability.log_request(entry)
    payload = json.loads(caplog.records[-1].message)
    assert payload["event"] == "request"
    assert payload["language"] == "ha"
    assert payload["ts"] > 0


def test_key_fingerprint_is_stable_and_not_reversible() -> None:
    key = "sk-super-secret-value"
    first = observability.key_fingerprint(key)
    assert first == observability.key_fingerprint(key)
    assert first != observability.key_fingerprint(key + "x")
    assert first is not None
    assert key not in first
    assert first.startswith("k_")
    assert observability.key_fingerprint(None) is None


def test_request_ids_are_unique() -> None:
    assert len({observability.new_request_id() for _ in range(500)}) == 500


# ---------------------------------------------------------------------------
# vLLM command
# ---------------------------------------------------------------------------


def test_serves_n_atlas_with_the_documented_context_window() -> None:
    cmd = vllm_launcher.build_command(help_text="")
    assert "NCAIR1/N-ATLaS" in cmd
    assert cmd[cmd.index("--max-model-len") + 1] == "8192"
    assert cmd[cmd.index("--dtype") + 1] == "bfloat16"
    assert cmd[cmd.index("--served-model-name") + 1] == "NCAIR1/N-ATLaS"


def test_never_overrides_the_models_own_chat_template() -> None:
    """N-ATLaS ships its template in tokenizer_config.json. Do not second-guess it."""
    assert "--chat-template" not in vllm_launcher.build_command(help_text="")


@pytest.mark.parametrize(
    ("help_text", "expected"),
    [
        ("  --disable-log-requests  Disable logging requests.", ["--disable-log-requests"]),
        ("  --enable-log-requests   Enable logging requests.", ["--no-enable-log-requests"]),
        ("no relevant flag here", []),
    ],
)
def test_picks_the_right_flag_to_stop_vllm_logging_prompts(
    help_text: str, expected: list[str]
) -> None:
    """The flag was renamed upstream. Guessing wrong either crashes the server
    or silently starts logging user prompts, so we probe --help instead."""
    assert vllm_launcher.log_request_flag(help_text) == expected


def test_extra_args_are_appended() -> None:
    cmd = vllm_launcher.build_command(help_text="", extra_args=["--enforce-eager"])
    assert cmd[-1] == "--enforce-eager"


def test_hf_token_is_passed_to_the_child_under_both_names() -> None:
    env = vllm_launcher.environment("hf_abc", {"PATH": "/usr/bin"})
    assert env["HF_TOKEN"] == "hf_abc"
    assert env["HUGGING_FACE_HUB_TOKEN"] == "hf_abc"
    assert env["PATH"] == "/usr/bin"


def test_no_token_means_no_token_variables() -> None:
    env = vllm_launcher.environment(None, {})
    assert "HF_TOKEN" not in env
