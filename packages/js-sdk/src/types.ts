import type { Language } from './constants.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Per-call overrides. Timeouts are milliseconds. */
export interface CallOptions {
  /** Cancel the in-flight attempt. Aborted calls are never retried. */
  signal?: AbortSignal;
  /** Milliseconds for this call. Overrides the client timeout. */
  timeout?: number;
  /**
   * How many extra attempts after the first. For chat and transcription this
   * also opts the call into retries; those POSTs are not retried otherwise.
   */
  maxRetries?: number;
}

export interface ChatParams extends CallOptions {
  messages: readonly ChatMessage[];
  /** Logged by the gateway and stripped before vLLM sees the body. */
  language?: string;
  temperature?: number;
  /** Mapped to `max_tokens` on the wire. */
  maxTokens?: number;
  topP?: number;
  /** Defaults to `NCAIR1/N-ATLaS`. Must be an `NCAIR1/` model id. */
  model?: string;
  stop?: string | readonly string[];
  stream?: boolean;
}

export interface ChatResult {
  id: string | null;
  content: string;
  role: 'system' | 'user' | 'assistant';
  finishReason: string | null;
  model: string;
  usage: Usage | null;
  /** The JSON object the gateway returned, unchanged. */
  raw: unknown;
}

export interface ChatStreamChunk {
  /** Text added by this event. Empty when the event only carries a role, finish, or usage. */
  delta: string;
  finishReason: string | null;
  model: string | null;
  usage: Usage | null;
  raw: unknown;
}

/**
 * Bytes, a browser `Blob` / `File`, or a filesystem path.
 * Paths work on Node.js only; browsers should pass a `Blob` or `File`.
 */
export type AudioInput = Blob | ArrayBuffer | ArrayBufferView | string;

export type ResponseFormat = 'json' | 'text' | 'verbose_json';

export interface TranscribeParams extends CallOptions {
  audio: AudioInput;
  /** Required. Selects the NCAIR1 ASR model. Aliases such as `hausa` are accepted. */
  language: string;
  /** Used when `audio` is bytes or a `Blob` without a name. */
  filename?: string;
  responseFormat?: ResponseFormat;
}

export interface Transcription {
  text: string;
  language: Language;
  task: string | null;
  /** Seconds, present when `responseFormat` is `verbose_json`. */
  duration: number | null;
  /** The NCAIR1 ASR repo id, present on `verbose_json`. */
  model: string | null;
  chunks: number | null;
  raw: unknown;
}

export interface ModelInfo {
  id: string;
  object: string | null;
  ownedBy: string | null;
  created: number | null;
}

export interface ModelList {
  data: ModelInfo[];
  raw: unknown;
}

export interface HealthStatus {
  /** `ok` when both upstreams are up, `degraded` when the gateway answered 503. */
  status: string;
  /** True only for a 200 whose status field is `ok`. */
  ok: boolean;
  version: string | null;
  llm: Record<string, unknown> | null;
  asr: Record<string, unknown> | null;
  attribution: string | null;
  raw: unknown;
}

export interface Translation {
  text: string;
  from: Language;
  to: Language;
  model: string;
}

export interface Summary {
  text: string;
  language: Language;
  model: string;
}

export interface LanguageDetection {
  /** `null` when the reply was not one of the four languages. The SDK does not guess. */
  language: Language | null;
  /** The model's reply, before parsing. */
  text: string;
  model: string;
}

export interface VoiceChatParams extends CallOptions {
  audio: AudioInput;
  language: string;
  filename?: string;
  /**
   * Replaces the default "reply in the same language" instruction.
   * The transcript is still sent as the user message.
   */
  instruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface VoiceChatResult {
  transcript: string;
  reply: string;
  language: Language;
  model: string;
}
