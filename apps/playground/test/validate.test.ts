import { describe, expect, it } from 'vitest';
import { checkAudio, wavDurationSeconds } from '@/lib/audio';
import { MAX_AUDIO_SECONDS } from '@/lib/limits';
import { LLM_MODEL_ID } from '@/lib/types';
import { validateChatRequest } from '@/lib/validate';

describe('validateChatRequest', () => {
  it('fills the N-ATLaS model and keeps the language hint', () => {
    const raw = JSON.stringify({
      messages: [{ role: 'user', content: 'Sannu' }],
      language: 'ha',
      temperature: 0.4,
      max_tokens: 128,
      stream: true,
    });
    const result = validateChatRequest(JSON.parse(raw), raw.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.model).toBe(LLM_MODEL_ID);
    expect(result.body.language).toBe('ha');
    expect(result.body.messages[0]?.content).toBe('Sannu');
  });

  it('rejects a different model id', () => {
    const raw = JSON.stringify({
      model: 'other/model',
      messages: [{ role: 'user', content: 'Hi' }],
      language: 'en',
    });
    const result = validateChatRequest(JSON.parse(raw), raw.length);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty conversation and an oversized message', () => {
    expect(validateChatRequest({ messages: [] }, 20).ok).toBe(false);
    const huge = {
      messages: [{ role: 'user', content: 'a'.repeat(8_001) }],
      language: 'en',
    };
    expect(validateChatRequest(huge, 20).ok).toBe(false);
  });
});

describe('audio limits', () => {
  it('accepts a short voice note and rejects other files', () => {
    const ogg = checkAudio('voice note.ogg', 'audio/ogg', new Uint8Array([1, 2, 3, 4]));
    expect(ogg.ok).toBe(true);
    if (ogg.ok) expect(ogg.filename).toBe('voicenote.ogg');
    expect(checkAudio('notes.txt', 'text/plain', new Uint8Array([1])).ok).toBe(false);
    expect(checkAudio('empty.wav', 'audio/wav', new Uint8Array()).ok).toBe(false);
  });

  it('rejects a WAV longer than the duration cap', () => {
    const bytes = makeWav(MAX_AUDIO_SECONDS + 5, 1);
    const duration = wavDurationSeconds(bytes);
    expect(duration).toBeGreaterThan(MAX_AUDIO_SECONDS);
    const result = checkAudio('long.wav', 'audio/wav', bytes);
    expect(result.ok).toBe(false);
  });
});

function makeWav(dataBytes: number, byteRate: number): Uint8Array {
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  write(out, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(out, 8, 'WAVE');
  write(out, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 16, true);
  write(out, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return out;
}

function write(bytes: Uint8Array, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}
