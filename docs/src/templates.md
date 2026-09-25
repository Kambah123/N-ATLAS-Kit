# Templates

Three starter apps live in [`templates/`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/templates). They call the published `n-atlas` package (npm). The gateway key stays on the server.

Set `NATLAS_BASE_URL` to your gateway origin and `NATLAS_API_KEY` to its bearer token. A trailing `/v1` on the base URL is optional.

## Hausa customer support

[`templates/hausa-support`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/templates/hausa-support)

A Next.js shop assistant that replies in Hausa.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKambah123%2FN-ATLAS-Kit&project-name=natlas-hausa-support&root-directory=templates%2Fhausa-support&env=NATLAS_API_KEY,NATLAS_BASE_URL&envDescription=NATLAS_API_KEY%20is%20the%20gateway%20bearer%20token.%20NATLAS_BASE_URL%20is%20the%20gateway%20origin.%20A%20trailing%20%2Fv1%20is%20optional.)

## Farmer advice

[`templates/farmer-advice`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/templates/farmer-advice)

A Next.js bot. The farmer picks Hausa, Yorùbá, or Igbo, and the reply uses that language.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKambah123%2FN-ATLAS-Kit&project-name=natlas-farmer-advice&root-directory=templates%2Ffarmer-advice&env=NATLAS_API_KEY,NATLAS_BASE_URL&envDescription=NATLAS_API_KEY%20is%20the%20gateway%20bearer%20token.%20NATLAS_BASE_URL%20is%20the%20gateway%20origin.%20A%20trailing%20%2Fv1%20is%20optional.)

## WhatsApp bot

[`templates/whatsapp-bot`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/templates/whatsapp-bot)

A Node webhook for the WhatsApp Cloud API. It also needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_VERIFY_TOKEN`. The README has the Meta callback steps.
