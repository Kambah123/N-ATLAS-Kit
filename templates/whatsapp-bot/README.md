# WhatsApp bot

A Node webhook for the [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api). Incoming texts are answered by N-ATLaS through the published `n-atlas` package. The gateway key stays in this process.

## Setup

```bash
cd templates/whatsapp-bot
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable                   | What it is                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `NATLAS_API_KEY`           | Gateway bearer token (`natlas-api` / `NATLAS_API_KEYS` on Modal).                   |
| `NATLAS_BASE_URL`          | Gateway origin. A trailing `/v1` is optional.                                       |
| `WHATSAPP_TOKEN`           | Permanent or temporary token from the Meta app.                                     |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from the WhatsApp Cloud API dashboard, not the phone number itself. |
| `WHATSAPP_VERIFY_TOKEN`    | A string you invent. The same string goes in the Meta webhook form.                 |
| `WHATSAPP_LANGUAGE`        | `ha` (default), `yo`, `ig`, `en`, or `pcm`.                                         |
| `PORT`                     | Defaults to `8788`.                                                                 |

```bash
npm start
```

`GET /health` returns which env vars are still empty.

## Point Meta at the webhook

1. In the Meta app, open WhatsApp → Configuration.
2. Set the callback URL to `https://YOUR-HOST/webhook`.
3. Set the verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` field.
5. For a laptop, expose the port with a tunnel (`ngrok http 8788` or Cloudflare Tunnel) and use that HTTPS URL.

Send a WhatsApp message to the test number. The bot replies in `WHATSAPP_LANGUAGE`.

This template uses the Cloud API, which has a free developer tier. A Twilio WhatsApp sender can call the same `NAtlas` client; this file does not include the Twilio signature check.
