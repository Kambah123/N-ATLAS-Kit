import { NAtlas } from 'n-atlas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = [
  'You are a customer-support assistant for a small Nigerian shop.',
  'Reply only in Hausa.',
  'Be short and polite.',
  'If you do not have the order, price, or tracking record, say so.',
  'Do not invent numbers.',
].join(' ');

type Turn = { role: 'user' | 'assistant'; content: string };

function turns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  const kept: Turn[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const role = 'role' in item ? item.role : null;
    const content = 'content' in item ? item.content : null;
    if (
      (role === 'user' || role === 'assistant') &&
      typeof content === 'string' &&
      content.trim()
    ) {
      kept.push({ role, content: content.trim().slice(0, 2000) });
    }
  }
  return kept.slice(-12);
}

export async function POST(request: Request) {
  if (!process.env.NATLAS_API_KEY || !process.env.NATLAS_BASE_URL) {
    return NextResponse.json(
      { error: 'Set NATLAS_API_KEY and NATLAS_BASE_URL on the server.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const history = turns(
    body && typeof body === 'object' && 'messages' in body ? body.messages : null,
  );
  if (history.length === 0 || history[history.length - 1]?.role !== 'user') {
    return NextResponse.json({ error: 'Send at least one user message.' }, { status: 400 });
  }

  try {
    const natlas = new NAtlas();
    const reply = await natlas.chat({
      messages: [{ role: 'system', content: SYSTEM }, ...history],
      language: 'ha',
    });
    return NextResponse.json({ content: reply.content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The gateway could not answer.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
