import { describe, expect, it } from 'vitest';
import { asrLanguageForChat, micErrorMessage } from '@/lib/voice';

describe('voice chat language mapping', () => {
  it('sends Pidgin audio to the Nigerian English recognizer', () => {
    expect(asrLanguageForChat('pcm')).toBe('en');
    expect(asrLanguageForChat('ha')).toBe('ha');
    expect(asrLanguageForChat('yo')).toBe('yo');
    expect(asrLanguageForChat('ig')).toBe('ig');
    expect(asrLanguageForChat('en')).toBe('en');
  });

  it('explains a blocked microphone', () => {
    expect(micErrorMessage(new DOMException('no', 'NotAllowedError'))).toMatch(/permission/i);
    expect(micErrorMessage(new DOMException('no', 'NotFoundError'))).toMatch(/No microphone/);
  });
});
