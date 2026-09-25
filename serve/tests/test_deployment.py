"""Guardrails on the deployment files.

None of this starts a container - it reads the manifests and asserts the
properties that would be expensive to discover in production:

* the unauthenticated services are never published to the host,
* the authenticated one never has its auth disabled,
* secrets never land in an image layer,
* the Modal app and the Modal pre-flight agree on the names they look up.
"""

from __future__ import annotations

import ast
import contextlib
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

SERVE = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def compose() -> dict:
    return yaml.safe_load((SERVE / "docker-compose.yml").read_text())


# ---------------------------------------------------------------------------
# docker-compose
# ---------------------------------------------------------------------------


def test_only_the_gateway_is_reachable_from_outside(compose: dict) -> None:
    """vllm and asr have no auth of their own; publishing them exposes the GPU."""
    published = {name for name, svc in compose["services"].items() if svc.get("ports")}
    assert published == {"gateway"}


def test_the_gateway_never_ships_with_auth_disabled(compose: dict) -> None:
    env = compose["services"]["gateway"]["environment"]
    assert "NATLAS_ALLOW_ANONYMOUS" not in env
    # No default: `${VAR:?message}` makes compose abort when it is unset.
    assert env["NATLAS_API_KEYS"].startswith("${NATLAS_API_KEYS:?")


def test_internal_services_are_addressed_by_service_name(compose: dict) -> None:
    env = compose["services"]["gateway"]["environment"]
    assert env["NATLAS_VLLM_URL"] == "http://vllm:8000"
    assert env["NATLAS_ASR_URL"] == "http://asr:8001"
    assert env["NATLAS_ASR_MODE"] == "proxy"


def test_the_gateway_waits_for_both_upstreams(compose: dict) -> None:
    depends = compose["services"]["gateway"]["depends_on"]
    assert depends["vllm"]["condition"] == "service_healthy"
    assert depends["asr"]["condition"] == "service_healthy"


def test_only_vllm_reserves_a_gpu(compose: dict) -> None:
    """ASR on the GPU would race vLLM's pre-allocated KV cache for VRAM."""
    with_gpu = {name for name, svc in compose["services"].items() if svc.get("deploy")}
    assert with_gpu == {"vllm"}


def test_weights_are_cached_on_a_volume(compose: dict) -> None:
    """Otherwise every restart re-downloads ~15 GB of gated weights."""
    assert "hf-cache" in compose["volumes"]
    for name in ("vllm", "asr"):
        mounts = compose["services"][name]["volumes"]
        assert any(m.startswith("hf-cache:") for m in mounts), name


def test_vllm_is_launched_through_our_launcher(compose: dict) -> None:
    """So docker and Modal start vLLM with identical flags."""
    assert compose["services"]["vllm"]["command"] == [
        "python",
        "-m",
        "natlas_serve.vllm_launcher",
    ]


def test_every_service_has_a_healthcheck(compose: dict) -> None:
    for name, svc in compose["services"].items():
        assert svc.get("healthcheck"), name


# ---------------------------------------------------------------------------
# Dockerfile / .dockerignore
# ---------------------------------------------------------------------------


def test_dockerfile_installs_ffmpeg() -> None:
    """The whole audio path shells out to ffmpeg."""
    assert "ffmpeg" in (SERVE / "Dockerfile").read_text()


def test_dockerfile_clears_the_upstream_entrypoint() -> None:
    """vllm/vllm-openai hard-codes the vLLM server; we run three commands."""
    assert "ENTRYPOINT []" in (SERVE / "Dockerfile").read_text()


def test_dockerignore_keeps_secrets_and_weights_out_of_the_build_context() -> None:
    ignored = (SERVE / ".dockerignore").read_text().split()
    for pattern in (".env", "*.safetensors", "tests/"):
        assert pattern in ignored, pattern


def test_env_example_carries_no_real_secret() -> None:
    """A placeholder must not be mistakable for a live token."""
    text = (SERVE / ".env.example").read_text()
    assert "NATLAS_API_KEYS=\n" in text or "NATLAS_API_KEYS=" in text
    for line in text.splitlines():
        if line.startswith("HF_TOKEN="):
            assert set(line.split("=", 1)[1]) <= set("hf_x"), "looks like a real token"


# ---------------------------------------------------------------------------
# Modal
# ---------------------------------------------------------------------------


def _literals(path: Path) -> dict[str, object]:
    """Module-level ``NAME = <literal>`` assignments, without importing."""
    tree = ast.parse(path.read_text())
    out: dict[str, object] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                with contextlib.suppress(ValueError):
                    out[target.id] = ast.literal_eval(node.value)
    return out


def test_modal_app_and_preflight_look_up_the_same_secret() -> None:
    """Drift here means the pre-flight passes and the deploy fails."""
    app = _literals(SERVE / "modal_app.py")
    preflight = _literals(SERVE / "modal_preflight.py")
    assert app["SECRET_NAME"] == preflight["SECRET_NAME"] == "natlas-hf"


def test_modal_app_keeps_vllm_on_loopback() -> None:
    """Only the gateway should be web-exposed, same rule as compose."""
    app = _literals(SERVE / "modal_app.py")
    assert app["VLLM_HOST"] == "127.0.0.1"


def test_modal_app_does_not_pin_a_warm_container() -> None:
    """min_containers=1 on a GPU is ~$790/month. It must be a deliberate edit."""
    assert "min_containers" not in (SERVE / "modal_app.py").read_text().replace(
        "# Deliberately absent: min_containers.", ""
    )


def test_modal_image_links_python3_before_pip_install() -> None:
    """vllm/vllm-openai:v0.11.0 has python3 only. Modal's pip_install calls python."""
    text = (SERVE / "modal_app.py").read_text()
    link = 'ln -sf "$(command -v python3)" /usr/local/bin/python'
    assert text.index(".entrypoint([])") < text.index(link) < text.index(".pip_install(")


def test_dockerfile_links_python3_before_pip() -> None:
    """Compose starts vLLM with `python` on the same base image."""
    text = (SERVE / "Dockerfile").read_text()
    link = 'ln -sf "$(command -v python3)" /usr/local/bin/python'
    assert text.index("ENTRYPOINT []") < text.index(link) < text.index("pip install")


def test_preflight_gpu_errors_name_the_real_cause() -> None:
    preflight = _load_preflight()

    class _Old:
        def remote(self) -> dict[str, bool]:
            return {"ok": True}

    runner, note = preflight.prepare_gpu_check(_Old(), "A10")
    assert runner.remote()["ok"] is True
    assert note is not None and "1.4.3" in note

    with pytest.raises(preflight.GpuClientTooOldError, match="pinned GPU"):
        preflight.prepare_gpu_check(_Old(), "L4")

    class _New:
        def with_options(self, *, gpu: str) -> _New:
            self.gpu = gpu
            return self

        def remote(self) -> str:
            return self.gpu

    runner, note = preflight.prepare_gpu_check(_New(), "L40S")
    assert note is None
    assert runner.remote() == "L40S"

    missing = preflight.format_gpu_failure(AttributeError("Function has no attribute with_options"))
    assert "client-version" in missing
    assert "not a missing payment method" in missing

    billing = preflight.format_gpu_failure(RuntimeError("no payment method on file"))
    assert "https://modal.com/settings/billing" in billing
    assert "client-version" not in billing

    quota = preflight.format_gpu_failure(RuntimeError("GPU quota exceeded for A10"))
    assert "quota" in quota
    assert "Most likely cause: no payment method" not in quota
    assert "only when" in quota


def _load_preflight():
    """Import the pre-flight script. Stub ``modal`` when it is not installed."""
    import importlib
    import sys
    import types

    if "modal_preflight" in sys.modules:
        return sys.modules["modal_preflight"]
    try:
        return importlib.import_module("modal_preflight")
    except ModuleNotFoundError:
        modal = types.ModuleType("modal")

        class _Image:
            @staticmethod
            def debian_slim(**_kwargs: object) -> _Image:
                return _Image()

            def pip_install(self, *_args: object, **_kwargs: object) -> _Image:
                return self

        class _App:
            def __init__(self, *_args: object, **_kwargs: object) -> None:
                self.name = _args[0] if _args else "natlas-preflight"

            def function(self, **_kwargs: object):
                def decorate(fn):
                    return fn

                return decorate

            def local_entrypoint(self):
                def decorate(fn):
                    return fn

                return decorate

        class _Secret:
            @staticmethod
            def from_name(_name: str) -> str:
                return _name

        modal.Image = _Image
        modal.App = _App
        modal.Secret = _Secret
        sys.modules["modal"] = modal
        return importlib.import_module("modal_preflight")
