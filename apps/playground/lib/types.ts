/** The only LLM this playground is allowed to call. */
export const LLM_MODEL_ID = 'NCAIR1/N-ATLaS' as const;

export const CHAT_LANGUAGES = ['en', 'ha', 'ig', 'yo', 'pcm'] as const;
export const ASR_LANGUAGES = ['ha', 'ig', 'yo', 'en'] as const;

export type ChatLanguage = (typeof CHAT_LANGUAGES)[number];
export type AsrLanguage = (typeof ASR_LANGUAGES)[number];
export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessagePayload = {
  role: ChatRole;
  content: string;
};

/** Body forwarded to POST /v1/chat/completions. */
export type ChatRequestBody = {
  model: typeof LLM_MODEL_ID;
  messages: ChatMessagePayload[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  language: ChatLanguage;
};

export type TranscriptResponse = {
  text: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function isChatLanguage(value: string): value is ChatLanguage {
  return (CHAT_LANGUAGES as readonly string[]).includes(value);
}

export function isAsrLanguage(value: string): value is AsrLanguage {
  return (ASR_LANGUAGES as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
