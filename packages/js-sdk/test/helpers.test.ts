import { describe, expect, it } from 'vitest';

import { BadRequestError, LLM_MODEL_ID } from '../src/index.js';
import { languageFromModelText } from '../src/languages.js';
import { bodyJson, chatCompletion, harness, jsonResponse, type Call } from './support.js';

function reply(content: string): Response {
  return jsonResponse(200, {
    ...chatCompletion,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
}

async function messagesOf(call: Call): Promise<Array<{ role: string; content: string }>> {
  const body = (await bodyJson(call)) as {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    max_tokens: number;
  };
  expect(body.model).toBe(LLM_MODEL_ID);
  return body.messages;
}

describe('translate, summarize, detectLanguage', () => {
  it('asks N-ATLaS to translate and returns only the reply', async () => {
    const { client, calls } = harness(() => reply('Ẹ káàrọ̀'));
    const result = await client.translate({ text: 'Good morning', from: 'en', to: 'yoruba' });
    expect(result).toMatchObject({ text: 'Ẹ káàrọ̀', from: 'en', to: 'yo', model: LLM_MODEL_ID });
    const messages = await messagesOf(calls[0]!);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Yoruba (yo)');
    expect(messages[0]?.content).toContain('Nigerian English (en)');
    expect(messages[1]).toEqual({ role: 'user', content: 'Good morning' });
    const body = (await bodyJson(calls[0]!)) as { temperature: number; max_tokens: number };
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(1024);
  });

  it('refuses to pretend a same-language translation happened', async () => {
    const { client, calls } = harness(() => reply('unused'));
    await expect(
      client.translate({ text: 'Sannu', from: 'ha', to: 'hausa' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(client.translate({ text: '   ', from: 'en', to: 'ha' })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(calls).toHaveLength(0);
  });

  it('summarises in the requested language', async () => {
    const { client, calls } = harness(() => reply('Nchịkọta.'));
    const result = await client.summarize({
      text: 'A long Igbo article about markets in Onitsha.',
      language: 'ig',
    });
    expect(result).toEqual({ text: 'Nchịkọta.', language: 'ig', model: LLM_MODEL_ID });
    const messages = await messagesOf(calls[0]!);
    expect(messages[0]?.content).toContain('Igbo');
    expect(messages[1]?.content).toContain('Onitsha');
  });

  it('parses a language code and refuses to guess when the reply is not one', async () => {
    const coded = harness(() => reply('ha'));
    await expect(coded.client.detectLanguage('Sannu da safe')).resolves.toMatchObject({
      language: 'ha',
      text: 'ha',
    });

    const wordy = harness(() => reply('The language is Yoruba.'));
    await expect(wordy.client.detectLanguage('Báwo ni?')).resolves.toMatchObject({
      language: 'yo',
    });

    const unsure = harness(() => reply('I am not sure.'));
    const detection = await unsure.client.detectLanguage('???');
    expect(detection.language).toBeNull();
    expect(detection.text).toBe('I am not sure.');

    const { calls } = coded;
    const body = (await bodyJson(calls[0]!)) as { temperature: number; max_tokens: number };
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(16);
  });
});

describe('voiceChat', () => {
  it('transcribes then replies, and keeps both strings', async () => {
    let n = 0;
    const { client, calls } = harness(() => {
      n += 1;
      if (n === 1) return jsonResponse(200, { text: 'sannu da zuwa' });
      return reply('Sannu! Ina lafiya.');
    });
    const result = await client.voiceChat({
      audio: Uint8Array.from([1, 2, 3]),
      language: 'ha',
      filename: 'note.ogg',
      instruction: 'Reply with a short greeting.',
    });
    expect(result).toEqual({
      transcript: 'sannu da zuwa',
      reply: 'Sannu! Ina lafiya.',
      language: 'ha',
      model: LLM_MODEL_ID,
    });
    expect(calls[0]?.url).toContain('/audio/transcriptions');
    expect(calls[1]?.url).toContain('/chat/completions');
    const messages = await messagesOf(calls[1]!);
    expect(messages[0]?.content).toContain('Reply with a short greeting.');
    expect(messages[1]).toEqual({ role: 'user', content: 'sannu da zuwa' });
  });

  it('does not invent a reply when the transcript is empty', async () => {
    const { client, calls } = harness(() => jsonResponse(200, { text: '   ' }));
    await expect(client.voiceChat({ audio: Uint8Array.from([1]), language: 'yo' })).rejects.toThrow(
      /nothing to reply/,
    );
    expect(calls).toHaveLength(1);
  });
});

describe('languageFromModelText', () => {
  it.each([
    ['ha', 'ha'],
    ['Yorùbá.', 'yo'],
    ['This is Nigerian English', 'en'],
    ['igbo', 'ig'],
  ] as const)('reads %j as %s', (text, language) => {
    expect(languageFromModelText(text)).toBe(language);
  });

  it('returns null when the reply names no supported language', () => {
    expect(languageFromModelText('bonjour')).toBeNull();
    expect(languageFromModelText('')).toBeNull();
  });
});
