'use client';

import { useState } from 'react';

type AdviceLanguage = 'ha' | 'yo' | 'ig';
type Turn = { role: 'user' | 'assistant'; content: string };

const OPTIONS: { id: AdviceLanguage; label: string }[] = [
  { id: 'ha', label: 'Hausa' },
  { id: 'yo', label: 'Yorùbá' },
  { id: 'ig', label: 'Igbo' },
];

export default function Page() {
  const [language, setLanguage] = useState<AdviceLanguage>('ha');
  const [draft, setDraft] = useState('Tushen shinkafa na yana fari. Me zan yi?');
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
        body: JSON.stringify({ language, messages: history }),
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
        <h1>Farmer advice</h1>
        <p>Ask about crops, pests, and weather. The reply follows the language you pick.</p>
      </header>
      <div className="log">
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            {message.content}
          </p>
        ))}
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as AdviceLanguage)}
          >
            {OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={draft}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Question"
        />
        <button type="submit" disabled={busy || draft.trim().length === 0}>
          {busy ? 'Thinking…' : 'Ask'}
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
