# `/examples`

> **🚧 Not built yet.** This directory is a placeholder. It gets filled in a
> later milestone.

Small, complete, runnable programs. Each gets its own README and a single
command that actually works.

| Example                           | Stack   | What it does                                                                    |
| --------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `hausa-chatbot-cli`               | Python  | A terminal chatbot that talks Hausa, using `natlas`                             |
| `whatsapp-voice-note-transcriber` | Node    | Takes an `.ogg` voice note → transcribes it in Hausa → translates it to English |
| `yoruba-summarizer`               | JS      | Summarises a long Yorùbá document                                               |
| `nextjs-chat-starter`             | Next.js | A minimal template to clone and ship                                            |
| `colab-notebook`                  | Jupyter | Loads the SDK and calls a hosted endpoint                                       |

Every example needs a backend — set `NATLAS_BASE_URL` and `NATLAS_API_KEY`, or
run [`/serve`](../serve) locally. None of them will ever print a fabricated
response; if there is no backend, they say so and exit.
