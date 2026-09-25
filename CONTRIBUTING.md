# Contributing to N-ATLAS Kit

Thanks for helping make Nigeria's sovereign LLM easy to build with. 🇳🇬

This document covers how to set the repo up, the rules that are
non-negotiable, and how to get a change merged.

---

## Ground rules

These are the ones we will not bend on. A PR that breaks any of them gets
closed, however good the code is.

1. **It must genuinely use N-ATLaS.** Every inference path goes to
   `NCAIR1/N-ATLaS` or one of the four `NCAIR1` ASR models. Do not add GPT,
   Claude, Gemini, Mistral or any other general model — not as a feature, not
   as a "temporary" fallback, not behind a flag.
2. **No fake output where a user can see it.** No canned replies, no
   placeholder transcripts, no "demo mode" that pretends to be the model. If
   there is no backend, say so. Mocks are allowed **only** inside unit tests.
3. **Secrets live in environment variables.** Never commit a key, never put one
   in a `NEXT_PUBLIC_*` variable, never log one. Add new variables to
   `.env.example` with a comment.
4. **No model weights in the repo.** They are gated, huge, and under terms that
   are incompatible with our Apache-2.0 code. `.gitignore` blocks the usual
   extensions — don't work around it.
5. **Respect the N-ATLaS terms.** Attribution, the 1,000-active-user cap, and
   the prohibited-use list apply to anything you build. See
   [`NOTICE`](./NOTICE).

---

## Setting up

You need **Node ≥ 20**, **pnpm 9**, **Python ≥ 3.10**, and **ffmpeg** if you
are touching audio.

```bash
git clone https://github.com/Kambah123/N-ATLAS-Kit.git
cd N-ATLAS-Kit

corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install

cp .env.example .env
```

For Python work:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e "packages/python-sdk[dev]"
```

### Getting model access

All five `NCAIR1` repos are gated. You only need this for `serve/` and the
Python `local` backend — SDK work does not require it.

1. Create a Hugging Face account.
2. Visit each model page and accept the terms:
   [N-ATLaS](https://huggingface.co/NCAIR1/N-ATLaS) ·
   [Hausa-ASR](https://huggingface.co/NCAIR1/Hausa-ASR) ·
   [Igbo-ASR](https://huggingface.co/NCAIR1/Igbo-ASR) ·
   [Yoruba-ASR](https://huggingface.co/NCAIR1/Yoruba-ASR) ·
   [NigerianAccentedEnglish](https://huggingface.co/NCAIR1/NigerianAccentedEnglish)
3. Create a **read** token and put it in `.env` as `HF_TOKEN`.

---

## The checks

CI runs exactly what these scripts run. Run them before you push and there
will be no surprises.

### JavaScript / TypeScript

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `pnpm format:check` | Prettier                         |
| `pnpm lint`         | ESLint (flat config, type-aware) |
| `pnpm typecheck`    | `tsc --noEmit`, strict mode      |
| `pnpm test`         | Vitest                           |
| `pnpm build`        | tsup → ESM + CJS + `.d.ts`       |
| `pnpm check`        | all of the above except build    |

TypeScript is **strict**, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noUnusedLocals`. `any` is a warning — prefer
`unknown` and narrow.

### Python

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `pnpm py:lint`      | `ruff check` + `ruff format --check` |
| `pnpm py:typecheck` | `mypy src` (strict)                  |
| `pnpm py:test`      | `pytest`                             |

Or from `packages/python-sdk/` directly: `ruff check .`, `mypy src`, `pytest`.

### Autofix

```bash
pnpm format && pnpm lint:fix
cd packages/python-sdk && ruff format . && ruff check --fix .
```

---

## Tests

- **Unit tests** must not hit the network. Mock `fetch` in JS; mock the `httpx`
  transport in Python.
- **Integration tests** run against a real endpoint and are **skipped unless
  `NATLAS_BASE_URL` is set**. They must never be required for CI to pass.
- Target is **>70% coverage** on both SDKs.

```bash
# unit only (what CI does)
pnpm test

# include integration tests against your own /serve instance
NATLAS_BASE_URL=http://localhost:8080/v1 NATLAS_API_KEY=... pnpm test
```

---

## Commits and branches

- Branch from `main`: `feat/js-sdk-streaming`, `fix/asr-chunk-overlap`,
  `docs/hausa-quickstart`.
- [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `ci:`.
  Scope with the package where it helps — `feat(js-sdk): ...`.
- Keep PRs focused. One concern per PR.

### Pull request checklist

- [ ] `pnpm check` passes (and the Python checks, if you touched Python)
- [ ] New behaviour has tests
- [ ] No secrets, no weights, no fake output
- [ ] `.env.example` updated if you added a variable
- [ ] READMEs and docs updated — **including the Hausa page** if you changed an
      English one (flag it for review if you are not a speaker)
- [ ] `CHANGELOG.md` entry under `## Unreleased`

---

## Publishing

`n-atlas` (npm) and `natlas` (PyPI) are published from GitHub Actions, not from
a laptop. The button is **Actions → Release → Run workflow**. The npm token,
the PyPI pending Trusted Publisher, and the exact field values are in
[`docs/RELEASING.md`](./docs/RELEASING.md).

## Translations

This is the contribution we want most.

The docs and the playground UI ship in English and Hausa, and the SDK has
per-language system prompts. Machine-assisted drafts are marked:

> ⚠️ **Needs native review** — this sentence was drafted by a non-native
> speaker and has not been verified.

If you speak Hausa, Igbo or Yorùbá, fixing one of those markers is a genuinely
valuable PR. Please:

- Keep the tone natural and conversational, not literal word-for-word.
- Keep technical terms (`baseURL`, `POST`, `npm install`) in English.
- Remove the ⚠️ marker when you have verified a sentence, and say in the PR
  that you are a native speaker.

---

## Reporting bugs and security issues

**Bugs** — open an issue with your OS, Node/Python version, package version,
the command you ran, what you expected and what happened. Scrub any keys.

**Security** — do not open a public issue. Report privately through GitHub
Security Advisories on this repository.

---

## Licence

By contributing you agree that your contribution is licensed under
**Apache-2.0**, matching [`LICENSE`](./LICENSE).
