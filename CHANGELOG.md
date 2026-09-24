# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Both published packages — `n-atlas` (npm) and `natlas` (PyPI) — are versioned
together from this file.

## [Unreleased]

### Added

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
- GitHub Actions CI: JS on Node 18/20/22, Python on 3.10–3.13, plus a
  guardrails job that fails the build on committed secrets, committed model
  weights, or a dependency on any non-N-ATLaS LLM SDK.
- Apache-2.0 `LICENSE` for the repository's code, and a `NOTICE` recording the
  separate, more restrictive N-ATLaS model terms.
- `.env.example`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a README with the
  pitch, planned features and repo layout.

[Unreleased]: https://github.com/Kambah123/N-ATLAS-Kit/commits/main
