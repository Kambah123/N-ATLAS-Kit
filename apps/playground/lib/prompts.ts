import { type AsrLanguage, type ChatLanguage, type ChatMessagePayload } from '@/lib/types';

/** Names used in prompts. Yoruba is unaccented so the instruction stays easy to follow. */
export const PROMPT_LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  ha: 'Hausa',
  ig: 'Igbo',
  yo: 'Yoruba',
  pcm: 'Nigerian Pidgin',
};

export const TRANSLATE_TARGETS: readonly { id: ChatLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ha', label: 'Hausa' },
  { id: 'yo', label: 'Yoruba' },
  { id: 'ig', label: 'Igbo' },
  { id: 'pcm', label: 'Pidgin (beta)' },
];

const LANGUAGE_TOKEN = 'english|hausa|igbo|yoruba|pidgin|naija';

/**
 * A language named in a request ("in English", "translate to Hausa"), not a
 * bare mention ("What is Hausa?"). The last request in the message wins.
 * Accents are stripped first so "Yorùbá" matches "yoruba".
 */
const LANGUAGE_REQUEST = new RegExp(
  `\\b(?:translate(?:\\s+\\w+){0,6}\\s+(?:in|to|into)|(?:reply|respond|answer|write|say)(?:\\s+\\w+){0,4}\\s+in|(?:in|to|into))\\s+(${LANGUAGE_TOKEN})\\b`,
  'gi',
);

export function requestedLanguage(text: string): ChatLanguage | null {
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '');
  let found: ChatLanguage | null = null;
  for (const match of plain.matchAll(LANGUAGE_REQUEST)) {
    const token = (match[1] ?? '').toLowerCase();
    const language = languageFromToken(token);
    if (language) found = language;
  }
  return found;
}

export function defaultTranslateTarget(audio: AsrLanguage): ChatLanguage {
  return audio === 'en' ? 'ha' : 'en';
}

/** The sentence the translate button sends. Pidgin adds a disambiguation line. */
export function translatePrompt(target: ChatLanguage): string {
  const name = PROMPT_LANGUAGE_NAME[target];
  const base = `Translate the following text into ${name}. Output only the translation in ${name}.`;
  if (target !== 'pcm') return base;
  return `${base} Use Nigerian Pidgin English (Naija), NOT Igbo, NOT Yoruba, NOT Hausa.`;
}

/**
 * System text for a reply language. The winning rule is last: Llama-3 follows
 * the end of the system message more reliably than an earlier line written in
 * the target language.
 */
export function systemPrompt(language: ChatLanguage, explicit: boolean): string {
  const name = PROMPT_LANGUAGE_NAME[language];
  const lines = ['You are N-ATLaS, a multilingual assistant for Nigeria.'];
  if (language === 'pcm') {
    lines.push(
      'Nigerian Pidgin English (Naija), NOT Igbo, NOT Yoruba, NOT Hausa.',
      'Example of the style: "Abeg, how you dey? I dey fine."',
    );
  }
  if (explicit) {
    lines.push(
      `The latest user message asks for ${name}. That request always wins. Reply only in ${name}.`,
    );
  } else {
    lines.push(
      `Unless the user explicitly asks for another language, reply in ${name}.`,
      "The user's explicit language request always wins. If they name a language, reply only in that language.",
    );
  }
  return lines.join('\n');
}

/** Spoken replies stay short enough to finish in one breath. */
export const SPOKEN_MAX_TOKENS = 128;

export const PIDGIN_TURN_REMINDER =
  'Reply in Nigerian Pidgin only. Not Igbo, not Yoruba, not Hausa. Example: "Abeg, how you dey? I dey fine."';

export const SPOKEN_TURN_REMINDER =
  'Reply in 2 or 3 short plain sentences. No lists, no markdown, no headings.';

export function replyMaxTokens(requested: number, spoken: boolean): number {
  if (!spoken) return requested;
  return Math.min(requested, SPOKEN_MAX_TOKENS);
}

/**
 * The latest user turn carries the Pidgin reminder. A system line alone loses
 * to earlier Igbo or Yoruba replies still sitting in the history.
 */
export function buildChatTurn(
  hint: ChatLanguage,
  history: readonly { role: 'user' | 'assistant'; content: string }[],
  options?: { spoken?: boolean },
): { language: ChatLanguage; messages: ChatMessagePayload[] } {
  const spoken = options?.spoken === true;
  const visible = history.filter((message) => message.content.trim().length > 0);
  const latest = [...visible].reverse().find((message) => message.role === 'user')?.content ?? '';
  const requested = requestedLanguage(latest);
  const language = requested ?? hint;
  let lastUserSeen = false;
  const messages: ChatMessagePayload[] = [
    { role: 'system', content: spokenSystem(language, requested !== null, spoken) },
  ];
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const message = visible[index];
    if (!message) continue;
    if (!lastUserSeen && message.role === 'user') {
      lastUserSeen = true;
      messages.splice(1, 0, {
        role: 'user',
        content: withTurnReminder(message.content, language, spoken),
      });
      continue;
    }
    messages.splice(1, 0, { role: message.role, content: message.content });
  }
  return { language, messages };
}

function spokenSystem(language: ChatLanguage, explicit: boolean, spoken: boolean): string {
  const base = systemPrompt(language, explicit);
  if (!spoken) return base;
  return `${base}\n${SPOKEN_TURN_REMINDER}`;
}

function withTurnReminder(content: string, language: ChatLanguage, spoken: boolean): string {
  const extra: string[] = [];
  if (language === 'pcm') extra.push(PIDGIN_TURN_REMINDER);
  if (spoken) extra.push(SPOKEN_TURN_REMINDER);
  if (extra.length === 0) return content;
  return `${content}\n\n${extra.join(' ')}`;
}

function languageFromToken(token: string): ChatLanguage | null {
  if (token === 'english') return 'en';
  if (token === 'hausa') return 'ha';
  if (token === 'igbo') return 'ig';
  if (token === 'yoruba') return 'yo';
  if (token === 'pidgin' || token === 'naija') return 'pcm';
  return null;
}
