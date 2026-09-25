"""Pre-flight check for the N-ATLaS Modal deployment.

Run this BEFORE we build ``serve/modal_app.py``. It answers, in about two
minutes and for a couple of cents, the four questions that would otherwise only
surface halfway through a 16 GB download on a paid GPU:

1. Is the Modal CLI authenticated, and can this workspace schedule work?
2. Does this account have **GPU** access? (Modal requires a payment method on
   file before it will give you one.)
3. Is ``HF_TOKEN`` reaching the container, and has that Hugging Face account
   accepted the gated terms on **all five** NCAIR1 repos? Miss one and the
   real deploy dies at model-load time.
4. Does the GPU actually have room for N-ATLaS *plus* the four ASR models,
   and how much is left for the KV cache?

Nothing here is simulated. Every number it prints is measured on the machine
Modal handed us, or computed from the real model config.

Setup
-----
::

    pip install modal
    modal setup
    modal secret create natlas-hf HF_TOKEN=hf_xxxxxxxxxxxx

Usage
-----
::

    modal run serve/modal_preflight.py              # default: A10 (24 GB)
    modal run serve/modal_preflight.py --gpu L4     # cheaper, slower
    modal run serve/modal_preflight.py --gpu L40S   # roomier, 48 GB
    modal run serve/modal_preflight.py --skip-gpu   # HF access check only, free

Cost: the GPU check holds an A10 for well under a minute, so a few cents.
``--skip-gpu`` runs on CPU only and is effectively free.
"""

from __future__ import annotations

from typing import Any

import modal

# --------------------------------------------------------------------------
# The real models. Verified against the Hugging Face model cards 2026-09-24.
# --------------------------------------------------------------------------

LLM_MODEL_ID = "NCAIR1/N-ATLaS"

ASR_MODEL_IDS: dict[str, str] = {
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "yo": "NCAIR1/Yoruba-ASR",
    "en": "NCAIR1/NigerianAccentedEnglish",
}

ALL_MODELS: tuple[str, ...] = (LLM_MODEL_ID, *ASR_MODEL_IDS.values())

# N-ATLaS is a Llama-3 8B fine-tune stored in BF16: ~8.03e9 params x 2 bytes.
LLM_WEIGHTS_GIB = 8.03e9 * 2 / 1024**3

# Four Whisper Small encoders at 244M params each, loaded in fp16.
ASR_WEIGHTS_GIB = 4 * 244e6 * 2 / 1024**3

# CUDA context, cuBLAS workspaces, fragmentation, activations.
RUNTIME_OVERHEAD_GIB = 2.0

# KV cache per token, from the real config: 32 layers x 8 KV heads x 128 head
# dim x 2 (K and V) x 2 bytes = 131,072 bytes = 128 KiB per token.
KV_BYTES_PER_TOKEN = 32 * 8 * 128 * 2 * 2

# The model card caps useful context at 8,092 tokens.
LLM_CONTEXT_TOKENS = 8092

SECRET_NAME = "natlas-hf"

#: ``check_gpu`` is declared with this GPU. ``--gpu`` retargets it only when
#: the installed modal client has ``Function.with_options`` (1.4.3+).
DEFAULT_GPU = "A10"
WITH_OPTIONS_MIN_VERSION = "1.4.3"

image = modal.Image.debian_slim(python_version="3.11").pip_install("huggingface_hub>=0.24")

app = modal.App("natlas-preflight", image=image)

hf_secret = modal.Secret.from_name(SECRET_NAME)


# --------------------------------------------------------------------------
# 1. Hugging Face gated access
# --------------------------------------------------------------------------


@app.function(secrets=[hf_secret], timeout=600)
def check_hf_access() -> dict[str, Any]:
    """Prove the token in the Modal Secret can actually read all five repos.

    Downloads only ``config.json`` from each - a few KB, not the weights - so
    this is fast and cheap. A gated repo the account has not accepted raises
    ``GatedRepoError``, which is exactly the failure we want to catch here
    rather than 15 minutes into a real deploy.
    """
    import os

    from huggingface_hub import hf_hub_download, whoami
    from huggingface_hub.utils import (
        GatedRepoError,
        HfHubHTTPError,
        RepositoryNotFoundError,
    )

    token = os.environ.get("HF_TOKEN", "").strip()
    result: dict[str, Any] = {"token_present": bool(token), "user": None, "models": {}}

    if not token:
        return result

    try:
        info = whoami(token=token)
        result["user"] = info.get("name")
    except Exception as exc:
        result["user_error"] = f"{type(exc).__name__}: {exc}"

    for repo_id in ALL_MODELS:
        try:
            path = hf_hub_download(repo_id, "config.json", token=token)
            size = os.path.getsize(path)
            result["models"][repo_id] = {"ok": True, "detail": f"config.json, {size} bytes"}
        except GatedRepoError:
            result["models"][repo_id] = {
                "ok": False,
                "detail": "GATED - this HF account has not accepted the terms",
            }
        except RepositoryNotFoundError:
            result["models"][repo_id] = {
                "ok": False,
                "detail": "NOT FOUND - wrong repo id, or the token cannot see it",
            }
        except HfHubHTTPError as exc:
            result["models"][repo_id] = {"ok": False, "detail": f"HTTP {exc}"}
        except Exception as exc:
            result["models"][repo_id] = {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}

    return result


# --------------------------------------------------------------------------
# 2. GPU allocation and VRAM headroom
# --------------------------------------------------------------------------


@app.function(gpu=DEFAULT_GPU, timeout=600)
def check_gpu() -> dict[str, Any]:
    """Report what Modal actually gave us. Measured, not assumed."""
    import subprocess

    query = "name,memory.total,memory.free,driver_version,compute_cap"
    proc = subprocess.run(
        ["nvidia-smi", f"--query-gpu={query}", "--format=csv,noheader,nounits"],
        capture_output=True,
        text=True,
        check=False,
    )

    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip() or "nvidia-smi failed"}

    name, total_mib, free_mib, driver, cap = (p.strip() for p in proc.stdout.strip().split(","))
    total_gib = float(total_mib) / 1024
    needed_gib = LLM_WEIGHTS_GIB + ASR_WEIGHTS_GIB + RUNTIME_OVERHEAD_GIB
    kv_gib = total_gib - needed_gib
    kv_per_conversation_gib = KV_BYTES_PER_TOKEN * LLM_CONTEXT_TOKENS / 1024**3

    return {
        "ok": True,
        "name": name,
        "total_gib": total_gib,
        "free_gib": float(free_mib) / 1024,
        "driver": driver,
        "compute_capability": cap,
        "llm_weights_gib": LLM_WEIGHTS_GIB,
        "asr_weights_gib": ASR_WEIGHTS_GIB,
        "overhead_gib": RUNTIME_OVERHEAD_GIB,
        "needed_gib": needed_gib,
        "kv_cache_gib": kv_gib,
        "kv_per_full_conversation_gib": kv_per_conversation_gib,
        "concurrent_full_context_conversations": (
            int(kv_gib / kv_per_conversation_gib) if kv_gib > 0 else 0
        ),
    }


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

TICK = "\u2713"
CROSS = "\u2717"


class GpuClientTooOldError(Exception):
    """``--gpu`` cannot be applied because this modal client has no ``with_options``."""


def prepare_gpu_check(function: Any, gpu: str) -> tuple[Any, str | None]:
    """Return ``(runner, note)``.

    ``runner.remote()`` performs the check. On modal >= 1.4.3, ``runner`` is
    ``function.with_options(gpu=gpu)``. Older clients can still call the
    function as declared (``DEFAULT_GPU``). Requesting any other GPU raises
    :class:`GpuClientTooOldError` instead of an ``AttributeError``.
    """
    override = getattr(function, "with_options", None)
    if callable(override):
        return override(gpu=gpu), None
    if gpu == DEFAULT_GPU:
        return function, (
            "This modal client has no Function.with_options "
            f"(added in {WITH_OPTIONS_MIN_VERSION}). "
            f"Running the default {DEFAULT_GPU} check."
        )
    raise GpuClientTooOldError(
        f"Cannot request GPU {gpu!r}: Function.with_options needs modal >= "
        f"{WITH_OPTIONS_MIN_VERSION}. This client can only run the function's "
        f"pinned GPU ({DEFAULT_GPU})."
    )


def format_gpu_failure(exc: BaseException) -> str:
    """Explain a GPU scheduling failure without blaming the wrong cause.

    A missing ``with_options`` is a client-version error. Billing is mentioned
    only when the exception itself talks about a payment method.
    """
    detail = f"{type(exc).__name__}: {exc}"
    lowered = detail.lower()
    if isinstance(exc, AttributeError) and "with_options" in lowered:
        return (
            f"  {CROSS} {detail}\n"
            "      This is a client-version error, not a missing payment method.\n"
            f"      Function.with_options needs modal >= {WITH_OPTIONS_MIN_VERSION}.\n"
            f"      Upgrade with: pip install -U 'modal>={WITH_OPTIONS_MIN_VERSION}'"
        )
    if "payment method" in lowered or "billing" in lowered or "status 402" in lowered:
        return (
            f"  {CROSS} Could not get a GPU: {detail}\n"
            "      Modal requires a payment method before it will schedule a GPU.\n"
            "      Add one at https://modal.com/settings/billing"
        )
    return (
        f"  {CROSS} Could not get a GPU: {detail}\n"
        "      Modal returned the error above. A missing payment method is one\n"
        "      possible cause (https://modal.com/settings/billing), but only when\n"
        "      the message says so. Other causes include GPU quota, an unknown\n"
        "      GPU name, or a workspace restriction."
    )


def _rule(title: str = "") -> None:
    print(f"\n{'-' * 72}")
    if title:
        print(title)
        print("-" * 72)


@app.local_entrypoint()
def main(gpu: str = "A10", skip_gpu: bool = False) -> None:
    """Run every pre-flight check and print a go / no-go verdict."""
    print("\nN-ATLaS Modal pre-flight")
    print("=" * 72)

    failures: list[str] = []

    # ---- Hugging Face -----------------------------------------------------
    _rule("1. Hugging Face access to the five gated NCAIR1 repos")
    hf = check_hf_access.remote()

    if not hf["token_present"]:
        print(f"  {CROSS} HF_TOKEN is empty inside the container.")
        print(f"      Fix: modal secret create {SECRET_NAME} HF_TOKEN=hf_xxxxxxxx")
        failures.append("HF_TOKEN missing from the Modal Secret")
    else:
        who = hf.get("user") or "unknown"
        print(f"  {TICK} HF_TOKEN reached the container (account: {who})")
        if "user_error" in hf:
            print(f"      ! whoami failed: {hf['user_error']}")

        for repo_id, status in hf["models"].items():
            mark = TICK if status["ok"] else CROSS
            print(f"  {mark} {repo_id:<38} {status['detail']}")
            if not status["ok"]:
                failures.append(f"no access to {repo_id}")

        gated = [r for r, s in hf["models"].items() if not s["ok"]]
        if gated:
            print("\n      Accept the terms with the SAME account that owns the token:")
            for repo_id in gated:
                print(f"        https://huggingface.co/{repo_id}")

    # ---- GPU --------------------------------------------------------------
    if skip_gpu:
        _rule("2. GPU - skipped (--skip-gpu)")
    else:
        _rule(f"2. GPU allocation and VRAM headroom (requested: {gpu})")
        try:
            runner, note = prepare_gpu_check(check_gpu, gpu)
        except GpuClientTooOldError as exc:
            print(f"  {CROSS} {exc}")
            print(f"      Falling back to the pinned {DEFAULT_GPU} check.")
            print(f"      Upgrade with: pip install -U 'modal>={WITH_OPTIONS_MIN_VERSION}'")
            failures.append(f"requested GPU {gpu} but this modal client can only run {DEFAULT_GPU}")
            try:
                info = check_gpu.remote()
            except Exception as fallback_exc:
                print(format_gpu_failure(fallback_exc))
                failures.append("GPU unavailable")
                info = {"ok": False}
        else:
            if note:
                print(f"  ! {note}")
            try:
                info = runner.remote()
            except Exception as exc:
                print(format_gpu_failure(exc))
                failures.append("GPU unavailable")
                info = {"ok": False}

        if info.get("ok"):
            print(f"  {TICK} Got a {info['name']}")
            print(f"      driver {info['driver']}, compute capability {info['compute_capability']}")
            print(f"      total VRAM              {info['total_gib']:6.2f} GiB")
            print(f"      free at start           {info['free_gib']:6.2f} GiB")
            print()
            print(f"      N-ATLaS weights (BF16)  {info['llm_weights_gib']:6.2f} GiB")
            print(f"      4x Whisper Small (fp16) {info['asr_weights_gib']:6.2f} GiB")
            print(f"      runtime overhead        {info['overhead_gib']:6.2f} GiB")
            print(f"      {'=' * 38}")
            print(f"      required                {info['needed_gib']:6.2f} GiB")
            print(f"      left for KV cache       {info['kv_cache_gib']:6.2f} GiB")

            if info["kv_cache_gib"] <= 0:
                print(f"\n  {CROSS} This GPU cannot hold the LLM and the ASR models together.")
                print("      Options: use L40S (48 GB), split ASR onto its own container,")
                print("      or serve the LLM quantised.")
                failures.append(f"{info['name']} has too little VRAM")
            else:
                n = info["concurrent_full_context_conversations"]
                per = info["kv_per_full_conversation_gib"]
                print(f"\n      A full {LLM_CONTEXT_TOKENS}-token conversation costs")
                print(f"      {per:.2f} GiB of KV cache, so this GPU sustains about {n} at once")
                print("      (many more in practice - most chats are far shorter).")
                if n < 2:
                    print("\n  ! Tight. Fine for a demo, thin for the playground under load.")

    # ---- Verdict ----------------------------------------------------------
    _rule()
    if failures:
        print(f"{CROSS} NOT READY - {len(failures)} problem(s):")
        for f in failures:
            print(f"    - {f}")
        print("\nFix the above, then re-run this script.")
        raise SystemExit(1)

    print(f"{TICK} READY. Modal auth, GPU access and all five gated repos check out.")
    print("  Next: build serve/modal_app.py and `modal deploy` it.\n")
