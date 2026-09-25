/**
 * `n-atlas` - the JavaScript / TypeScript SDK for N-ATLaS, Nigeria's sovereign
 * multilingual LLM.
 *
 * ## Status
 *
 * Scaffold only. This entry point currently exports verified model metadata;
 * the `NAtlas` client, backend adapters, streaming chat, transcription and the
 * language helpers arrive in the next milestone. See the planned-features list
 * in the repository README.
 *
 * ## Design commitments
 *
 * - Every inference path talks to `NCAIR1/N-ATLaS` or an `NCAIR1` ASR model.
 *   No other LLM is ever called.
 * - Zero heavy dependencies; runs on Node 18+, in browsers and on edge runtimes.
 * - Backends are pluggable, so the official NCAIR API can be added in one file.
 *
 * @packageDocumentation
 */

export {
  LANGUAGES,
  LANGUAGE_NAMES,
  LLM_MODEL_ID,
  LLM_CONTEXT_TOKENS,
  ASR_MODEL_IDS,
  ASR_MAX_SEGMENT_SECONDS,
  ASR_SAMPLE_RATE,
  BACKENDS,
  ATTRIBUTION,
  isLanguage,
} from './constants.js';

export type { Language, Backend } from './constants.js';

export { VERSION } from './version.js';
