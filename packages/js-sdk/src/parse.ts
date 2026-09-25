import { LLM_MODEL_ID } from './constants.js';
import { BadRequestError, ServerError } from './errors.js';
import { normaliseLanguage } from './languages.js';
import { assertNcairModel } from './prompts.js';
import type {
  ChatMessage,
  ChatParams,
  ChatResult,
  ChatStreamChunk,
  HealthStatus,
  ModelInfo,
  ModelList,
  ResponseFormat,
  Transcription,
  Usage,
} from './types.js';

const RESPONSE_FORMATS: readonly ResponseFormat[] = ['json', 'text', 'verbose_json'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `Array.isArray` narrows to `any[]`, which strict lint rejects. This keeps `unknown`. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function buildChatBody(params: ChatParams, defaultModel: string): Record<string, unknown> {
  const messages = normaliseMessages(params.messages);
  const model = params.model ?? defaultModel;
  assertNcairModel(model);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: params.stream === true,
  };
  if (params.language !== undefined) body.language = normaliseLanguage(params.language);
  if (params.temperature !== undefined) {
    if (typeof params.temperature !== 'number' || !Number.isFinite(params.temperature)) {
      throw new BadRequestError('temperature must be a finite number.');
    }
    body.temperature = params.temperature;
  }
  if (params.maxTokens !== undefined) {
    if (!Number.isInteger(params.maxTokens) || params.maxTokens < 1) {
      throw new BadRequestError('maxTokens must be a positive integer.');
    }
    body.max_tokens = params.maxTokens;
  }
  if (params.topP !== undefined) {
    if (typeof params.topP !== 'number' || !Number.isFinite(params.topP)) {
      throw new BadRequestError('topP must be a finite number.');
    }
    body.top_p = params.topP;
  }
  if (params.stop !== undefined) {
    if (typeof params.stop === 'string') {
      body.stop = params.stop;
    } else if (
      Array.isArray(params.stop) &&
      params.stop.every((item) => typeof item === 'string')
    ) {
      body.stop = [...params.stop];
    } else {
      throw new BadRequestError('stop must be a string or an array of strings.');
    }
  }
  return body;
}

function normaliseMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BadRequestError('messages must be a non-empty array.');
  }
  return messages.map((message, index) => {
    if (!isRecord(message)) {
      throw new BadRequestError(`messages[${String(index)}] must be an object.`);
    }
    const role = message.role;
    const content = message.content;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new BadRequestError(
        `messages[${String(index)}].role must be "system", "user", or "assistant".`,
      );
    }
    if (typeof content !== 'string' || content.length === 0) {
      throw new BadRequestError(`messages[${String(index)}].content must be a non-empty string.`);
    }
    return { role, content };
  });
}

export function parseChatResult(payload: unknown): ChatResult {
  if (!isRecord(payload)) {
    throw new ServerError('Chat response was not a JSON object.');
  }
  const choices = payload.choices;
  if (!isUnknownArray(choices) || choices.length === 0) {
    throw new ServerError('Chat response did not include any choices.');
  }
  const first = choices[0];
  if (!isRecord(first)) {
    throw new ServerError('Chat response choice was not an object.');
  }
  const message = first.message;
  if (!isRecord(message)) {
    throw new ServerError('Chat response did not include a message.');
  }
  const content = message.content;
  if (content !== null && content !== undefined && typeof content !== 'string') {
    throw new ServerError('Chat message content was not text.');
  }
  const role = message.role;
  return {
    id: typeof payload.id === 'string' ? payload.id : null,
    content: typeof content === 'string' ? content : '',
    role: role === 'system' || role === 'user' || role === 'assistant' ? role : 'assistant',
    finishReason: typeof first.finish_reason === 'string' ? first.finish_reason : null,
    model: typeof payload.model === 'string' ? payload.model : LLM_MODEL_ID,
    usage: parseUsage(payload.usage),
    raw: payload,
  };
}

export function parseChatChunk(payload: unknown): ChatStreamChunk {
  if (!isRecord(payload)) {
    throw new ServerError('Stream event was not a JSON object.');
  }
  const choices = isUnknownArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  let delta = '';
  let finishReason: string | null = null;
  if (isRecord(first)) {
    if (isRecord(first.delta) && typeof first.delta.content === 'string') {
      delta = first.delta.content;
    }
    if (typeof first.finish_reason === 'string') finishReason = first.finish_reason;
  }
  return {
    delta,
    finishReason,
    model: typeof payload.model === 'string' ? payload.model : null,
    usage: parseUsage(payload.usage),
    raw: payload,
  };
}

export function parseUsage(value: unknown): Usage | null {
  if (!isRecord(value)) return null;
  const promptTokens = finiteNumber(value.prompt_tokens);
  const completionTokens = finiteNumber(value.completion_tokens);
  const totalTokens = finiteNumber(value.total_tokens);
  if (promptTokens === null && completionTokens === null && totalTokens === null) return null;
  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  };
}

export function parseModelList(payload: unknown): ModelList {
  if (!isRecord(payload) || !isUnknownArray(payload.data)) {
    throw new ServerError('Model list was not a JSON object with a data array.');
  }
  const data: ModelInfo[] = [];
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    data.push({
      id: item.id,
      object: typeof item.object === 'string' ? item.object : null,
      ownedBy: typeof item.owned_by === 'string' ? item.owned_by : null,
      created: finiteNumber(item.created),
    });
  }
  return { data, raw: payload };
}

export function parseHealth(payload: unknown, statusCode: number): HealthStatus {
  if (!isRecord(payload)) {
    throw new ServerError('Health response was not a JSON object.', { status: statusCode });
  }
  const status =
    typeof payload.status === 'string' ? payload.status : statusCode === 200 ? 'ok' : 'degraded';
  return {
    status,
    ok: statusCode === 200 && status === 'ok',
    version: typeof payload.version === 'string' ? payload.version : null,
    llm: isRecord(payload.llm) ? payload.llm : null,
    asr: isRecord(payload.asr) ? payload.asr : null,
    attribution: typeof payload.attribution === 'string' ? payload.attribution : null,
    raw: payload,
  };
}

export function parseTranscription(
  payload: unknown,
  language: ReturnType<typeof normaliseLanguage>,
): Transcription {
  if (typeof payload === 'string') {
    return {
      text: payload,
      language,
      task: null,
      duration: null,
      model: null,
      chunks: null,
      raw: payload,
    };
  }
  if (!isRecord(payload) || typeof payload.text !== 'string') {
    throw new ServerError('Transcription response did not include text.');
  }
  return {
    text: payload.text,
    language,
    task: typeof payload.task === 'string' ? payload.task : null,
    duration: finiteNumber(payload.duration),
    model: typeof payload.model === 'string' ? payload.model : null,
    chunks: finiteNumber(payload.chunks),
    raw: payload,
  };
}

export function assertResponseFormat(value: string | undefined): ResponseFormat {
  if (value === undefined) return 'json';
  if ((RESPONSE_FORMATS as readonly string[]).includes(value)) return value as ResponseFormat;
  throw new BadRequestError('responseFormat must be "json", "text", or "verbose_json".');
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ServerError('The gateway returned invalid JSON.', {
      cause,
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
  }
}
