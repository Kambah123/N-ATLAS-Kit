# Licensing and attribution

Two licences apply, and they are not the same.

**Code in this repository is Apache-2.0.** See [`LICENSE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/LICENSE).

**The models are not Apache-2.0, and they are not OSI open source.** N-ATLaS
and the four speech models are published by Awarri Technologies and the
Federal Ministry of Communications, Innovation and Digital Economy (NCAIR /
NITDA) under an "Open-Source Research and Innovation License" (Terms of Use
for N-ATLaS, Version 1.0, September 2025). The model cards describe it as
inspired by Apache-2.0 and MIT. It adds restrictions that the cards and
[`NOTICE`](https://github.com/Kambah123/N-ATLAS-Kit/blob/main/NOTICE) summarise.
The cards are the authoritative text.

N-ATLAS Kit ships no weights and is a client. The Apache-2.0 grant covers the
toolkit source. Calling the models still binds you to the model terms.

## Models

| Repo                             | Role                                            |
| -------------------------------- | ----------------------------------------------- |
| `NCAIR1/N-ATLaS`                 | Llama-3 8B fine-tune (`LlamaForCausalLM`). Text |
| `NCAIR1/Hausa-ASR`               | Whisper Small fine-tune, Hausa                  |
| `NCAIR1/Igbo-ASR`                | Whisper Small fine-tune, Igbo                   |
| `NCAIR1/Yoruba-ASR`              | Whisper Small fine-tune, Yorùbá                 |
| `NCAIR1/NigerianAccentedEnglish` | Whisper Small fine-tune, Nigerian English       |

All five repositories are gated. Accept the terms on Hugging Face before
download. Base models carry their own terms as well: the Meta Llama 3
Community License under N-ATLaS, and MIT `openai/whisper-small` under the ASR
checkpoints.

## Terms that matter for an app

Summarised from `NOTICE`. Read the model card before you rely on this list.

| Term                                               | Practical effect                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attribution is mandatory                           | Show the sentences below wherever end users see model output                                                                                               |
| Share-alike on model derivatives                   | A fine-tune of the model stays under the same model terms. This client code is not a derivative of the weights                                             |
| Cap of 1,000 active end-users in a rolling 30 days | Above that, you need a commercial licence from Awarri                                                                                                      |
| Not for enterprise or commercial deployment        | Research, education, civic tech, accessibility, cultural preservation, and community projects are the uses the summary allows without a separate agreement |
| Prohibited uses                                    | Surveillance, discriminatory profiling, disinformation and impersonation, military or weaponised deployment                                                |
| Renamed derivatives                                | The summary in the repository README says renamed derivatives must carry the suffix "Powered by Awarri"                                                    |
| Governing law                                      | Federal Republic of Nigeria                                                                                                                                |

## Attribution strings

Surface both where people see output. The gateway also returns the first
sentence on `GET /health`.

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.

> Awarri Technologies and the Federal Government of Nigeria, developers of N-ATLaS (Hausa-ASR / Igbo-ASR / Yoruba-ASR / NigerianAccentedEnglish).

The JavaScript and Python packages export the first sentence as `ATTRIBUTION`.

## Hausa pages on this site

The Hausa overview and quickstart were drafted with machine assistance. They
are not a reviewed translation, and they are not a product of the N-ATLaS
model. A native speaker still needs to read them. The banner on those pages
says so. Do not remove it until a review has actually happened.
