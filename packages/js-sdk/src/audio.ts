import { BadRequestError } from './errors.js';
import type { AudioInput } from './types.js';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

export function mimeForFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export async function toAudioPart(
  audio: AudioInput,
  filename: string | undefined,
): Promise<{ blob: Blob; filename: string }> {
  if (typeof audio === 'string') {
    return readPath(audio, filename);
  }
  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    const name = filename ?? (audio instanceof File && audio.name ? audio.name : 'audio');
    return { blob: audio, filename: name };
  }
  if (audio instanceof ArrayBuffer) {
    const name = filename ?? 'audio';
    return { blob: new Blob([audio], { type: mimeForFilename(name) }), filename: name };
  }
  if (ArrayBuffer.isView(audio)) {
    const name = filename ?? 'audio';
    const copy = new Uint8Array(audio.byteLength);
    copy.set(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
    return { blob: new Blob([copy], { type: mimeForFilename(name) }), filename: name };
  }
  throw new BadRequestError(
    'audio must be a file path, Blob, File, ArrayBuffer, or typed array of bytes.',
  );
}

async function readPath(
  path: string,
  filename: string | undefined,
): Promise<{ blob: Blob; filename: string }> {
  if (!isNode()) {
    throw new BadRequestError(
      'File paths are only supported on Node.js. In the browser, pass a Blob, File, or bytes.',
    );
  }
  try {
    const fs = await import('node:fs/promises');
    const nodePath = await import('node:path');
    const data = await fs.readFile(path);
    const name = filename ?? nodePath.basename(path);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return { blob: new Blob([copy], { type: mimeForFilename(name) }), filename: name };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    const detail = error instanceof Error ? error.message : 'could not read file';
    throw new BadRequestError(`Could not read audio file: ${detail}`, { cause: error });
  }
}

function isNode(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof proc?.versions?.node === 'string';
}
