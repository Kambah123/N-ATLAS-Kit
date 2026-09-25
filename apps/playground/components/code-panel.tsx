'use client';

import { useMemo, useState } from 'react';
import { type LastAction } from '@/components/types';
import { JS_SDK_HREF, PY_SDK_HREF, renderSnippets } from '@/lib/snippets';

const TABS = [
  { id: 'curl', label: 'curl' },
  { id: 'javascript', label: 'n-atlas' },
  { id: 'python', label: 'natlas' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CodePanel({ action }: { action: LastAction | null }) {
  const [tab, setTab] = useState<TabId>('curl');
  const [copied, setCopied] = useState(false);
  const snippets = useMemo(() => (action ? renderSnippets(action.request) : null), [action]);
  const current = snippets ? snippets[tab] : '';

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6"
      aria-label="Get code"
    >
      <p className="text-xs font-medium tracking-[0.16em] text-[var(--gold)] uppercase">Get code</p>
      <h2 className="font-display mt-2 text-3xl">The call you just made.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        JavaScript uses{' '}
        <a className="underline decoration-[var(--line)] underline-offset-2" href={JS_SDK_HREF}>
          n-atlas
        </a>{' '}
        (<code>npm install n-atlas</code>). Python uses{' '}
        <a className="underline decoration-[var(--line)] underline-offset-2" href={PY_SDK_HREF}>
          natlas
        </a>{' '}
        (<code>pip install natlas</code>). Curl is the raw gateway call. Keep{' '}
        <code>NATLAS_API_KEY</code> on the server.
      </p>

      {!action || !snippets ? (
        <div className="mt-8 rounded-3xl border border-dashed border-[var(--line)] bg-[var(--bg-elev)] px-5 py-10 text-sm leading-6 text-[var(--muted)]">
          Send a chat message or transcribe audio. Curl, n-atlas, and natlas for that request will
          show up here. Nothing is stored after you close the tab.
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">
              Last request · <span className="font-medium text-[var(--ink)]">{action.title}</span>
            </p>
            <div
              role="tablist"
              aria-label="Snippet language"
              className="flex gap-1 rounded-full bg-[var(--bg-sunken)] p-1"
            >
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
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    tab === item.id
                      ? 'bg-[var(--bg-elev)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(current).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                });
              }}
              className="absolute top-3 right-3 rounded-full bg-white/10 px-3 py-1 text-xs text-[#f6f3ea]"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <pre className="overflow-auto rounded-3xl bg-[#10211a] p-4 pt-12 text-[13px] leading-6 text-[#e7f2ea]">
              <code>{current}</code>
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
