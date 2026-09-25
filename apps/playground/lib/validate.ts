import {
  MAX_JSON_BYTES,
  MAX_MAX_TOKENS,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_TEMPERATURE,
  MAX_TOTAL_CHARS,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
} from '@/lib/limits';
import {
  LLM_MODEL_ID,
  isChatLanguage,
  isRecord,
  type ChatMessagePayload,
  type ChatRequestBody,
  type ChatRole,
} from '@/lib/types';

export type ValidationResult = { ok: true; body: ChatRequestBody } | { ok: false; message: string };

const ROLES = new Set<ChatRole>(['system', 'user', 'assistant']);

export function validateChatRequest(input: unknown, rawBytes: number): ValidationResult {
  if (rawBytes > MAX_JSON_BYTES) {
    return { ok: false, message: 'That message is too large.' };
  }
  if (!isRecord(input)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, message: 'Add at least one message.' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, message: `Keep the conversation under ${MAX_MESSAGES} messages.` };
  }

  const parsed: ChatMessagePayload[] = [];
  let total = 0;
  let userCount = 0;
  for (const message of messages) {
    if (
      !isRecord(message) ||
      typeof message.role !== 'string' ||
      typeof message.content !== 'string'
    ) {
      return { ok: false, message: 'Each message needs a role and text content.' };
    }
    if (!ROLES.has(message.role as ChatRole)) {
      return { ok: false, message: 'Messages must be system, user, or assistant.' };
    }
    const content = message.content;
    if (content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, message: `Each message must be under ${MAX_MESSAGE_CHARS} characters.` };
    }
    total += content.length;
    if (message.role === 'user' && content.trim().length > 0) userCount += 1;
    parsed.push({ role: message.role as ChatRole, content });
  }
  if (userCount === 0) {
    return { ok: false, message: 'Add a user message.' };
  }
  if (total > MAX_TOTAL_CHARS) {
    return { ok: false, message: `The conversation must be under ${MAX_TOTAL_CHARS} characters.` };
  }

  if (typeof input.language !== 'string' || !isChatLanguage(input.language)) {
    return { ok: false, message: 'Pick a language: English, Hausa, Igbo, Yorùbá, or Pidgin.' };
  }
  if (input.model !== undefined && input.model !== LLM_MODEL_ID) {
    return { ok: false, message: `This playground only calls ${LLM_MODEL_ID}.` };
  }

  const temperature = typeof input.temperature === 'number' ? input.temperature : 0.7;
  const maxTokens = typeof input.max_tokens === 'number' ? input.max_tokens : 512;
  if (
    !Number.isFinite(temperature) ||
    temperature < MIN_TEMPERATURE ||
    temperature > MAX_TEMPERATURE
  ) {
    return {
      ok: false,
      message: `Temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}.`,
    };
  }
  if (!Number.isInteger(maxTokens) || maxTokens < MIN_MAX_TOKENS || maxTokens > MAX_MAX_TOKENS) {
    return {
      ok: false,
      message: `Max tokens must be an integer from ${MIN_MAX_TOKENS} to ${MAX_MAX_TOKENS}.`,
    };
  }

  const stream = input.stream !== false;
  return {
    ok: true,
    body: {
      model: LLM_MODEL_ID,
      messages: parsed,
      temperature,
      max_tokens: maxTokens,
      stream,
      language: input.language,
    },
  };
}
