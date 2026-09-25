/**
 * Shared voice-note flow. Talks to N-ATLaS only through an injected client.
 * If the gateway env vars are missing, callers stop before createClient runs.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MISSING_BACKEND =
  'No N-ATLAS backend connected. Set NATLAS_BASE_URL and NATLAS_API_KEY. Nothing was sent.\n';

export const ATTRIBUTION =
  'N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.';

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export const USAGE = `Usage:
  node cli.mjs <audio-file> --language <ha|ig|yo|en> --to <ha|ig|yo|en>
  node cli.mjs <audio-file> --language <ha|ig|yo|en> --reply

--language is the language spoken in the file (it selects the ASR model).
--to translates the transcript into another of the four languages.
--reply asks N-ATLaS to answer in the same language.
Aliases such as hausa or yoruba are accepted. Nothing is sent until both
NATLAS_BASE_URL and NATLAS_API_KEY are set.
`;

export function configured(env) {
  return Boolean(text(env.NATLAS_BASE_URL) && text(env.NATLAS_API_KEY));
}

export function isDirectRun(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(entry).href === metaUrl;
}

export class ExampleError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status = 400) {
    super(message);
    this.name = 'ExampleError';
    this.status = status;
    this.code = 'bad_request';
  }
}

/**
 * @param {string[]} argv process.argv
 */
export function parseArgs(argv) {
  /** @type {{ file?: string, language?: string, to?: string, reply: boolean, help: boolean }} */
  const parsed = { reply: false, help: false };
  const positional = [];
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--reply') {
      parsed.reply = true;
    } else if (arg === '--language' || arg === '--to') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new ExampleError(`Missing value for ${arg}.`);
      }
      index += 1;
      if (arg === '--language') parsed.language = value;
      else parsed.to = value;
    } else if (arg.startsWith('--')) {
      throw new ExampleError(`Unknown argument ${arg}.`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new ExampleError('Pass one audio file.');
  }
  if (positional[0]) parsed.file = positional[0];
  return parsed;
}

/**
 * @param {ReturnType<typeof parseArgs>} parsed
 */
export function validateCli(parsed) {
  if (!parsed.file) throw new ExampleError(`Pass an audio file.\n${USAGE}`);
  if (!parsed.language) throw new ExampleError(`Pass --language.\n${USAGE}`);
  if (parsed.reply && parsed.to) {
    throw new ExampleError('Use either --to or --reply, not both.');
  }
  if (!parsed.reply && !parsed.to) {
    throw new ExampleError(`Pass --to <language> or --reply.\n${USAGE}`);
  }
}

/**
 * @param {{ transcribe: Function, translate: Function }} client
 * @param {{ audio: import('node:buffer').Buffer | string, filename?: string, language: string, to: string }} input
 */
export async function translateVoiceNote(client, input) {
  const heard = await client.transcribe({
    audio: input.audio,
    language: input.language,
    ...(input.filename ? { filename: input.filename } : {}),
  });
  const transcript = typeof heard.text === 'string' ? heard.text.trim() : '';
  if (!transcript) {
    throw new ExampleError(
      'The transcription was empty, so there is nothing to translate. Nothing was invented.',
    );
  }
  const translated = await client.translate({
    text: transcript,
    from: input.language,
    to: input.to,
  });
  const text = typeof translated.text === 'string' ? translated.text.trim() : '';
  if (!text) {
    throw new ExampleError('The gateway returned an empty translation. Nothing was invented.');
  }
  return {
    transcript,
    text,
    from: translated.from ?? input.language,
    to: translated.to ?? input.to,
    model: translated.model ?? '',
  };
}

/**
 * @param {{ voiceChat: Function }} client
 * @param {{ audio: import('node:buffer').Buffer | string, filename?: string, language: string }} input
 */
export async function replyToVoiceNote(client, input) {
  const result = await client.voiceChat({
    audio: input.audio,
    language: input.language,
    ...(input.filename ? { filename: input.filename } : {}),
  });
  const transcript = typeof result.transcript === 'string' ? result.transcript.trim() : '';
  const reply = typeof result.reply === 'string' ? result.reply.trim() : '';
  if (!transcript || !reply) {
    throw new ExampleError(
      'The gateway returned an empty transcript or reply. Nothing was invented.',
    );
  }
  return {
    transcript,
    reply,
    language: result.language ?? input.language,
    model: result.model ?? '',
  };
}

/**
 * @param {Record<string, string | undefined>} env
 */
export async function defaultCreateClient(env) {
  const { NAtlas } = await import('n-atlas');
  return new NAtlas({
    baseURL: env.NATLAS_BASE_URL,
    apiKey: env.NATLAS_API_KEY,
  });
}

export function formatTranslation(result) {
  return [
    'transcript:',
    result.transcript,
    '',
    `translation (${result.from} -> ${result.to}):`,
    result.text,
    '',
    `model: ${result.model}`,
    ATTRIBUTION,
    '',
  ].join('\n');
}

export function formatReply(result) {
  return [
    'transcript:',
    result.transcript,
    '',
    'reply:',
    result.reply,
    '',
    `model: ${result.model}`,
    ATTRIBUTION,
    '',
  ].join('\n');
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ createClient?: typeof defaultCreateClient }} [deps]
 */
export async function runCli(argv, env, deps = {}) {
  const createClient = deps.createClient ?? defaultCreateClient;
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    return { code: 2, stdout: '', stderr: `${messageOf(error)}\n${USAGE}` };
  }
  if (parsed.help) return { code: 0, stdout: USAGE, stderr: '' };
  try {
    validateCli(parsed);
  } catch (error) {
    return { code: 2, stdout: '', stderr: `${messageOf(error)}\n` };
  }
  if (!configured(env)) return { code: 1, stdout: '', stderr: MISSING_BACKEND };

  const client = await createClient(env);
  try {
    if (parsed.reply) {
      const result = await replyToVoiceNote(client, {
        audio: /** @type {string} */ (parsed.file),
        language: /** @type {string} */ (parsed.language),
      });
      return { code: 0, stdout: formatReply(result), stderr: '' };
    }
    const result = await translateVoiceNote(client, {
      audio: /** @type {string} */ (parsed.file),
      language: /** @type {string} */ (parsed.language),
      to: /** @type {string} */ (parsed.to),
    });
    return { code: 0, stdout: formatTranslation(result), stderr: '' };
  } catch (error) {
    return { code: 1, stdout: '', stderr: `${messageOf(error)}\n` };
  } finally {
    if (client && typeof client.close === 'function') await client.close();
  }
}

export function safeFilename(filename) {
  if (typeof filename !== 'string' || filename.trim() === '') return 'audio';
  const base = path.basename(filename).replace(/[^\w.-]+/g, '_');
  return base || 'audio';
}

export function decodeAudio(audioBase64) {
  if (typeof audioBase64 !== 'string' || audioBase64.trim() === '') {
    throw new ExampleError('audioBase64 is required.');
  }
  const cleaned = audioBase64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new ExampleError('audioBase64 is not valid base64.');
  }
  const bytes = Buffer.from(cleaned, 'base64');
  if (bytes.length === 0) throw new ExampleError('Audio is empty.');
  if (bytes.length > MAX_AUDIO_BYTES) throw new ExampleError('Audio exceeds 8 MiB.', 413);
  return bytes;
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function messageOf(error) {
  return error instanceof Error ? error.message : 'Request failed.';
}
