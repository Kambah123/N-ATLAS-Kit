'use client';

import { useEffect, useRef } from 'react';
import { ChatSettings } from '@/components/chat-settings';
import { type ChatController } from '@/components/use-chat';
import { chatLanguageOption, PRIVACY_NOTE, WAKING_MESSAGE } from '@/lib/languages';

type Chat = ChatController;

export function ChatPanel({
  chat,
  configured,
  showMobileSettings,
}: {
  chat: Chat;
  configured: boolean;
  showMobileSettings: boolean;
}) {
  const option = chatLanguageOption(chat.language);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Chat">
      {showMobileSettings ? (
        <details className="border-b border-[var(--line)] px-4 py-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium">
            Language, temperature, length
          </summary>
          <div className="pt-4">
            <ChatSettings
              idPrefix="chat-language-mobile"
              language={chat.language}
              onLanguage={chat.setLanguage}
              temperature={chat.temperature}
              onTemperature={chat.setTemperature}
              maxTokens={chat.maxTokens}
              onMaxTokens={chat.setMaxTokens}
            />
          </div>
        </details>
      ) : null}

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {chat.messages.length === 0 ? (
          <div className="mx-auto max-w-xl pt-6 sm:pt-12">
            <p className="text-xs font-medium tracking-[0.16em] text-[var(--gold)] uppercase">
              N-ATLaS
            </p>
            <h2 className="font-display mt-2 text-3xl text-[var(--ink)] sm:text-4xl">
              Ask in {option.label}.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Streaming replies from Nigeria&apos;s multilingual model. The language hint tells
              N-ATLaS how to answer. It does not leave this server call.
            </p>
            <ul className="mt-6 space-y-2">
              {option.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] px-4 py-3 text-left text-sm leading-6 shadow-[var(--shadow)] transition hover:-translate-y-0.5"
                    onClick={() => chat.setDraft(example)}
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          chat.messages.map((message) => (
            <article
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[42rem] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-[var(--user)] text-[var(--user-ink)]'
                    : 'border border-[var(--line)] bg-[var(--bg-elev)] text-[var(--ink)]'
                }`}
              >
                {message.role === 'assistant' && message.content.length === 0 ? (
                  <span className="text-[var(--muted)]">
                    {chat.slow ? WAKING_MESSAGE : 'Thinking…'}
                  </span>
                ) : (
                  message.content
                )}
                {message.role === 'assistant' && chat.busy && message.content.length > 0 ? (
                  <span className="pulse-dot ml-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
                ) : null}
              </div>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-[var(--line)] bg-[var(--bg-elev)] px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          void chat.send(chat.draft);
        }}
      >
        {chat.slow ? (
          <p className="mb-2 text-sm text-[var(--gold)]" role="status">
            {WAKING_MESSAGE}
          </p>
        ) : null}
        {chat.error ? (
          <p
            className="mb-2 rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]"
            role="alert"
          >
            {chat.error}
          </p>
        ) : null}
        {!configured ? (
          <p className="mb-2 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2 text-sm">
            No N-ATLAS backend connected. Set <code>NATLAS_BASE_URL</code> and{' '}
            <code>NATLAS_API_KEY</code> on the server, then reload.
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-draft">
            Message
          </label>
          <textarea
            id="chat-draft"
            value={chat.draft}
            onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void chat.send(chat.draft);
              }
            }}
            rows={2}
            placeholder={option.placeholder}
            className="min-h-14 flex-1 resize-y rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm leading-6 text-[var(--ink)]"
          />
          {chat.busy ? (
            <button
              type="button"
              onClick={chat.stop}
              className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!configured || chat.draft.trim().length === 0}
              className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {PRIVACY_NOTE} Enter sends, Shift+Enter adds a line.
        </p>
      </form>
    </section>
  );
}
