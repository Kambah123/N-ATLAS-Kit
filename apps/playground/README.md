# `/apps/playground` — the N-ATLaS playground

> **🚧 Not built yet.** This directory is a placeholder. It gets filled in the
> next milestone.

A Next.js (App Router) playground for N-ATLaS, deployable to Vercel. It will
consume our own `n-atlas` SDK as a workspace dependency — if the SDK is awkward
to use, we find out here first.

## What is planned

| Page             | Features                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**         | Streaming chat, language picker (Hausa / Igbo / Yorùbá / Nigerian English), temperature and max-token sliders, system prompt box, copy button |
| **Speech**       | Record from the mic or upload audio, pick a language, get the transcript, optionally send it straight into chat                               |
| **Tools**        | Translate and summarize panels                                                                                                                |
| **Get the code** | A live panel showing the exact JS, Python and curl that reproduces what you just did                                                          |

Plus:

- **No fake responses, ever.** With no backend configured the app shows a clear
  _"No N-ATLAS backend connected"_ state and tells you how to run `/serve`.
- **Keys never reach the browser.** Every call goes through a Next.js route
  handler; `NATLAS_BASE_URL` and `NATLAS_API_KEY` stay server-side and are never
  `NEXT_PUBLIC_*`.
- **Anonymous usage logging** — request counts per feature and language, plus
  latency, to Vercel KV or Supabase. **No user content is stored.**
- Clean Nigerian-themed design, mobile friendly, UI in English and Hausa.

## Licence reminder

The footer carries the attribution the N-ATLaS terms require. A public
deployment is capped at 1,000 active end-users per rolling 30 days.
See [`NOTICE`](../../NOTICE).
