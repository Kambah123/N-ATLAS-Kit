import { describe, expect, it } from 'vitest';

import { normaliseLanguage } from '../src/languages.js';
import { BadRequestError, LANGUAGES } from '../src/index.js';

describe('normaliseLanguage', () => {
  it.each([
    ['ha', 'ha'],
    ['Hausa', 'ha'],
    ['ha-NG', 'ha'],
    ['igbo', 'ig'],
    ['ibo', 'ig'],
    ['Yorùbá', 'yo'],
    ['yoruba', 'yo'],
    ['en_NG', 'en'],
    ['Naija', 'en'],
    ['Nigerian English', 'en'],
  ] as const)('maps %j to %s', (input, code) => {
    expect(normaliseLanguage(input)).toBe(code);
  });

  it('covers the four canonical codes', () => {
    for (const code of LANGUAGES) expect(normaliseLanguage(code)).toBe(code);
  });

  it.each([null, undefined, 42, '', 'fr', 'sw'])('rejects %j', (value) => {
    expect(() => normaliseLanguage(value)).toThrow(BadRequestError);
  });
});
