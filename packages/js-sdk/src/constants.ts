/**
 * Stable facts about N-ATLaS, verified against the Hugging Face model cards
 * on 2026-09-24.
 *
 * Everything here is descriptive metadata about the real models. The client
 * lives in `client.ts`; these values are what it refuses to drift away from.
 */

/** The four languages N-ATLaS supports, as BCP-47-ish short codes. */
export const LANGUAGES = ['ha', 'ig', 'yo', 'en'] as const;

/** A language code accepted by every N-ATLAS Kit API. */
export type Language = (typeof LANGUAGES)[number];

/** Human-readable names, in English and in the language itself. */
export const LANGUAGE_NAMES: Record<Language, { english: string; native: string }> = {
  ha: { english: 'Hausa', native: 'Hausa' },
  ig: { english: 'Igbo', native: 'Igbo' },
  yo: { english: 'Yoruba', native: 'Yorùbá' },
  en: { english: 'Nigerian English', native: 'Nigerian English' },
};

/**
 * The N-ATLaS text model.
 *
 * `LlamaForCausalLM`, a Llama-3 8B fine-tune. 32 layers, hidden size 4096,
 * 32 attention heads, 8 KV heads, vocab 128,256, BF16.
 *
 * The repo is gated on Hugging Face: accept the terms with an HF account and
 * supply an `HF_TOKEN` before downloading.
 *
 * @see https://huggingface.co/NCAIR1/N-ATLaS
 */
export const LLM_MODEL_ID = 'NCAIR1/N-ATLaS';

/**
 * Context window to plan against.
 *
 * `config.json` reports `max_position_embeddings: 131072`, but the model card
 * states a usable context of 8,092 tokens, so that is what we budget for.
 */
export const LLM_CONTEXT_TOKENS = 8092;

/**
 * The four ASR models, keyed by language.
 *
 * Each is a Whisper Small (244M) fine-tune with a hard 30-second input window,
 * expecting 16 kHz mono audio. Longer audio has to be chunked - `/serve` does
 * that for you. All four repos are gated.
 */
export const ASR_MODEL_IDS: Record<Language, string> = {
  ha: 'NCAIR1/Hausa-ASR',
  ig: 'NCAIR1/Igbo-ASR',
  yo: 'NCAIR1/Yoruba-ASR',
  en: 'NCAIR1/NigerianAccentedEnglish',
};

/** Maximum audio the ASR models accept in a single forward pass, in seconds. */
export const ASR_MAX_SEGMENT_SECONDS = 30;

/** Sample rate the ASR models expect, in Hz. Mono. */
export const ASR_SAMPLE_RATE = 16_000;

/** Backend adapters. `official` is reserved for the NCAIR API once it exists. */
export const BACKENDS = ['openai-compatible', 'hf-endpoint', 'official'] as const;

/** Which backend adapter a client should use. */
export type Backend = (typeof BACKENDS)[number];

/**
 * Attribution required by the N-ATLaS Terms of Use for any public use.
 *
 * Surface this wherever model output is shown to an end user.
 */
export const ATTRIBUTION =
  'N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation ' +
  'and Digital Economy, and powered by Awarri Technologies.';

/** Narrowing helper for untrusted input. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
