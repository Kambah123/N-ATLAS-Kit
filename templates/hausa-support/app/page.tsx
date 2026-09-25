'use client';

import { useState } from 'react';

type Turn = { role: 'user' | 'assistant'; content: string };

export default function Page() {
  const [draft, setDraft] = useState('Na saya kaya jiya. Ina odar na?');
  const [messages, setMessages] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const history = [...messages, { role: 'user' as const, content }];
    setMessages(history);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const payload: unknown = await response.json();
      const reply =
        payload &&
        typeof payload === 'object' &&
        'content' in payload &&
        typeof payload.content === 'string'
          ? payload.content
          : '';
      const failure =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
          ? payload.error
          : '';
      if (!response.ok || !reply) throw new Error(failure || 'No reply.');
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No reply.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <h1>Hausa support</h1>
        <p>A shop assistant that answers in Hausa. The API key stays on the server.</p>
      </header>
      <div className="log">
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            {message.content}
          </p>
        ))}
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <textarea
          value={draft}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Message"
        />
        <button type="submit" disabled={busy || draft.trim().length === 0}>
          {busy ? 'Thinking…' : 'Send'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </form>
      <footer>
        <p>
          N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital
          Economy, and powered by Awarri Technologies.
        </p>
        <p>
          Built by <a href="https://www.onedevstudioo.site/">OneDev Studioo</a>
        </p>
      </footer>
    </main>
  );
}
