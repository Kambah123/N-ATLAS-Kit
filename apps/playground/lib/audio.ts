import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '@/lib/limits';

const EXTENSIONS = new Set(['ogg', 'opus', 'mp3', 'm4a', 'mp4', 'wav', 'webm', 'flac']);

const MIME_TO_KIND: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'video/mp4': 'm4a',
};

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'audio';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'audio';
}

export function audioKind(filename: string, mime: string): string | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext && EXTENSIONS.has(ext) && filename.includes('.')) return ext;
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return MIME_TO_KIND[normalized] ?? null;
}

/**
 * Duration of a PCM WAV, from the fmt byte rate and the data chunk that is
 * actually present. Returns null when the bytes are not a WAV we understand.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readTag(bytes, 0) !== 'RIFF' || readTag(bytes, 8) !== 'WAVE') return null;

  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.byteLength) {
    const tag = readTag(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (tag === 'fmt ' && size >= 16 && dataStart + 12 <= bytes.byteLength) {
      byteRate = view.getUint32(dataStart + 8, true);
    }
    if (tag === 'data') {
      dataBytes = Math.min(size, Math.max(0, bytes.byteLength - dataStart));
      break;
    }
    const step = 8 + size + (size % 2);
    if (step <= 0) break;
    offset += step;
  }
  if (byteRate <= 0 || dataBytes <= 0) return null;
  return dataBytes / byteRate;
}

function readTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

export type AudioCheck =
  { ok: true; filename: string; kind: string } | { ok: false; message: string };

export function checkAudio(filename: string, mime: string, bytes: Uint8Array): AudioCheck {
  if (bytes.byteLength === 0) {
    return { ok: false, message: 'That file is empty.' };
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      message: `Audio must be under ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
    };
  }
  const safe = safeFilename(filename);
  const kind = audioKind(safe, mime) ?? audioKind(filename, mime);
  if (!kind) {
    return {
      ok: false,
      message: 'Upload an .ogg, .mp3, .m4a, or .wav file. Recordings may also be .webm.',
    };
  }
  if (kind === 'wav') {
    const duration = wavDurationSeconds(bytes);
    if (duration !== null && duration > MAX_AUDIO_SECONDS + 0.05) {
      return {
        ok: false,
        message: `Audio must be ${MAX_AUDIO_SECONDS / 60} minutes or shorter.`,
      };
    }
  }
  const storedName = safe.includes('.') ? safe : `${safe}.${kind}`;
  return { ok: true, filename: storedName, kind };
}
