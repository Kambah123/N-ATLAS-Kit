import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BadRequestError } from '../src/index.js';
import { harness, jsonResponse, textResponse, type Call } from './support.js';

const LANGUAGES = ['ha', 'ig', 'yo', 'en'] as const;

function transcription(text: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse(200, { text, ...extra });
}

async function formFields(
  call: Call,
): Promise<{ language: string; format: string; bytes: number[]; name: string }> {
  if (!(call.body instanceof FormData)) throw new Error('expected multipart body');
  const language = call.body.get('language');
  const format = call.body.get('response_format');
  const file = call.body.get('file');
  if (typeof language !== 'string' || typeof format !== 'string' || !(file instanceof Blob)) {
    throw new Error('multipart fields missing');
  }
  return {
    language,
    format,
    bytes: [...new Uint8Array(await file.arrayBuffer())],
    name: file instanceof File ? file.name : '',
  };
}

describe('transcribe', () => {
  it.each(LANGUAGES)('sends %s audio and returns the transcript', async (language) => {
    const { client, calls } = harness(() => transcription(`text-${language}`));
    const result = await client.transcribe({
      audio: Uint8Array.from([1, 2, 3, 4]),
      language,
      filename: `${language}.ogg`,
    });
    expect(result.text).toBe(`text-${language}`);
    expect(result.language).toBe(language);
    expect(calls[0]?.url).toBe('http://natlas.test/v1/audio/transcriptions');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer test-key');
    expect(calls[0]?.headers.get('content-type')).toBeNull();
    const fields = await formFields(calls[0]!);
    expect(fields.language).toBe(language);
    expect(fields.format).toBe('json');
    expect(fields.bytes).toEqual([1, 2, 3, 4]);
    expect(fields.name).toBe(`${language}.ogg`);
  });

  it('accepts language aliases, Blob, Buffer, ArrayBuffer, and a file path', async () => {
    const bytes = Uint8Array.from([9, 8, 7]);
    const cases: Array<{ audio: Blob | ArrayBuffer | Uint8Array | string; filename?: string }> = [
      { audio: new Blob([bytes], { type: 'audio/ogg' }), filename: 'note.ogg' },
      { audio: Buffer.from(bytes), filename: 'note.mp3' },
      { audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
    ];
    for (const item of cases) {
      const { client, calls } = harness(() => transcription('sannu'));
      const result = await client.transcribe({
        audio: item.audio,
        language: 'hausa',
        ...(item.filename !== undefined ? { filename: item.filename } : {}),
      });
      expect(result.text).toBe('sannu');
      const fields = await formFields(calls[0]!);
      expect(fields.language).toBe('ha');
      expect(fields.bytes).toEqual([9, 8, 7]);
    }

    const dir = await mkdtemp(join(tmpdir(), 'natlas-audio-'));
    const path = join(dir, 'voice.wav');
    await writeFile(path, Buffer.from([4, 5, 6]));
    const fromPath = harness(() => transcription('from-disk'));
    const heard = await fromPath.client.transcribe({ audio: path, language: 'igbo' });
    expect(heard.text).toBe('from-disk');
    const fields = await formFields(fromPath.calls[0]!);
    expect(fields.language).toBe('ig');
    expect(fields.name).toBe('voice.wav');
    expect(fields.bytes).toEqual([4, 5, 6]);
  });

  it('parses verbose_json and plain text', async () => {
    const verbose = harness(() =>
      transcription('sannu', {
        task: 'transcribe',
        language: 'ha',
        duration: 1.5,
        model: 'NCAIR1/Hausa-ASR',
        chunks: 1,
      }),
    );
    const rich = await verbose.client.transcribe({
      audio: Uint8Array.from([1]),
      language: 'ha',
      responseFormat: 'verbose_json',
    });
    expect(rich).toMatchObject({
      text: 'sannu',
      duration: 1.5,
      model: 'NCAIR1/Hausa-ASR',
      chunks: 1,
      task: 'transcribe',
    });
    expect((await formFields(verbose.calls[0]!)).format).toBe('verbose_json');

    const plain = harness(() => textResponse(200, 'just text'));
    const text = await plain.client.transcribe({
      audio: Uint8Array.from([1]),
      language: 'yo',
      responseFormat: 'text',
    });
    expect(text.text).toBe('just text');
    expect(text.duration).toBeNull();
  });

  it('rejects an unsupported language, an empty file, and a bad format without guessing', async () => {
    const { client, calls } = harness(() => transcription('nope'));
    await expect(
      client.transcribe({ audio: Uint8Array.from([1]), language: 'fr' }),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(client.transcribe({ audio: new Uint8Array(), language: 'ha' })).rejects.toThrow(
      /empty/i,
    );
    await expect(
      client.transcribe({
        audio: Uint8Array.from([1]),
        language: 'ha',
        responseFormat: 'srt' as 'json',
      }),
    ).rejects.toThrow(/responseFormat/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces an ASR 400 and does not retry it', async () => {
    const { client, calls } = harness(() =>
      jsonResponse(400, { detail: "Unsupported language 'fr'." }),
    );
    await expect(
      client.transcribe({ audio: Uint8Array.from([1]), language: 'en' }),
    ).rejects.toThrow(/Unsupported language/);
    expect(calls).toHaveLength(1);
  });
});
