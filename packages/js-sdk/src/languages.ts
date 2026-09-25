/**
 * Loose language tags, matching the aliases the gateway accepts
 * (`serve/natlas_serve/languages.py`). The client normalises these before
 * the request so a typo fails here, with a typed error, instead of as a 400
 * from the ASR service.
 */

import { LANGUAGE_NAMES, type Language } from './constants.js';
import { BadRequestError } from './errors.js';

const ALIASES: Readonly<Record<string, Language>> = {
  ha: 'ha',
  hau: 'ha',
  hausa: 'ha',
  'ha-ng': 'ha',
  ig: 'ig',
  ibo: 'ig',
  igbo: 'ig',
  'ig-ng': 'ig',
  yo: 'yo',
  yor: 'yo',
  yoruba: 'yo',
  yorùbá: 'yo',
  'yo-ng': 'yo',
  en: 'en',
  eng: 'en',
  english: 'en',
  'en-ng': 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'nigerian english': 'en',
  naija: 'en',
};

/** Map loose user input onto `ha` | `ig` | `yo` | `en`, or throw `BadRequestError`. */
export function normaliseLanguage(value: unknown): Language {
  if (typeof value !== 'string') {
    throw new BadRequestError(unsupported(value));
  }
  const key = value.trim().toLowerCase().replaceAll('_', '-');
  const language = ALIASES[key];
  if (!language) {
    throw new BadRequestError(unsupported(value));
  }
  return language;
}

/** Like {@link normaliseLanguage}, but returns `null` instead of throwing. */
export function tryNormaliseLanguage(value: unknown): Language | null {
  try {
    return normaliseLanguage(value);
  } catch (error) {
    if (error instanceof BadRequestError) return null;
    throw error;
  }
}

function unsupported(value: unknown): string {
  const names = (Object.keys(LANGUAGE_NAMES) as Language[])
    .map((code) => `${code} (${LANGUAGE_NAMES[code].english})`)
    .join(', ');
  const shown = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return `Unsupported language ${shown}. N-ATLaS supports: ${names}. Pass one of: ha, ig, yo, en.`;
}

/**
 * Pull a language code out of a short model reply.
 *
 * `detectLanguage` asks N-ATLaS to answer with a bare code. Models sometimes
 * add a word or a full stop anyway, so this accepts `ha`, `Hausa.`, and
 * `The language is Yoruba`. It returns `null` when nothing matches — the
 * helper does not guess.
 */
export function languageFromModelText(text: string): Language | null {
  const trimmed = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, '')
    .trim();
  const exact = tryNormaliseLanguage(trimmed);
  if (exact) return exact;

  const match = trimmed.match(
    /\b(hausa|igbo|yoruba|yorùbá|nigerian english|english|naija|hau|ibo|yor|eng|ha|ig|yo|en)\b/u,
  );
  const token = match?.[0];
  if (!token) return null;
  return tryNormaliseLanguage(token);
}
