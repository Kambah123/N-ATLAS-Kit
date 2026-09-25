# Farawa

::: danger Ana buƙatar bita daga mai Hausa na asali
An rubuta wannan shafin da taimakon na'ura. **Ba a duba shi ba.** Ba a yi
ikirarin cewa mai magana da Hausa ya karanta ko ya amince da fassara ba.
Lambar da ke ƙasa ita ce lambar gaskiya; kalmomin Hausa na bayani suna jiran
bita. Shafin Turanci: [Quickstart](/quickstart).
:::

Kana bukatar gateway na N-ATLaS da ke gudana. Ko ka yi amfani da wanda aka riga
aka girka, ko ka bi [girka da kanka](/self-hosting) (shafin Turanci).

Gateway na demo (yana kwantawa zuwa sifili — ka yi tsammanin cold start):

```text
https://kambah123--natlas-serve-natlasservice-serve.modal.run
```

Duba shi ba tare da key ba:

```bash
curl -fsS https://kambah123--natlas-serve-natlasservice-serve.modal.run/health
```

Idan jiki yana da `"status": "ok"`, duka vLLM da ASR suna tashi. `"degraded"`
tare da HTTP 503 yana nufin tsari yana gudana amma upstream ɗaya bai tashi ba.
Chat da transcription har yanzu suna bukatar Bearer key. Ba a buga wannan key
a cikin repo ba.

```bash
export NATLAS_BASE_URL=https://kambah123--natlas-serve-natlasservice-serve.modal.run
export NATLAS_API_KEY=your-gateway-key
```

`NATLAS_BASE_URL` na iya zama tushen URL, ko tushen tare da `/v1`. Dukkan SDKs
suna karɓa. `GET /health` koyaushe yana kan tushen host, ba ƙarƙashin `/v1` ba.

## JavaScript

Node.js 20 ko sabo. Sunan package shine `n-atlas`.

```bash
npm install n-atlas
```

`n-atlas` ba ya kan npm tukuna. Not on npm/PyPI yet? Install from GitHub. The
repository must be public.

```bash
pnpm add "github:Kambah123/N-ATLAS-Kit#path:packages/js-sdk"
```

A cikin wannan monorepo, gina package na workspace maimakon npm, idan sigar da
aka buga ta yi baya:

```bash
pnpm install
pnpm --filter n-atlas build
```

```js
import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL,
  apiKey: process.env.NATLAS_API_KEY,
});

const reply = await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
});
console.log(reply.content);

const heard = await natlas.transcribe({
  audio: 'voice-note.ogg', // hanya a Node. A browser, aika Blob ko File.
  language: 'ha',
});
console.log(heard.text);
```

`language: 'ha'` a kan chat don log ne. Gateway yana cire shi kafin vLLM. A kan
`transcribe`, `language` dole ne: yana zaɓar `NCAIR1/Hausa-ASR`. Yi amfani da
`ig`, `yo`, ko `en` don sauran su. Ana karɓar lakabi irin `hausa` da `Yorùbá`.

## Python

Python 3.10 ko sabo. Sunan package shine `natlas`.

```bash
pip install natlas
```

`natlas` ba ya kan PyPI tukuna. Not on npm/PyPI yet? Install from GitHub. The
repository must be public.

```bash
pip install "git+https://github.com/Kambah123/N-ATLAS-Kit.git#subdirectory=packages/python-sdk"
```

Daga wannan repo:

```bash
pip install -e packages/python-sdk
```

```python
import os
from natlas import NAtlas

with NAtlas(
    base_url=os.environ["NATLAS_BASE_URL"],
    api_key=os.environ["NATLAS_API_KEY"],
) as natlas:
    reply = natlas.chat(
        messages=[{"role": "user", "content": "Menene ake nufi da gwagwarmaya?"}],
        language="ha",
    )
    print(reply.content)

    heard = natlas.transcribe(audio="voice-note.ogg", language="ha")
    print(heard.text)
```

`timeout` a client na Python **seconds** ne. `NATLAS_TIMEOUT_MS` milliseconds
ne (tsoho 60000, wato seconds 60).

## curl

```bash
curl -sS "$NATLAS_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "NCAIR1/N-ATLaS",
    "messages": [{"role": "user", "content": "Sannu!"}],
    "language": "ha"
  }'
```

Idan `NATLAS_BASE_URL` ya riga ya ƙare da `/v1`, kar ka sake ƙara `/v1` a
cikin hanya.

```bash
curl -sS "$NATLAS_BASE_URL/v1/audio/transcriptions" \
  -H "Authorization: Bearer $NATLAS_API_KEY" \
  -F file=@voice-note.ogg \
  -F language=ha
```

`language` dole ne a transcription. Fayil na iya zama saƙon murya na WhatsApp
`.ogg`, mp3, m4a, wav, flac, ko duk abin da ffmpeg zai iya buɗewa. Gateway yana
maida shi 16 kHz mono, kuma yana raba sauti da ya wuce taga na seconds 30 na
Whisper.

## Idan ya gaza nan da nan

| Abin da ka gani                  | Ma'ana                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Set baseURL or NATLAS_BASE_URL` | Client ba shi da adireshin gateway. Ba a aika komai ba                                                                    |
| HTTP 401, `AuthError`            | Bearer key ya ɓace ko bai yi daidai ba                                                                                    |
| Tsari yana jira, sannan timeout  | Sau da yawa cold start ne. Timeout na SDK seconds 60 ne, ƙanƙanta da lokacin loda GPU. Duba [matsaloli](/troubleshooting) |
| HTTP 400 a transcription         | `language` ba a goyon baya, sauti fanko ne, ko ffmpeg ya kasa buɗe fayil                                                  |

Cikakken siffar request: [Gateway API](/gateway).
