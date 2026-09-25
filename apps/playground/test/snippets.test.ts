import { describe, expect, it } from 'vitest';
import { renderSnippets, SDK_NOTE } from '@/lib/snippets';
import { LLM_MODEL_ID, type ChatRequestBody } from '@/lib/types';

const chat: ChatRequestBody = {
  model: LLM_MODEL_ID,
  messages: [
    { role: 'system', content: 'Reply in Hausa.' },
    { role: 'user', content: 'Sannu ka?' },
  ],
  temperature: 0.7,
  max_tokens: 256,
  stream: true,
  language: 'ha',
};

describe('renderSnippets', () => {
  it('shows curl, fetch, and httpx without embedding a key', () => {
    const snippets = renderSnippets({ kind: 'chat', body: chat });
    for (const source of [snippets.curl, snippets.javascript, snippets.python]) {
      expect(source).toContain(LLM_MODEL_ID);
      expect(source).toContain('Sannu ka?');
      expect(source).toContain('NATLAS_API_KEY');
      expect(source).not.toContain('sk-');
      expect(source).not.toContain('Bearer test-key');
    }
    expect(snippets.javascript).toContain('fetch');
    expect(snippets.python).toContain('httpx');
    expect(snippets.curl).toContain('/chat/completions');
    expect(SDK_NOTE).toContain('n-atlas-kit');
  });

  it('renders a multipart transcription', () => {
    const snippets = renderSnippets({
      kind: 'transcription',
      language: 'yo',
      filename: 'voice-note.ogg',
    });
    expect(snippets.curl).toContain('language=yo');
    expect(snippets.curl).toContain('file=@voice-note.ogg');
    expect(snippets.python).toContain('httpx.post');
    expect(snippets.javascript).toContain('FormData');
  });
});
