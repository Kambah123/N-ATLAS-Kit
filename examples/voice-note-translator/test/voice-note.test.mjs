import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it } from 'node:test';

import {
  configured,
  decodeAudio,
  ExampleError,
  formatTranslation,
  MISSING_BACKEND,
  parseArgs,
  replyToVoiceNote,
  runCli,
  translateVoiceNote,
  validateCli,
} from '../lib.mjs';
import { createServer } from '../server.mjs';

describe('voice-note translator', () => {
  it('does not treat an empty environment as configured', () => {
    assert.equal(configured({}), false);
    assert.equal(configured({ NATLAS_BASE_URL: 'http://localhost:8080' }), false);
    assert.equal(
      configured({ NATLAS_BASE_URL: 'http://localhost:8080', NATLAS_API_KEY: 'k' }),
      true,
    );
  });

  it('parses translate and reply invocations', () => {
    const translated = parseArgs([
      'node',
      'cli.mjs',
      'note.ogg',
      '--language',
      'hausa',
      '--to',
      'en',
    ]);
    assert.equal(translated.file, 'note.ogg');
    assert.equal(translated.language, 'hausa');
    assert.equal(translated.to, 'en');
    assert.equal(translated.reply, false);
    validateCli(translated);

    const reply = parseArgs(['node', 'cli.mjs', '--reply', '--language', 'yo', 'voice.wav']);
    assert.equal(reply.reply, true);
    assert.equal(reply.file, 'voice.wav');
    assert.throws(() => validateCli({ file: 'a.ogg', language: 'ha', reply: false }), ExampleError);
  });

  it('refuses to run when the gateway is not configured', async () => {
    let created = 0;
    const result = await runCli(
      ['node', 'cli.mjs', 'note.ogg', '--language', 'ha', '--to', 'en'],
      {},
      {
        createClient() {
          created += 1;
          throw new Error('should not be called');
        },
      },
    );
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, MISSING_BACKEND);
    assert.equal(created, 0);
  });

  it('transcribes then translates, and skips translation when the transcript is empty', async () => {
    const calls = [];
    const client = {
      async transcribe(params) {
        calls.push(['transcribe', params]);
        return { text: 'Sannu', language: 'ha' };
      },
      async translate(params) {
        calls.push(['translate', params]);
        return { text: 'Hello', from: 'ha', to: 'en', model: 'NCAIR1/N-ATLaS' };
      },
    };
    const result = await translateVoiceNote(client, {
      audio: Buffer.from([1, 2, 3]),
      filename: 'note.ogg',
      language: 'ha',
      to: 'en',
    });
    assert.equal(result.transcript, 'Sannu');
    assert.equal(result.text, 'Hello');
    assert.deepEqual(
      calls.map((call) => call[0]),
      ['transcribe', 'translate'],
    );
    assert.match(formatTranslation(result), /NCAIR1\/N-ATLaS/);

    const empty = {
      async transcribe() {
        return { text: '   ' };
      },
      async translate() {
        throw new Error('translate should not run');
      },
    };
    await assert.rejects(
      () => translateVoiceNote(empty, { audio: Buffer.from([1]), language: 'ha', to: 'en' }),
      /empty/i,
    );
  });

  it('replies through voiceChat', async () => {
    const result = await replyToVoiceNote(
      {
        async voiceChat(params) {
          assert.equal(params.language, 'ig');
          return {
            transcript: 'Kedu',
            reply: 'Ọ dị mma',
            language: 'ig',
            model: 'NCAIR1/N-ATLaS',
          };
        },
      },
      { audio: 'note.ogg', language: 'ig' },
    );
    assert.equal(result.reply, 'Ọ dị mma');
  });

  it('serves the unconfigured page and does not open a client', async () => {
    let created = 0;
    const server = createServer({
      env: {},
      createClient() {
        created += 1;
        throw new Error('should not be called');
      },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /No N-ATLAS backend connected/);
    assert.match(html, /powered by Awarri Technologies/);
    const denied = await fetch(`${base}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
        language: 'ha',
        mode: 'translate',
        to: 'en',
      }),
    });
    assert.equal(denied.status, 503);
    const body = await denied.json();
    assert.match(body.error, /No N-ATLAS backend connected/);
    assert.equal(created, 0);
    server.close();
  });

  it('returns the client result when configured, and rejects bad audio first', async () => {
    let created = 0;
    const server = createServer({
      env: { NATLAS_BASE_URL: 'http://natlas.test', NATLAS_API_KEY: 'test-key' },
      async createClient() {
        created += 1;
        return {
          async transcribe() {
            return { text: 'Sannu' };
          },
          async translate() {
            return { text: 'Hello', from: 'ha', to: 'en', model: 'NCAIR1/N-ATLaS' };
          },
        };
      },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const bad = await fetch(`${base}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audioBase64: '!!!!', language: 'ha', mode: 'translate', to: 'en' }),
    });
    assert.equal(bad.status, 400);
    assert.equal(created, 0);

    const ok = await fetch(`${base}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioBase64: Buffer.from([9, 8, 7]).toString('base64'),
        filename: 'note.ogg',
        language: 'ha',
        mode: 'translate',
        to: 'en',
      }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.transcript, 'Sannu');
    assert.equal(body.output, 'Hello');
    assert.equal(body.model, 'NCAIR1/N-ATLaS');
    assert.equal(created, 1);
    server.close();
  });
});

describe('decodeAudio', () => {
  it('round-trips bytes and rejects garbage', () => {
    const bytes = decodeAudio(Buffer.from([1, 2, 3, 4]).toString('base64'));
    assert.deepEqual([...bytes], [1, 2, 3, 4]);
    assert.throws(() => decodeAudio('not base64!!!'), ExampleError);
    assert.throws(() => decodeAudio(''), ExampleError);
  });
});
