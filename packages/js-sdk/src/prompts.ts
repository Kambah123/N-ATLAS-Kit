import { LANGUAGE_NAMES, LLM_MODEL_ID, type Language } from './constants.js';
import { BadRequestError } from './errors.js';
import { normaliseLanguage } from './languages.js';
import type { ChatMessage } from './types.js';

/** The only text model this SDK will ask the gateway to run. */
export function assertNcairModel(model: string): void {
  if (!model.startsWith('NCAIR1/')) {
    throw new BadRequestError(
      `Model "${model}" is not an NCAIR1 model. This SDK only calls N-ATLaS and the NCAIR1 ASR models.`,
    );
  }
}

export function englishName(language: Language): string {
  return LANGUAGE_NAMES[language].english;
}

export function translateMessages(
  text: string,
  from: string,
  to: string,
): {
  messages: ChatMessage[];
  source: Language;
  target: Language;
} {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new BadRequestError('text must be a non-empty string.');
  }
  const source = normaliseLanguage(from);
  const target = normaliseLanguage(to);
  if (source === target) {
    throw new BadRequestError('from and to must be different languages.');
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are N-ATLaS, translating between Nigerian languages (Hausa, Igbo, Yoruba, and Nigerian English).\n' +
        `Translate the user's message from ${englishName(source)} (${source}) into ${englishName(target)} (${target}).\n` +
        'Reply with the translation only. Do not add notes, quotes, or the original text.',
    },
    { role: 'user', content: text },
  ];
  return { messages, source, target };
}

export function summarizeMessages(
  text: string,
  language: string,
): {
  messages: ChatMessage[];
  language: Language;
} {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new BadRequestError('text must be a non-empty string.');
  }
  const target = normaliseLanguage(language);
  const name = englishName(target);
  return {
    language: target,
    messages: [
      {
        role: 'system',
        content:
          `You are N-ATLaS. Summarise the user's text in ${name}.\n` +
          `Reply with the summary only, in ${name}. Keep it concise and faithful to the source.`,
      },
      { role: 'user', content: text },
    ],
  };
}

export function detectMessages(text: string): ChatMessage[] {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new BadRequestError('text must be a non-empty string.');
  }
  return [
    {
      role: 'system',
      content:
        'You identify which of these four languages a message is written in: Hausa (ha), Igbo (ig), Yoruba (yo), or Nigerian English (en).\n' +
        'Reply with only one code: ha, ig, yo, or en.',
    },
    { role: 'user', content: text },
  ];
}

export function voiceMessages(
  transcript: string,
  language: Language,
  instruction?: string,
): ChatMessage[] {
  const name = englishName(language);
  const guidance =
    instruction && instruction.trim().length > 0
      ? instruction.trim()
      : `Reply in ${name}, naturally and concisely.`;
  return [
    {
      role: 'system',
      content:
        `You are N-ATLaS, a helpful assistant. The user's message is a transcript of a voice note in ${name}.\n` +
        guidance,
    },
    { role: 'user', content: transcript },
  ];
}

export const DEFAULT_MODEL = LLM_MODEL_ID;
