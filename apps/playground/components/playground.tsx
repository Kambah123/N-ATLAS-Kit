'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat-panel';
import { ChatSettings } from '@/components/chat-settings';
import { CodePanel } from '@/components/code-panel';
import { SiteFooter } from '@/components/footer';
import { SpeechPanel } from '@/components/speech-panel';
import { StatusPill } from '@/components/status-pill';
import { type HealthView, type LastAction } from '@/components/types';
import { useChat } from '@/components/use-chat';
import { useSlow } from '@/components/use-slow';
import { NOT_CONFIGURED_MESSAGE, WAKING_MESSAGE } from '@/lib/languages';
import { isRecord } from '@/lib/types';

type Tab = 'chat' | 'speech' | 'code';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'speech', label: 'Speech' },
  { id: 'code', label: 'Get code' },
];

export function Playground({ configured }: { configured: boolean }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [action, setAction] = useState<LastAction | null>(null);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [health, setHealth] = useState<HealthView>(
    configured
      ? { status: 'checking', message: 'Checking the gateway…' }
      : { status: 'unconfigured', message: NOT_CONFIGURED_MESSAGE },
  );
  const onAction = useCallback((next: LastAction) => setAction(next), []);
  const chat = useChat({ configured, onAction });
  const speechSlow = useSlow(speechBusy);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const payload: unknown = await response.json().catch(() => null);
        if (cancelled || !isRecord(payload) || typeof payload.status !== 'string') return;
        const status = isHealthStatus(payload.status) ? payload.status : 'offline';
        const message = typeof payload.message === 'string' ? payload.message : 'Status unknown.';
        setHealth({ status, message });
      } catch {
        if (!cancelled)
          setHealth({ status: 'offline', message: 'Could not reach the playground server.' });
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [configured]);

  const shownHealth: HealthView =
    (chat.slow || speechSlow) && health.status !== 'ready'
      ? { status: 'waking', message: WAKING_MESSAGE }
      : health;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="relative overflow-hidden bg-[var(--header)] text-[var(--header-ink)]">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-20" aria-hidden>
          <defs>
            <pattern id="adire" width="28" height="28" patternUnits="userSpaceOnUse">
              <path
                d="M14 2 L26 14 L14 26 L2 14 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.7"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#adire)" />
        </svg>
        <div className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <div className="mr-auto">
            <p className="font-display text-2xl leading-none">
              N-ATLAS <span className="text-[var(--gold-line)]">Playground</span>
            </p>
            <p className="mt-1 text-xs text-[var(--header-muted)]">
              Hausa · Igbo · Yorùbá · Pidgin · English
            </p>
          </div>
          <StatusPill health={shownHealth} />
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs"
          >
            <span className="dark:hidden">Dark</span>
            <span className="hidden dark:inline">Light</span>
          </button>
        </div>
      </header>

      <div className="border-b border-[var(--line)] bg-[var(--bg-elev)] lg:hidden">
        <nav className="flex gap-1 px-3 py-2" aria-label="Playground">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-full px-3 py-2 text-sm ${
                tab === item.id
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--muted)]'
              }`}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-[var(--line)] px-5 py-6 lg:block">
          <nav className="space-y-1" aria-label="Playground">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`block w-full rounded-2xl px-3 py-2 text-left text-sm ${
                  tab === item.id
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'text-[var(--ink)] hover:bg-[var(--bg-sunken)]'
                }`}
                aria-current={tab === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-6">
            {tab === 'chat' ? (
              <ChatSettings
                idPrefix="chat-language-desktop"
                language={chat.language}
                onLanguage={chat.setLanguage}
                temperature={chat.temperature}
                onTemperature={chat.setTemperature}
                maxTokens={chat.maxTokens}
                onMaxTokens={chat.setMaxTokens}
              />
            ) : null}
            {tab === 'speech' ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                Hausa, Igbo, Yorùbá, and Nigerian English each have their own ASR model. A WhatsApp{' '}
                <code>.ogg</code> note is fine.
              </p>
            ) : null}
            {tab === 'code' ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                n-atlas and natlas call the gateway with NATLAS_API_KEY from the environment, the
                same variable this app keeps on the server. Curl is the raw HTTP call.
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setTab('code')}
              className="rounded-2xl border border-[var(--line)] px-3 py-2 text-left text-sm"
            >
              Get code for the last request
            </button>
            {tab === 'chat' ? (
              <button
                type="button"
                onClick={chat.clear}
                className="rounded-2xl px-3 py-2 text-left text-sm text-[var(--muted)]"
              >
                New chat
              </button>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={tab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <div className="flex justify-end gap-2 border-b border-[var(--line)] px-4 py-2 lg:hidden">
              <button
                type="button"
                className="text-sm text-[var(--muted)]"
                onClick={() => setTab('code')}
              >
                Get code
              </button>
              <button type="button" className="text-sm text-[var(--muted)]" onClick={chat.clear}>
                New chat
              </button>
            </div>
            <ChatPanel chat={chat} configured={configured} showMobileSettings />
          </div>
          <div className={tab === 'speech' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <div className="flex justify-end border-b border-[var(--line)] px-4 py-2 lg:hidden">
              <button
                type="button"
                className="text-sm text-[var(--muted)]"
                onClick={() => setTab('code')}
              >
                Get code
              </button>
            </div>
            <SpeechPanel
              configured={configured}
              onReply={(text) => {
                setTab('chat');
                void chat.send(text);
              }}
              onAction={onAction}
              onBusy={setSpeechBusy}
              replyDisabled={chat.busy}
            />
          </div>
          <div className={tab === 'code' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <CodePanel action={action} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    localStorage.setItem('natlas-theme', next);
  } catch {
    /* Private mode can refuse storage. The toggle still applies for this view. */
  }
}

function isHealthStatus(value: string): value is HealthView['status'] {
  return (
    value === 'checking' ||
    value === 'unconfigured' ||
    value === 'ready' ||
    value === 'degraded' ||
    value === 'waking' ||
    value === 'offline'
  );
}
