# Farmer-advice bot

A small Next.js app. The farmer picks Hausa, Yorùbá, or Igbo, and N-ATLaS answers in that language. The API key stays on the server.

## Setup

```bash
cd templates/farmer-advice
npm install
cp .env.example .env.local
```

Edit `.env.local`:

| Variable          | What it is                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NATLAS_API_KEY`  | Gateway bearer token. On Modal this is a value from the `natlas-api` secret (`NATLAS_API_KEYS`).                       |
| `NATLAS_BASE_URL` | Gateway origin. A trailing `/v1` is optional. Example: `https://kambah123--natlas-serve-natlasservice-serve.modal.run` |

```bash
npm run dev
```

Open http://localhost:3000. If port 3000 is taken, Next.js prints another port.

## Deploy with Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKambah123%2FN-ATLAS-Kit&project-name=natlas-farmer-advice&root-directory=templates%2Ffarmer-advice&env=NATLAS_API_KEY,NATLAS_BASE_URL&envDescription=NATLAS_API_KEY%20is%20the%20gateway%20bearer%20token.%20NATLAS_BASE_URL%20is%20the%20gateway%20origin.%20A%20trailing%20%2Fv1%20is%20optional.)

Set the root directory to `templates/farmer-advice` if the form does not fill it in. Add the two env vars, then deploy.
