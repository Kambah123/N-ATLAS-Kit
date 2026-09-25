import { describe, expect, it } from 'vitest';

import {
  ASR_MAX_SEGMENT_SECONDS,
  ASR_MODEL_IDS,
  ASR_SAMPLE_RATE,
  ATTRIBUTION,
  BACKENDS,
  LANGUAGES,
  LANGUAGE_NAMES,
  LLM_CONTEXT_TOKENS,
  LLM_MODEL_ID,
  VERSION,
  isLanguage,
} from '../src/index.js';

describe('model metadata', () => {
  it('points at the real N-ATLaS LLM repo', () => {
    expect(LLM_MODEL_ID).toBe('NCAIR1/N-ATLaS');
  });

  it('budgets the context the model card recommends, not max_position_embeddings', () => {
    expect(LLM_CONTEXT_TOKENS).toBe(8092);
  });

  it('maps every language to its NCAIR1 ASR repo', () => {
    expect(ASR_MODEL_IDS).toEqual({
      ha: 'NCAIR1/Hausa-ASR',
      ig: 'NCAIR1/Igbo-ASR',
      yo: 'NCAIR1/Yoruba-ASR',
      en: 'NCAIR1/NigerianAccentedEnglish',
    });
  });

  it('never references a non-NCAIR1 model', () => {
    const ids = [LLM_MODEL_ID, ...Object.values(ASR_MODEL_IDS)];
    for (const id of ids) {
      expect(id.startsWith('NCAIR1/')).toBe(true);
    }
  });

  it('records the Whisper Small constraints the ASR models impose', () => {
    expect(ASR_MAX_SEGMENT_SECONDS).toBe(30);
    expect(ASR_SAMPLE_RATE).toBe(16_000);
  });

  it('covers all four languages exactly once', () => {
    expect([...LANGUAGES]).toEqual(['ha', 'ig', 'yo', 'en']);
    expect(new Set(LANGUAGES).size).toBe(LANGUAGES.length);
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...LANGUAGES].sort());
    expect(Object.keys(ASR_MODEL_IDS).sort()).toEqual([...LANGUAGES].sort());
  });

  it('exposes the three planned backend adapters', () => {
    expect([...BACKENDS]).toEqual(['openai-compatible', 'hf-endpoint', 'official']);
  });

  it('carries the attribution the N-ATLaS terms require', () => {
    expect(ATTRIBUTION).toContain('Awarri Technologies');
    expect(ATTRIBUTION).toContain('Federal Ministry of Communications');
  });

  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('isLanguage', () => {
  it.each(LANGUAGES)('accepts %s', (lang) => {
    expect(isLanguage(lang)).toBe(true);
  });

  it.each([['fr'], ['HA'], [''], [null], [undefined], [42], [{}]])(
    'rejects %o',
    (value: unknown) => {
      expect(isLanguage(value)).toBe(false);
    },
  );
});
