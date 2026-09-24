# `natlas`

Python SDK for **N-ATLaS**, Nigeria's sovereign multilingual LLM — Hausa, Igbo,
Yorùbá and Nigerian English — and its four ASR models.

Part of [N-ATLAS Kit](https://github.com/Kambah123/N-ATLAS-Kit).

> **🚧 Scaffold.** The package currently exports verified model metadata only.
> The clients and CLI land in the next milestone — the shape below is the
> committed API, not something you can `pip install` and use yet.

---

## Install

```bash
pip install natlas              # HTTP client
pip install "natlas[cli]"       # + the `natlas` command
pip install "natlas[local]"     # + run the models locally via transformers (needs a GPU)
```

Python 3.10+.

## Planned API

```python
from natlas import NAtlas

natlas = NAtlas(base_url=os.environ["NATLAS_BASE_URL"], api_key=os.environ["NATLAS_API_KEY"])

# Streaming chat
for chunk in natlas.chat(
    messages=[{"role": "user", "content": "Menene ake nufi da gwagwarmaya?"}],
    language="ha",
    stream=True,
):
    print(chunk.delta, end="", flush=True)

natlas.translate(text="Good morning", from_="en", to="yo")
natlas.summarize(text=long_article, language="ig")
natlas.detect_language("Kedu ka ị mere?")
natlas.transcribe(audio=Path("voice.ogg"), language="ha")
natlas.voice_chat(audio=Path("voice.ogg"), language="ha")  # transcript + reply
```

Async is the same surface:

```python
from natlas import AsyncNAtlas

async with AsyncNAtlas(base_url=...) as natlas:
    async for chunk in await natlas.chat(..., stream=True):
        print(chunk.delta, end="")
```

Responses are pydantic models. Planned CLI:

```bash
natlas chat --lang ha
natlas transcribe voice.ogg --lang ha
natlas translate "Good morning" --to yo
```

## Available today

```python
from natlas import (
    LLM_MODEL_ID,  # 'NCAIR1/N-ATLaS'
    LLM_CONTEXT_TOKENS,  # 8092
    ASR_MODEL_IDS,  # {'ha': 'NCAIR1/Hausa-ASR', ...}
    ASR_MAX_SEGMENT_SECONDS,  # 30
    ASR_SAMPLE_RATE,  # 16000
    LANGUAGES,
    LANGUAGE_NAMES,
    BACKENDS,
    ATTRIBUTION,
    is_language,
)
```

## You need a backend

There is **no public hosted N-ATLaS API yet**. Run your own with
[`/serve`](https://github.com/Kambah123/N-ATLAS-Kit/tree/main/serve), or use the
`local` backend to load `NCAIR1/N-ATLaS` and the ASR models directly with
`transformers` (all five repos are gated — accept the terms and set `HF_TOKEN`).

## Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

ruff check . && ruff format --check .
mypy src
pytest
```

## Licence

Code: **Apache-2.0**.

The models are **not** Apache-2.0 — they carry Awarri's Open-Source Research and
Innovation License, which requires attribution and caps you at 1,000 active
end-users per 30 days. See
[`NOTICE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/NOTICE).

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation
> and Digital Economy, and powered by Awarri Technologies.
