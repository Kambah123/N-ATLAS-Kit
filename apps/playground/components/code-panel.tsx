'use client';

import { useMemo, useState } from 'react';
import { type LastAction } from '@/components/types';
import { JS_SDK_HREF, PY_SDK_HREF, renderSnippets } from '@/lib/snippets';

const TABS = [
  { id: 'curl', label: 'curl', file: 'request.sh' },
  { id: 'javascript', label: 'n-atlas', file: 'request.mjs' },
  { id: 'python', label: 'natlas', file: 'request.py' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CodePanel({ action }: { action: LastAction | null }) {
  const [tab, setTab] = useState<TabId>('curl');
  const [copied, setCopied] = useState(false);
  const snippets = useMemo(() => (action ? renderSnippets(action.request) : null), [action]);
  const current = snippets ? snippets[tab] : '';
  const file = TABS.find((item) => item.id === tab)?.file ?? 'request.sh';
  const lines = current.length > 0 ? current.replace(/\n$/, '').split('\n') : [];

  return (
    <section
      id="live-code"
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-elev)]"
      aria-label="Get code"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <div role="tablist" aria-label="Snippet language" className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setCopied(false);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                tab === item.id
                  ? 'bg-[var(--bg-sunken)] text-[var(--ink)]'
                  : 'text-[var(--muted)] hover:bg-[var(--bg-sunken)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
          {action ? action.title : 'Waiting for a request'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--code-line)] bg-[var(--code-bg)] px-3 py-1.5">
        <span className="font-mono text-xs text-[var(--code-ink)]">{file}</span>
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={() => {
            void navigator.clipboard.writeText(current).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="ml-auto rounded-lg border border-[var(--code-line)] px-2.5 py-1 text-xs font-medium text-[var(--code-ink)] disabled:opacity-40"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {lines.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--code-bg)] px-6 text-center">
          <p className="max-w-sm text-sm leading-6 text-[var(--code-muted)]">
            Send a chat message or transcribe audio. Curl,{' '}
            <a className="underline underline-offset-2" href={JS_SDK_HREF}>
              n-atlas
            </a>
            , and{' '}
            <a className="underline underline-offset-2" href={PY_SDK_HREF}>
              natlas
            </a>{' '}
            for that request show up here. Nothing is stored after you close the tab.
          </p>
        </div>
      ) : (
        <pre className="font-mono min-h-0 flex-1 overflow-auto bg-[var(--code-bg)] py-3 text-[13px] leading-6 text-[var(--code-ink)]">
          {lines.map((line, index) => (
            <div key={`${index}-${line.slice(0, 12)}`} className="flex min-w-full">
              <span className="sticky left-0 w-10 shrink-0 bg-[var(--code-bg)] pr-3 text-right text-[var(--code-muted)] select-none">
                {index + 1}
              </span>
              <span className="pr-4 whitespace-pre">{line.length > 0 ? line : ' '}</span>
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}
