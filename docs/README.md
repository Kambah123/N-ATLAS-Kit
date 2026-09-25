# `/docs` — documentation, in English and Hausa

> **🚧 Not built yet.** This directory is a placeholder. It gets filled in a
> later milestone.

A docs site (Nextra or VitePress), deployable to Vercel. **Every page ships in
English and Hausa**, with a language switcher — a toolkit for Nigerian
languages documented only in English would be missing its own point.

## Planned sections

- Introduction
- Quickstart — JS, Python, curl
- Self-hosting N-ATLaS
- SDK reference — generated from code comments where possible
- Speech-to-text guide
- Examples
- Fine-tuning pointers
- FAQ

Plus the two pages that prove the integration is real:

- **N-ATLAS Integration** — exactly how each component uses N-ATLaS: model ids,
  endpoints, the chat template, ASR routing. With a mermaid architecture
  diagram.
- **Architecture** — system diagram, data flow, and security: where keys live,
  and why no user content is ever logged.

## On the Hausa

Hausa drafted with machine assistance is marked inline:

> ⚠️ **Needs native review**

Native speakers: clearing one of those markers is one of the most valuable
contributions you can make to this repo. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## `docs/evidence/`

Real, dated outputs captured from a live N-ATLaS endpoint — the proof for the
NAIC submission that this toolkit talks to the actual model. Generated, not
hand-written, and git-ignored until it is deliberately committed.
