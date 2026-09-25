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
  it('shows curl, n-atlas, and natlas without embedding a key', () => {
    const snippets = renderSnippets({ kind: 'chat', body: chat });
    for (const source of [snippets.curl, snippets.javascript, snippets.python]) {
      expect(source).toContain(LLM_MODEL_ID);
      expect(source).toContain('Sannu ka?');
      expect(source).toContain('NATLAS_API_KEY');
      expect(source).not.toContain('sk-');
      expect(source).not.toContain('Bearer test-key');
    }
    expect(snippets.javascript).toContain("import { NAtlas } from 'n-atlas'");
    expect(snippets.javascript).toContain('maxTokens: 256');
    expect(snippets.javascript).toContain('language: "ha"');
    expect(snippets.javascript).toContain('chunk.delta');
    expect(snippets.javascript).not.toContain('fetch(');
    expect(snippets.python).toContain('from natlas import NAtlas');
    expect(snippets.python).toContain('max_tokens=256');
    expect(snippets.python).toContain('language="ha"');
    expect(snippets.python).toContain('chunk.delta');
    expect(snippets.python).not.toContain('httpx');
    expect(snippets.curl).toContain('/chat/completions');
    expect(SDK_NOTE).toContain('n-atlas');
    expect(SDK_NOTE).toContain('natlas');
  });

  it('omits pcm from the SDK calls because n-atlas and natlas reject it', () => {
    const snippets = renderSnippets({
      kind: 'chat',
      body: { ...chat, language: 'pcm', stream: false },
    });
    expect(snippets.javascript).not.toContain('language: "pcm"');
    expect(snippets.javascript).toContain('reply.content');
    expect(snippets.javascript).toContain('not an n-atlas language');
    expect(snippets.python).not.toContain('language="pcm"');
    expect(snippets.python).toContain('reply.content');
    expect(snippets.python).toContain('not a natlas language');
    expect(snippets.curl).toContain('"language": "pcm"');
  });

  it('renders an SDK transcription', () => {
    const snippets = renderSnippets({
      kind: 'transcription',
      language: 'yo',
      filename: 'voice-note.ogg',
    });
    expect(snippets.curl).toContain('language=yo');
    expect(snippets.curl).toContain('file=@voice-note.ogg');
    expect(snippets.javascript).toContain('natlas.transcribe');
    expect(snippets.javascript).toContain('language: "yo"');
    expect(snippets.javascript).toContain('heard.text');
    expect(snippets.python).toContain('natlas.transcribe');
    expect(snippets.python).toContain('language="yo"');
    expect(snippets.python).toContain('heard.text');
  });
});
