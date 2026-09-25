import { toAudioPart } from './audio.js';
import { requireRetries, requireTimeout, resolveConfig, type ConfigInput } from './config.js';
import { BadRequestError, NetworkError, NAtlasError } from './errors.js';
import { defaultSleep, HttpClient, type FetchLike, type HttpRequest, type Sleep } from './http.js';
import { languageFromModelText, normaliseLanguage } from './languages.js';
import {
  assertResponseFormat,
  buildChatBody,
  parseChatChunk,
  parseChatResult,
  parseHealth,
  parseModelList,
  parseTranscription,
  readJson,
} from './parse.js';
import { detectMessages, summarizeMessages, translateMessages, voiceMessages } from './prompts.js';
import { readSseJson } from './sse.js';
import type {
  CallOptions,
  ChatParams,
  ChatResult,
  ChatStreamChunk,
  HealthStatus,
  LanguageDetection,
  ModelList,
  Summary,
  TranscribeParams,
  Transcription,
  Translation,
  VoiceChatParams,
  VoiceChatResult,
} from './types.js';
import { VERSION } from './version.js';

export interface NAtlasOptions extends ConfigInput {
  /** Override `fetch`. Tests use this; browsers and Node 18+ use the global. */
  fetch?: FetchLike;
  /** Override the retry delay. Tests use this to avoid waiting. */
  sleep?: Sleep;
  /** Source of retry jitter, in `[0, 1)`. */
  random?: () => number;
}

/**
 * Client for an N-ATLaS gateway (`/serve`) or any OpenAI-compatible
 * endpoint that serves `NCAIR1/N-ATLaS`.
 *
 * ```ts
 * const natlas = new NAtlas();
 * const reply = await natlas.chat({
 *   messages: [{ role: 'user', content: 'Sannu!' }],
 *   language: 'ha',
 * });
 * ```
 *
 * `baseURL` and `apiKey` fall back to `NATLAS_BASE_URL` and `NATLAS_API_KEY`.
 */
export class NAtlas {
  private readonly http: HttpClient;
  private readonly apiBase: string;
  private readonly healthUrl: string;
  private readonly model: string;

  constructor(options: NAtlasOptions = {}) {
    const config = resolveConfig(options);
    this.apiBase = config.apiBase;
    this.healthUrl = config.healthUrl;
    this.model = config.model;
    this.http = new HttpClient({
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      retryNonIdempotent: config.retryNonIdempotent,
      fetch: options.fetch ?? defaultFetch(),
      sleep: options.sleep ?? defaultSleep,
      random: options.random ?? (() => Math.random()),
      userAgent: `n-atlas/${VERSION}`,
    });
  }

  /**
   * Chat with N-ATLaS.
   *
   * When `stream` is true, the promise resolves to an async iterable of
   * deltas once the gateway has accepted the request. HTTP errors are
   * thrown by that promise, before iteration starts.
   */
  async chat(params: ChatParams & { stream: true }): Promise<AsyncIterable<ChatStreamChunk>>;
  async chat(params: ChatParams & { stream?: false | undefined }): Promise<ChatResult>;
  async chat(params: ChatParams): Promise<ChatResult | AsyncIterable<ChatStreamChunk>>;
  async chat(params: ChatParams): Promise<ChatResult | AsyncIterable<ChatStreamChunk>> {
    if (params.stream === true) return this.openStream(params);
    return this.complete(params);
  }

  /** `GET /v1/models`. */
  async listModels(options: CallOptions = {}): Promise<ModelList> {
    const response = await this.http.send(
      request(
        {
          method: 'GET',
          url: `${this.apiBase}/models`,
          idempotent: true,
        },
        options,
      ),
    );
    return parseModelList(await readJson(response));
  }

  /**
   * `GET /health`. No API key is required.
   *
   * A degraded gateway answers 503 with a JSON body. That is returned, with
   * `ok: false`, rather than thrown — the body is the health report.
   */
  async health(options: CallOptions = {}): Promise<HealthStatus> {
    const response = await this.http.send(
      request(
        {
          method: 'GET',
          url: this.healthUrl,
          idempotent: true,
          acceptStatuses: [503],
        },
        options,
      ),
    );
    return parseHealth(await readJson(response), response.status);
  }

  /**
   * Transcribe audio with the NCAIR1 ASR model for `language`.
   * `language` is required: each checkpoint is monolingual.
   */
  async transcribe(params: TranscribeParams): Promise<Transcription> {
    const language = normaliseLanguage(params.language);
    const responseFormat = assertResponseFormat(params.responseFormat);
    const part = await toAudioPart(params.audio, params.filename);
    if (part.blob.size === 0) {
      throw new BadRequestError('Audio is empty.');
    }
    const form = new FormData();
    form.append('file', part.blob, part.filename);
    form.append('language', language);
    form.append('response_format', responseFormat);
    const response = await this.http.send(
      request(
        {
          method: 'POST',
          url: `${this.apiBase}/audio/transcriptions`,
          idempotent: false,
          body: form,
        },
        params,
      ),
    );
    if (responseFormat === 'text') {
      return parseTranscription(await response.text(), language);
    }
    return parseTranscription(await readJson(response), language);
  }

  /** Translate between Hausa, Igbo, Yoruba, and Nigerian English via N-ATLaS. */
  async translate(
    params: CallOptions & {
      text: string;
      from: string;
      to: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<Translation> {
    const built = translateMessages(params.text, params.from, params.to);
    const result = await this.complete({
      messages: built.messages,
      language: built.target,
      temperature: params.temperature ?? 0.2,
      maxTokens: params.maxTokens ?? 1024,
      ...callOptions(params),
    });
    return {
      text: result.content.trim(),
      from: built.source,
      to: built.target,
      model: result.model,
    };
  }

  /** Summarise text in one of the four languages. The summary is the model's, not a local stub. */
  async summarize(
    params: CallOptions & {
      text: string;
      language: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<Summary> {
    const built = summarizeMessages(params.text, params.language);
    const result = await this.complete({
      messages: built.messages,
      language: built.language,
      temperature: params.temperature ?? 0.3,
      maxTokens: params.maxTokens ?? 512,
      ...callOptions(params),
    });
    return { text: result.content.trim(), language: built.language, model: result.model };
  }

  /**
   * Ask N-ATLaS which of the four languages `text` is in.
   * This is a prompt, not a dedicated detector. `language` is `null` when
   * the reply is not a recognised code.
   */
  async detectLanguage(text: string, options: CallOptions = {}): Promise<LanguageDetection> {
    const result = await this.complete({
      messages: detectMessages(text),
      temperature: 0,
      maxTokens: 16,
      ...callOptions(options),
    });
    return {
      language: languageFromModelText(result.content),
      text: result.content.trim(),
      model: result.model,
    };
  }

  /**
   * Transcribe a voice note, then ask N-ATLaS to reply.
   * Returns both strings. An empty transcript is an error — nothing is invented.
   */
  async voiceChat(params: VoiceChatParams): Promise<VoiceChatResult> {
    const language = normaliseLanguage(params.language);
    const heard = await this.transcribe({
      audio: params.audio,
      language,
      responseFormat: 'json',
      ...callOptions(params),
      ...optionalFilename(params.filename),
    });
    if (heard.text.trim().length === 0) {
      throw new BadRequestError('The transcription was empty, so there is nothing to reply to.');
    }
    const reply = await this.complete({
      messages: voiceMessages(heard.text, language, params.instruction),
      language,
      temperature: params.temperature ?? 0.3,
      maxTokens: params.maxTokens ?? 512,
      ...callOptions(params),
    });
    return {
      transcript: heard.text,
      reply: reply.content.trim(),
      language,
      model: reply.model,
    };
  }

  private async complete(params: ChatParams): Promise<ChatResult> {
    const response = await this.http.send(
      request(
        {
          method: 'POST',
          url: `${this.apiBase}/chat/completions`,
          idempotent: false,
          json: buildChatBody({ ...params, stream: false }, this.model),
        },
        params,
      ),
    );
    return parseChatResult(await readJson(response));
  }

  private async openStream(params: ChatParams): Promise<AsyncIterable<ChatStreamChunk>> {
    const response = await this.http.send(
      request(
        {
          method: 'POST',
          url: `${this.apiBase}/chat/completions`,
          idempotent: false,
          accept: 'text/event-stream',
          json: buildChatBody({ ...params, stream: true }, this.model),
        },
        params,
      ),
    );
    return iterateChat(response);
  }
}

function request(base: HttpRequest, options: CallOptions): HttpRequest {
  const next: HttpRequest = { ...base };
  if (options.signal) next.signal = options.signal;
  if (options.timeout !== undefined) {
    next.timeoutMs = requireTimeout(options.timeout, 'timeout');
  }
  if (options.maxRetries !== undefined) {
    next.maxRetries = requireRetries(options.maxRetries, 'maxRetries');
  }
  return next;
}

function callOptions(options: CallOptions): CallOptions {
  const next: CallOptions = {};
  if (options.signal) next.signal = options.signal;
  if (options.timeout !== undefined) next.timeout = options.timeout;
  if (options.maxRetries !== undefined) next.maxRetries = options.maxRetries;
  return next;
}

function optionalFilename(filename: string | undefined): { filename?: string } {
  if (filename === undefined) return {};
  return { filename };
}

async function* iterateChat(response: Response): AsyncGenerator<ChatStreamChunk> {
  if (!response.body) {
    throw new NetworkError('The chat stream had no body.');
  }
  for await (const event of readSseJson(response.body)) {
    yield parseChatChunk(event);
  }
}

function defaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new NAtlasError('This runtime has no fetch. Use Node 18+ or a modern browser.');
  }
  return (input, init) => globalThis.fetch(input, init);
}
