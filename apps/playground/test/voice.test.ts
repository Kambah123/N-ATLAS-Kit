import { describe, expect, it } from 'vitest';
import {
  asrLanguageForChat,
  capitalizeTranscript,
  gatePidginNote,
  micErrorMessage,
  missingVoiceNote,
  plainSpeechText,
} from '@/lib/voice';

describe('voice chat language mapping', () => {
  it('sends Pidgin audio to the Nigerian English recognizer', () => {
    expect(asrLanguageForChat('pcm')).toBe('en');
    expect(asrLanguageForChat('ha')).toBe('ha');
    expect(asrLanguageForChat('yo')).toBe('yo');
    expect(asrLanguageForChat('ig')).toBe('ig');
    expect(asrLanguageForChat('en')).toBe('en');
  });

  it('capitalizes a transcript and strips markup before speech', () => {
    expect(capitalizeTranscript('sannu da aiki')).toBe('Sannu da aiki');
    expect(plainSpeechText('**Rice** is ready.\n1. Wash it')).toBe('Rice is ready. Wash it');
  });

  it('shows the Pidgin English-voice note once', () => {
    const note = 'Nigerian Pidgin has no dedicated voice, so this is read in English.';
    const first = gatePidginNote(note, false);
    expect(first.note).toBe(note);
    expect(gatePidginNote(note, first.shown).note).toBeNull();
  });

  it('does not tell the listener to redeploy', () => {
    expect(missingVoiceNote('ig')).toBe("Spoken Igbo isn't available right now.");
    expect(missingVoiceNote('ig')).not.toMatch(/redeploy/i);
  });

  it('explains a blocked microphone', () => {
    expect(micErrorMessage(new DOMException('no', 'NotAllowedError'))).toMatch(/permission/i);
    expect(micErrorMessage(new DOMException('no', 'NotFoundError'))).toMatch(/No microphone/);
  });
});
