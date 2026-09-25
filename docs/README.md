# Docs site

Static site for N-ATLAS Kit, built with [VitePress](https://vitepress.dev/).
English is the default locale. Hausa overview and quickstart live under `src/ha/`.

The Hausa pages carry a visible warning: they have **not** been reviewed by a
native speaker.

## Build

From the repository root:

```bash
pnpm install
pnpm --filter @n-atlas/docs build
```

Output: `docs/.vitepress/dist`. Preview locally with:

```bash
pnpm --filter @n-atlas/docs preview
```

`pnpm --filter @n-atlas/docs dev` serves a live reload preview.

## Deploy to Vercel

Create a Vercel project for this repository and set:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Root Directory   | `docs`                                       |
| Framework        | VitePress                                    |
| Install command  | `cd .. && pnpm install --frozen-lockfile`    |
| Build command    | `cd .. && pnpm --filter @n-atlas/docs build` |
| Output directory | `.vitepress/dist`                            |
| Clean URLs       | `true` (`cleanUrls` in `vercel.json`)        |

VitePress writes `quickstart.html` and links to `/quickstart`. `cleanUrls` makes
Vercel serve those extensionless paths, including `/ha/quickstart`. Without it,
a direct load or refresh returns 404 while `/quickstart.html` still returns 200.

`vercel.json` in this directory records those commands. The site has no server
code and no environment variables. Do not put `NATLAS_API_KEY` or `HF_TOKEN`
in the Vercel project.

The playground (`apps/playground`) is a separate app. Do not point this
project at that directory.
