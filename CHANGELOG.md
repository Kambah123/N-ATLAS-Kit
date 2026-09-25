# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Both published packages — `n-atlas` (npm) and `natlas` (PyPI) — are versioned
together from this file.

## [Unreleased]

### Changed

- README, docs (English and Hausa), the playground Get code panel, and the
  examples use the published installs: `npm install n-atlas`, `pnpm add n-atlas`,
  and `pip install natlas`.

## [0.1.0] - 2026-09-25

First published release. [`n-atlas@0.1.0`](https://www.npmjs.com/package/n-atlas)
is on npm and [`natlas==0.1.0`](https://pypi.org/project/natlas/) is on PyPI.

### Added

- `.github/workflows/release.yml` publishes `n-atlas` to npm (provenance, public)
  and `natlas` to PyPI (Trusted Publishing, no token). Beginner steps are in
  `docs/RELEASING.md`.

### Changed

- JavaScript support is Node 20 and newer. Node 18 is EOL, and the JS SDK job
  on pull request #2 failed only on Node 18: `File is not defined` while the
  transcription tests inspected a multipart upload. Node 20 and 22 were
  already green. `engines` is `>=20`.

### Fixed

- Modal image build: `vllm/vllm-openai:v0.11.0` has `python3` and no `python`
  binary, so Modal's `pip_install` exited 127. The image now links `python3`
  to `/usr/local/bin/python` before installing packages. The Dockerfile does
  the same so `docker compose` can start vLLM with `python`.
- `modal_preflight.py` no longer describes a missing `Function.with_options`
  (modal older than 1.4.3) as "no payment method". Older clients still run
  the pinned A10 GPU check, and a real billing failure is reported only when
  Modal's own error says so.

### Added

- `n-atlas` (JavaScript) and `natlas` (Python) clients for the `/serve`
  gateway: chat (including SSE streaming), transcription for Hausa, Igbo,
  Yoruba, and Nigerian English, `listModels` / `health`, plus small helpers
  that prompt N-ATLaS to translate, summarise, detect language, or reply to a
  voice note. Typed errors, timeouts, and retries with backoff. Tests mock
  HTTP and do not call a GPU.
- Runnable examples under `examples/js` and `examples/python` for chat,
  streaming, and transcription.
- VitePress docs site in `docs/` (English reference, plus Hausa overview and
  quickstart marked as needing native-speaker review).
- `examples/voice-note-translator` (CLI and local page) and
  `examples/support-reply` (multilingual customer-support draft). Both refuse
  to invent output when the gateway is not configured.

- pnpm workspace monorepo: `packages/js-sdk`, `packages/python-sdk`, `serve`,
  `apps/playground`, `docs`, `examples`.
- TypeScript in strict mode (plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), ESLint 9 flat config with type-aware rules,
  and Prettier.
- Python tooling: ruff (lint + format), mypy in strict mode, pytest with an
  `integration` marker that is skipped unless `NATLAS_BASE_URL` is set.
- Verified N-ATLaS model metadata exported from both SDKs — LLM repo id,
  usable context, the four ASR repo ids, and the Whisper Small 30 s / 16 kHz
  constraints.
- GitHub Actions CI: JS on Node 20/22, Python on 3.10–3.13, plus a
  guardrails job that fails the build on committed secrets, committed model
  weights, or a dependency on any non-N-ATLaS LLM SDK.
- Apache-2.0 `LICENSE` for the repository's code, and a `NOTICE` recording the
  separate, more restrictive N-ATLaS model terms.
- `.env.example`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a README with the
  pitch, planned features and repo layout.

[Unreleased]: https://github.com/Kambah123/N-ATLAS-Kit/commits/main
[0.1.0]: https://www.npmjs.com/package/n-atlas/v/0.1.0
