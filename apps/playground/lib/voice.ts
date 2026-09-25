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

export function missingVoiceNote(language: ChatLanguage): string {
  const name = LANGUAGE_NAME[language];
  if (language === 'pcm') {
    return 'Nigerian Pidgin has no speech voice, and this browser has no English voice to read it with.';
  }
  if (language === 'en') {
    return 'This browser has no English voice. Tap play again after a Modal redeploy enables gateway speech.';
  }
  return `This device has no ${name} voice. Spoken ${name} needs the gateway speech models. Redeploy Modal, then try again.`;
}

export function pidginVoiceNote(): string {
  return 'Nigerian Pidgin has no dedicated voice, so this is read in English.';
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
