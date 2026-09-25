# N-ATLAS Kit

::: danger Ana buƙatar bita daga mai Hausa na asali
An rubuta wannan shafin da taimakon na'ura. **Ba a duba shi ba.** Ba a yi
ikirarin cewa mai magana da Hausa ya karanta ko ya amince da fassara ba. Idan
Hausa yarenka ne, gyara shi. Har sai an yi hakan, kar ka dauki kalmomin a
matsayin fassarar da aka tabbatar.
:::

Kayan aiki ne na masu haɓaka software don **N-ATLaS**, babban samfurin harsuna
da yawa na Najeriya, tare da samfuran ji huɗu na NCAIR1.

N-ATLaS yana magana da **Hausa, Igbo, Yorùbá, da Turancin Najeriya**. Playground
yana da Nigerian Pidgin (beta). Samfuran
ji kowannensu Whisper Small ne, ɗaya ga kowane harshe, an horar da su da muryoyin
da aka yi rikodin a dukkan yankunan Najeriya shida. Wannan repo ba ya ɗauke da
nauyin samfurin. Abin da yake ɗauka shi ne mai kira da kuma kayan girka.

Turanci na wannan shafin yana nan: [Overview](/).

## Me ya sa

Samfuran suna kan Hugging Face. Amfani da su har yanzu yana nufin karɓar
sharuddan da aka kulle, sauke kusan gigabytes 15, sanin cewa samfurin chat yana
bukatar `date_string`, nemo repo na ASR guda huɗu, sannan ka gano cewa kowanne
yana karɓar sauti na daƙiƙa 30 kawai a 16 kHz, mono.

N-ATLAS Kit shine layer da ke gaba:

| Abu                                                | Shi ne                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `serve/`                                           | Ƙofa ɗaya, irin OpenAI, don chat da dukkan samfuran ji huɗu                 |
| `n-atlas`                                          | SDK na JavaScript / TypeScript. `npm install n-atlas` ko `pnpm add n-atlas` |
| `natlas`                                           | SDK na Python, sync da async. `pip install natlas`                          |
| [Misalai](/examples)                               | Ƙananan apps da za ka iya gudanarwa                                         |
| [Playground](https://natlas-playground.vercel.app) | App na browser: chat, speech, da get-code                                   |

Babu API na NCAIR da kowa ke kira a wannan sigar. Kowanne client yana ɗaukar
`baseURL`. Gateway da aka girka don demo na gasar yana nan:

```text
https://kambah123--natlas-serve-natlasservice-serve.modal.run
```

`GET /health` a kan wannan host baya bukatar API key. Yana kwantawa zuwa sifili,
don haka kiran farko bayan lokaci mai nisa yana iya jira (cold start) yayin da
akwai sake loda samfurin. Chat da transcription suna bukatar Bearer key da ke
cikin sirrin Modal `natlas-api`. Ba a saka wannan key a cikin repo ba.

## Mintuna goma, idan gateway ya riga ya tashi

1. Shigar da Node.js 20 ko sabo, ko Python 3.10 ko sabo.
2. Saita `NATLAS_BASE_URL` zuwa tushen gateway, da `NATLAS_API_KEY` zuwa key da
   gateway ke karɓa.
3. Bi [farawa](/ha/quickstart) don kira ɗaya na chat da kira ɗaya na
   transcription, ko ka gudanar da mai fassara saƙon murya a [misalai](/examples).

Idan waɗannan variables ba su nan, SDK da misalan apps suna tsayawa suka faɗi
haka. Ba su ɗora rubutu ko amsa da ba gateway ya mayar ba.

## Abin da kit ba zai yi ba

- Ba zai kira GPT, Claude, Gemini, ko samfurin wani kamfani ba. Idan id na
  samfuri bai fara da `NCAIR1/` ba, client yana ƙi.
- Ba ya sauke nauyin samfuri sai dai idan ka girka gateway da kanka.
- Ba ya ɗauke da fassarar Hausa da aka duba ba. Bayani da farawa suna da Hausa,
  kuma an yi musu alama cewa ana bukatar mai magana da Hausa ya duba su.

## Ina za ka je

- [Farawa](/ha/quickstart)
- [Gateway API](/gateway) (Turanci)
- [JavaScript SDK](/sdk/javascript) da [Python SDK](/sdk/python) (Turanci)
- [Girka da kanka](/self-hosting) (Turanci)
- [Matsaloli](/troubleshooting) (Turanci)
- [Lasisi](/licensing) (Turanci)
