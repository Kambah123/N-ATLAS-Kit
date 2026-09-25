# N-ATLAS Playground

A small Next.js app for trying N-ATLaS in the browser: streaming chat, speech
to text, and a "get the code" panel that shows the same call in curl,
`n-atlas`, and `natlas`.

The browser never sees `NATLAS_API_KEY`. Pages call Next.js route handlers,
and those handlers call the gateway in [`/serve`](../../serve/README.md).

## What you can do

| Tab          | What it does                                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**     | Stream a reply from `NCAIR1/N-ATLaS`. Pick a language hint (English, Hausa, Igbo, Yorùbá, Pidgin), try an example prompt, and set temperature and max tokens.                                                                                                                                  |
| **Speech**   | Record from the microphone or upload `.ogg` (WhatsApp), `.mp3`, `.m4a`, or `.wav`. Choose Hausa, Igbo, Yorùbá, or Nigerian English — each one selects that NCAIR1 ASR model. **Reply to this** sends the transcript into chat. **Translate to English** asks N-ATLaS for an English rendering. |
| **Get code** | Curl, [`n-atlas`](../../packages/js-sdk/) (`npm install n-atlas`), and [`natlas`](../../packages/python-sdk/) (`pip install natlas`) for the last chat or transcription. Curl stays the raw gateway call. The playground itself still calls the route handlers, not the SDK packages.          |

A status pill polls `GET /health`. A cold gateway (Modal scales to zero) shows
**Waking the model up (first request can take ~2 min)**. The server follows
the HTTP 303 Modal can return while a container is starting.

Prompts and audio are not stored.

## Local development

From the repo root (pnpm workspace):

```bash
pnpm install
cp apps/playground/.env.example apps/playground/.env.local
```

Edit `.env.local`:

```bash
NATLAS_BASE_URL=http://localhost:8080
NATLAS_API_KEY=the-key-you-set-as-NATLAS_API_KEYS
```

`NATLAS_BASE_URL` may be the gateway origin or the origin plus `/v1`. Then:

```bash
pnpm --filter @n-atlas/playground dev
```

Open <http://localhost:3000>. With the variables unset, the app stays usable
and says **No N-ATLAS backend connected** instead of inventing a reply.

```bash
pnpm --filter @n-atlas/playground test
pnpm --filter @n-atlas/playground typecheck
pnpm --filter @n-atlas/playground build
```

Route-handler tests mock the gateway. They do not need a GPU or a live URL.

## Deploy on Vercel

Create a Vercel project from this repo. These are the settings that matter:

| Setting          | Value                                                               |
| ---------------- | ------------------------------------------------------------------- |
| Root Directory   | `apps/playground`                                                   |
| Framework Preset | Next.js (auto-detected)                                             |
| Install command  | leave empty (Vercel installs the pnpm workspace from the repo root) |
| Build command    | leave empty (`next build` from this package)                        |
| Node.js          | 20.x or 22.x                                                        |

Leave **Include source files outside of the Root Directory** enabled so the
root `pnpm-lock.yaml` is part of the install.

Environment variables (server only — do **not** use `NEXT_PUBLIC_`):

| Name              | Required | Example                                        |
| ----------------- | -------- | ---------------------------------------------- |
| `NATLAS_BASE_URL` | yes      | `https://your-app.modal.run`                   |
| `NATLAS_API_KEY`  | yes      | one value from the gateway's `NATLAS_API_KEYS` |

Optional: `NATLAS_HEALTH_TIMEOUT_MS` (default `8000`) and
`NATLAS_UPSTREAM_TIMEOUT_MS` (default `180000`). See `.env.example`.

Chat and transcription routes set `maxDuration = 300` so a cold start has
time to finish. On a plan that caps functions at 60 seconds, the first
request after idle can fail and the next one succeeds once the model is
warm. Raise the project function duration to 300 seconds if the plan allows
it (Project → Settings → Functions).

The live gateway used while this was built:

`https://kambah123--natlas-serve-natlasservice-serve.modal.run`

Point `NATLAS_BASE_URL` at that origin only if you hold a key for it.

## Attribution

N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation
and Digital Economy, and powered by Awarri Technologies.

The models use Awarri's Open-Source Research and Innovation License, not
Apache-2.0. Public deployments are capped at 1,000 active end-users in any
rolling 30 days. Details are in the repo [`NOTICE`](../../NOTICE). This app's
code is Apache-2.0.

Built by OneDev Studioo.
