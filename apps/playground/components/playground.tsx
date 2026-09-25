'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat-panel';
import { LanguageField } from '@/components/chat-settings';
import { CodePanel } from '@/components/code-panel';
import { SiteFooter } from '@/components/footer';
import {
  IconChat,
  IconCode,
  IconDocs,
  IconGitHub,
  IconMic,
  IconMoon,
  IconSun,
  IconX,
  Mark,
} from '@/components/icons';
import { SpeechPanel } from '@/components/speech-panel';
import { StatusPill } from '@/components/status-pill';
import { type HealthView, type LastAction } from '@/components/types';
import { useChat } from '@/components/use-chat';
import { useSlow } from '@/components/use-slow';
import { NOT_CONFIGURED_MESSAGE, WAKING_MESSAGE } from '@/lib/languages';
import { isRecord, LLM_MODEL_ID } from '@/lib/types';

type Tab = 'chat' | 'speech' | 'code';

const DOCS_HREF = 'https://natlas-docs.vercel.app';
const GITHUB_HREF = 'https://github.com/Kambah123/N-ATLAS-Kit';
const X_HREF = 'https://x.com/0xSkamber';

const TABS: { id: Tab; label: string; icon: typeof IconChat }[] = [
  { id: 'chat', label: 'Chat', icon: IconChat },
  { id: 'speech', label: 'Speech', icon: IconMic },
  { id: 'code', label: 'Get code', icon: IconCode },
];

export function Playground({ configured }: { configured: boolean }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [action, setAction] = useState<LastAction | null>(null);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [uploadRequest, setUploadRequest] = useState(0);
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

  const focusCode = useCallback(() => {
    const wide = window.matchMedia('(min-width: 1280px)').matches;
    if (wide && tab !== 'code') {
      document.getElementById('live-code')?.focus();
      return;
    }
    setTab('code');
  }, [tab]);

  const openSpeech = useCallback(() => setTab('speech'), []);
  const attachAudio = useCallback(() => {
    setTab('speech');
    setUploadRequest((value) => value + 1);
  }, []);

  const codeBeside = tab !== 'code';

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <header className="relative shrink-0 overflow-hidden border-b border-black/20 bg-[var(--header)] text-[var(--header-ink)]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-[var(--gold-line)] opacity-30"
          aria-hidden
        >
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
        <div className="relative flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <div className="flex shrink-0 items-center gap-2">
            <Mark />
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[var(--header-ink)]">
                N-ATLAS <span className="text-[var(--gold-line)]">Playground</span>
              </h1>
              <p className="font-mono text-[10px] text-[var(--header-muted)] md:hidden">
                {LLM_MODEL_ID}
              </p>
            </div>
          </div>
          <p className="hidden rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[11px] text-[var(--header-ink)] md:inline">
            {LLM_MODEL_ID}
          </p>
          <StatusPill health={shownHealth} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <LanguageField language={chat.language} onLanguage={chat.setLanguage} />
            <button
              type="button"
              onClick={toggleTheme}
              className="header-control rounded-xl border border-white/20 p-2 text-[var(--header-ink)]"
              aria-label="Toggle color theme"
            >
              <IconMoon className="h-4 w-4 dark:hidden" />
              <IconSun className="hidden h-4 w-4 dark:block" />
            </button>
            <a
              href={DOCS_HREF}
              target="_blank"
              rel="noreferrer"
              className="header-control inline-flex items-center gap-1 rounded-xl border border-[var(--gold-line)] px-2.5 py-1.5 text-xs font-medium text-[var(--gold-line)]"
            >
              <IconDocs className="h-4 w-4" />
              <span className="hidden sm:inline">Docs</span>
            </a>
            <button
              type="button"
              onClick={focusCode}
              className="header-control rounded-xl bg-[var(--gold-line)] px-2.5 py-1.5 text-xs font-medium text-[var(--header)]"
            >
              <span className="sm:hidden">Code</span>
              <span className="hidden sm:inline">Get API code</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--line)] bg-[var(--bg-elev)] py-2 lg:flex"
          aria-label="Playground"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => (item.id === 'code' ? focusCode() : setTab(item.id))}
                className={`rounded-xl p-2.5 ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'text-[var(--muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
          <div className="mt-auto flex flex-col items-center gap-1">
            <a
              href={DOCS_HREF}
              target="_blank"
              rel="noreferrer"
              title="Docs"
              aria-label="Docs"
              className="rounded-xl p-2.5 text-[var(--muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--ink)]"
            >
              <IconDocs className="h-5 w-5" />
            </a>
            <a
              href={GITHUB_HREF}
              target="_blank"
              rel="noreferrer"
              title="GitHub"
              aria-label="GitHub"
              className="rounded-xl p-2.5 text-[var(--muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--ink)]"
            >
              <IconGitHub className="h-5 w-5" />
            </a>
            <a
              href={X_HREF}
              target="_blank"
              rel="noopener"
              title="X @0xSkamber"
              aria-label="X @0xSkamber"
              className="rounded-xl p-2.5 text-[var(--muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--ink)]"
            >
              <IconX className="h-5 w-5" />
            </a>
          </div>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <nav
            className="flex shrink-0 gap-1 border-b border-[var(--line)] bg-[var(--bg-elev)] px-2 py-1.5 lg:hidden"
            aria-label="Playground"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium sm:text-sm ${
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

          <div className="flex min-h-0 flex-1 gap-2 p-2 sm:gap-3 sm:p-3">
            <div
              className={`${
                tab === 'chat' ? 'flex' : 'hidden'
              } min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] shadow-[var(--shadow)]`}
            >
              <ChatPanel
                chat={chat}
                configured={configured}
                onOpenSpeech={openSpeech}
                onAttachAudio={attachAudio}
              />
            </div>
            <div
              className={`${
                tab === 'speech' ? 'flex' : 'hidden'
              } min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] shadow-[var(--shadow)]`}
            >
              <SpeechPanel
                configured={configured}
                onReply={(text) => {
                  setTab('chat');
                  void chat.send(text);
                }}
                onAction={onAction}
                onBusy={setSpeechBusy}
                replyDisabled={chat.busy}
                uploadRequest={uploadRequest}
              />
            </div>
            <div
              className={`${tab === 'code' ? 'flex' : 'hidden'} ${
                codeBeside ? 'xl:flex xl:w-[min(46%,34rem)] xl:flex-none' : 'xl:flex'
              } min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] shadow-[var(--shadow)]`}
            >
              <CodePanel action={action} />
            </div>
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
