import { isRecord } from '@/lib/types';

export function takeSseData(buffer: string): { data: string[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');
  const rest = lines.pop() ?? '';
  const data: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    data.push(trimmed.slice(5).trim());
  }
  return { data, rest };
}

export function deltaFromEvent(data: string): string {
  if (!data || data === '[DONE]') return '';
  try {
    const parsed: unknown = JSON.parse(data);
    const choice = firstRecord(isRecord(parsed) ? parsed.choices : undefined);
    if (!choice) return '';
    const delta = choice.delta;
    if (isRecord(delta) && typeof delta.content === 'string') return delta.content;
    return '';
  } catch {
    return '';
  }
}

export function messageFromCompletion(payload: unknown): string {
  const choice = firstRecord(isRecord(payload) ? payload.choices : undefined);
  if (!choice) return '';
  const message = choice.message;
  if (!isRecord(message) || typeof message.content !== 'string') return '';
  return message.content;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  const list = unknownList(value);
  const first = list[0];
  return isRecord(first) ? first : null;
}

function unknownList(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  const list: unknown[] = [];
  for (const item of value) list.push(item as unknown);
  return list;
}

export function errorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const error = payload.error;
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
