import { describe, expect, it } from 'vitest';
import { CHAT_LANGUAGE_OPTIONS } from '@/lib/languages';
import {
  TRANSLATE_TARGETS,
  buildChatTurn,
  defaultTranslateTarget,
  replyMaxTokens,
  requestedLanguage,
  systemPrompt,
  translatePrompt,
} from '@/lib/prompts';

describe('requestedLanguage', () => {
  it('hears an explicit English request and ignores a bare language mention', () => {
    expect(requestedLanguage('Translate that to English in 3 short lines')).toBe('en');
    expect(requestedLanguage('What is Hausa?')).toBeNull();
    expect(requestedLanguage('Abeg explain am in Pidgin')).toBe('pcm');
    expect(requestedLanguage('Reply in Yorùbá')).toBe('yo');
  });

  it('lets the last requested language win', () => {
    expect(requestedLanguage('Translate that to Hausa, then into English')).toBe('en');
  });
});

describe('buildChatTurn', () => {
  it('uses the requested language for that turn instead of the Hausa hint', () => {
    const turn = buildChatTurn('ha', [
      { role: 'user', content: 'Translate that to English in 3 short lines' },
    ]);
    expect(turn.language).toBe('en');
    const system = turn.messages[0]?.content ?? '';
    expect(system).toContain('That request always wins');
    expect(system).toContain('Reply only in English');
    expect(system).not.toMatch(/reply in Hausa/i);
  });

  it('keeps the hint when the user does not name a language', () => {
    const turn = buildChatTurn('ha', [{ role: 'user', content: 'Sannu' }]);
    expect(turn.language).toBe('ha');
    const system = turn.messages[0]?.content ?? '';
    expect(system).toContain('reply in Hausa');
    expect(system).toContain("The user's explicit language request always wins");
  });
});

describe('spoken replies and Pidgin turns', () => {
  it('pins Nigerian Pidgin to the latest user turn, not an earlier Igbo reply', () => {
    const turn = buildChatTurn('pcm', [
      { role: 'user', content: 'Kedu' },
      { role: 'assistant', content: 'Adị m mma' },
      { role: 'user', content: 'How far' },
    ]);
    expect(turn.language).toBe('pcm');
    expect(turn.messages[1]?.content).toBe('Kedu');
    const latest = turn.messages[turn.messages.length - 1]?.content ?? '';
    expect(latest.startsWith('How far')).toBe(true);
    expect(latest).toContain('Reply in Nigerian Pidgin only');
    expect(latest).toContain('Abeg, how you dey? I dey fine.');
    expect(latest).toContain('Not Igbo');
  });

  it('asks for a short plain reply when the turn will be spoken', () => {
    const turn = buildChatTurn('yo', [{ role: 'user', content: 'Bawo' }], { spoken: true });
    const latest = turn.messages[turn.messages.length - 1]?.content ?? '';
    const system = turn.messages[0]?.content ?? '';
    expect(latest).toContain('2 or 3 short plain sentences');
    expect(latest).toContain('No lists, no markdown');
    expect(system).toContain('2 or 3 short plain sentences');
    expect(replyMaxTokens(512, true)).toBe(128);
    expect(replyMaxTokens(64, true)).toBe(64);
    expect(replyMaxTokens(512, false)).toBe(512);
  });
});

describe('Pidgin system prompt', () => {
  it('names Nigerian Pidgin and rules out the other languages', () => {
    const system = systemPrompt('pcm', false);
    expect(system).toContain('Nigerian Pidgin English (Naija), NOT Igbo, NOT Yoruba, NOT Hausa');
    expect(system).toContain('Abeg, how you dey? I dey fine.');
    expect(system).toContain("The user's explicit language request always wins");
    expect(CHAT_LANGUAGE_OPTIONS.find((option) => option.id === 'pcm')?.label).toBe(
      'Pidgin (beta)',
    );
    expect(TRANSLATE_TARGETS.find((option) => option.id === 'pcm')?.label).toBe('Pidgin (beta)');
  });
});

describe('translate target', () => {
  it('defaults to English, or Hausa when the audio is English', () => {
    expect(defaultTranslateTarget('ha')).toBe('en');
    expect(defaultTranslateTarget('ig')).toBe('en');
    expect(defaultTranslateTarget('yo')).toBe('en');
    expect(defaultTranslateTarget('en')).toBe('ha');
  });

  it('asks for only the selected language', () => {
    expect(translatePrompt('en')).toBe(
      'Translate the following text into English. Output only the translation in English.',
    );
    expect(translatePrompt('ha')).toBe(
      'Translate the following text into Hausa. Output only the translation in Hausa.',
    );
    expect(translatePrompt('yo')).toContain('into Yoruba');
    expect(translatePrompt('pcm')).toContain('NOT Igbo, NOT Yoruba, NOT Hausa');
  });
});
