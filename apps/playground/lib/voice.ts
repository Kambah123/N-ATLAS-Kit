import { type AsrLanguage, type ChatLanguage } from '@/lib/types';

/** Longest voice-chat utterance. The Speech tab still allows two minutes. */
export const VOICE_CHAT_SECONDS = 30;

const BROWSER_LANG: Record<ChatLanguage, string> = {
  en: 'en-NG',
  ha: 'ha',
  ig: 'ig',
  yo: 'yo',
  pcm: 'en-NG',
};

const LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  ha: 'Hausa',
  ig: 'Igbo',
  yo: 'Yorùbá',
  pcm: 'Nigerian Pidgin',
};

/** Chat languages map onto the four NCAIR1 ASR models. Pidgin shares English. */
export function asrLanguageForChat(language: ChatLanguage): AsrLanguage {
  if (language === 'pcm') return 'en';
  return language;
}

export function browserSpeechLang(language: ChatLanguage): string {
  return BROWSER_LANG[language];
}

export function spokenUnavailable(language: ChatLanguage): string {
  const name = LANGUAGE_NAME[language];
  if (language === 'pcm') return "Spoken Nigerian Pidgin isn't available right now.";
  return `Spoken ${name} isn't available right now.`;
}

export function missingVoiceNote(language: ChatLanguage): string {
  if (language === 'pcm') {
    return "Nigerian Pidgin has no speech voice, and spoken English isn't available right now.";
  }
  return spokenUnavailable(language);
}

export function pidginVoiceNote(): string {
  return 'Nigerian Pidgin has no dedicated voice, so this is read in English.';
}

export function isPidginVoiceNote(note: string): boolean {
  return note.includes('read in English');
}

/** Show the Pidgin English-voice note once per browser session. */
export function gatePidginNote(
  note: string | null,
  alreadyShown: boolean,
): { note: string | null; shown: boolean } {
  if (!note || !isPidginVoiceNote(note)) return { note, shown: alreadyShown };
  if (alreadyShown) return { note: null, shown: true };
  return { note, shown: true };
}

export function capitalizeTranscript(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

/** Markup the model prints should not be read aloud. */
export function plainSpeechText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_]/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function micErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone permission was blocked. Allow the mic for this site in the browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device. You can still type a message.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is in use by another app. Close it, or type a message instead.';
  }
  return 'Could not start the microphone. You can still type a message.';
}
