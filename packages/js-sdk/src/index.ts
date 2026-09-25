/**
 * `n-atlas` — the JavaScript / TypeScript SDK for N-ATLaS, Nigeria's
 * sovereign multilingual LLM, and its four ASR models.
 *
 * Every inference path talks to `NCAIR1/N-ATLaS` or an `NCAIR1` ASR model.
 * Point {@link NAtlas} at a `/serve` gateway (`NATLAS_BASE_URL` +
 * `NATLAS_API_KEY`). There is no public hosted API, and this package will
 * not call any other vendor's model.
 *
 * @packageDocumentation
 */

export {
  ASR_MAX_SEGMENT_SECONDS,
  ASR_MODEL_IDS,
  ASR_SAMPLE_RATE,
  ATTRIBUTION,
  BACKENDS,
  LANGUAGE_NAMES,
  LANGUAGES,
  LLM_CONTEXT_TOKENS,
  LLM_MODEL_ID,
  isLanguage,
} from './constants.js';

export type { Backend, Language } from './constants.js';

export {
  AbortError,
  AuthError,
  BadRequestError,
  NAtlasError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  isNAtlasError,
} from './errors.js';

export type { ErrorCode, NAtlasErrorOptions } from './errors.js';

export { languageFromModelText, normaliseLanguage } from './languages.js';

export { NAtlas } from './client.js';
export type { NAtlasOptions } from './client.js';

export type {
  AudioInput,
  CallOptions,
  ChatMessage,
  ChatParams,
  ChatResult,
  ChatStreamChunk,
  HealthStatus,
  LanguageDetection,
  ModelInfo,
  ModelList,
  ResponseFormat,
  Summary,
  TranscribeParams,
  Transcription,
  Translation,
  Usage,
  VoiceChatParams,
  VoiceChatResult,
} from './types.js';

export { VERSION } from './version.js';
