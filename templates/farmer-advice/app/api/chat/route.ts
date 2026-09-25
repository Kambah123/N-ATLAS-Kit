import { NAtlas, type Language } from 'n-atlas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANGUAGES = ['ha', 'yo', 'ig'] as const;
type AdviceLanguage = (typeof LANGUAGES)[number];

const NAMES: Record<AdviceLanguage, string> = {
  ha: 'Hausa',
  yo: 'Yoruba',
  ig: 'Igbo',
};

function isAdviceLanguage(value: unknown): value is AdviceLanguage {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

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

  const record = body && typeof body === 'object' ? body : {};
  const language =
    'language' in record && isAdviceLanguage(record.language) ? record.language : null;
  if (!language) {
    return NextResponse.json({ error: 'Pick a language: ha, yo, or ig.' }, { status: 400 });
  }

  const history = turns('messages' in record ? record.messages : null);
  if (history.length === 0 || history[history.length - 1]?.role !== 'user') {
    return NextResponse.json({ error: 'Send at least one user message.' }, { status: 400 });
  }

  const name = NAMES[language];
  const system = [
    'You advise smallholder farmers in Nigeria.',
    `Reply only in ${name}.`,
    'Give practical steps for crops, soil, pests, and weather.',
    'If you are unsure, say so and suggest asking a local extension officer.',
    'Do not invent chemical doses.',
  ].join(' ');

  try {
    const natlas = new NAtlas();
    const reply = await natlas.chat({
      messages: [{ role: 'system', content: system }, ...history],
      language: language as Language,
    });
    return NextResponse.json({ content: reply.content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The gateway could not answer.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
