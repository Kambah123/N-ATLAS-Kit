'use client';

import { useEffect, useRef, useState } from 'react';
import { TuneFields } from '@/components/chat-settings';
import { IconMic, IconPaperclip } from '@/components/icons';
import { useSpeaker } from '@/components/use-speaker';
import { useVoiceInput } from '@/components/use-voice-input';
import { WakingCard } from '@/components/waking-card';
import { type ChatController } from '@/components/use-chat';
import { chatLanguageOption } from '@/lib/languages';

type Chat = ChatController;

export function ChatPanel({
  chat,
  configured,
  onAttachAudio,
}: {
  chat: Chat;
  configured: boolean;
  onAttachAudio: () => void;
}) {
  const option = chatLanguageOption(chat.language);
  const endRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const speaker = useSpeaker();
  const voice = useVoiceInput({
    language: chat.language,
    disabled: !configured || chat.busy,
    onTranscript: (text) => {
      setVoiceError(null);
      void chat.send(text, { fromTranscript: true });
    },
    onError: setVoiceError,
  });

  useEffect(() => {
    try {
      setAutoSpeak(localStorage.getItem('natlas-auto-speak') === '1');
    } catch {
      /* Private mode can refuse storage. The toggle still works for this view. */
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  useEffect(() => {
    if (!autoSpeak || chat.busy) return;
    const last = [...chat.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.content.trim().length > 0);
    if (!last || spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    void speaker.speak(last);
  }, [autoSpeak, chat.busy, chat.messages, speaker]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Chat">
      {chat.messages.length > 0 ? (
        <div className="flex shrink-0 justify-end px-4 pt-3">
          <button
            type="button"
            onClick={chat.clear}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg-sunken)]"
          >
            New chat
          </button>
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
      >
        {chat.messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center text-center max-[768px]:py-4 min-[769px]:h-full min-[769px]:justify-center">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
              Ask N-ATLaS
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              {option.blurb} Replies stream from Nigeria&apos;s model. The hint stays on this
              server.
            </p>
            {chat.slow ? (
              <div className="mt-5 w-full text-left">
                <WakingCard />
              </div>
            ) : null}
          </div>
        ) : (
          chat.messages.map((message) => (
            <article
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[40rem] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-[var(--user)] text-[var(--user-ink)]'
                    : 'border border-[var(--line)] bg-[var(--bg-sunken)] text-[var(--ink)]'
                }`}
              >
                {message.role === 'assistant' && message.content.length === 0 ? (
                  chat.slow ? (
                    <WakingCard />
                  ) : (
                    <span className="text-[var(--muted)]">Thinking…</span>
                  )
                ) : (
                  message.content
                )}
                {message.role === 'assistant' && chat.busy && message.content.length > 0 ? (
                  <span className="pulse-dot ml-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
                ) : null}
                {message.role === 'assistant' && message.content.trim().length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (speaker.speakingId === message.id) speaker.stop();
                      else void speaker.speak(message);
                    }}
                    className="mt-2 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--ink)]"
                  >
                    {speaker.speakingId === message.id ? 'Stop' : 'Play'}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="shrink-0 border-t border-[var(--line)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
        onSubmit={(event) => {
          event.preventDefault();
          void chat.send(chat.draft);
        }}
      >
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
        {chat.notice ? (
          <p className="mb-2 text-xs text-[var(--muted)]" role="status">
            {chat.notice}
          </p>
        ) : null}
        {voiceError ? (
          <p
            className="mb-2 rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]"
            role="alert"
          >
            {voiceError}
          </p>
        ) : null}
        {voice.transcribing ? (
          <p className="mb-2 text-xs text-[var(--muted)]" role="status">
            Transcribing…
          </p>
        ) : null}
        {speaker.note ? (
          <p className="mb-2 text-xs text-[var(--muted)]" role="status">
            {speaker.note}
          </p>
        ) : null}
        <div className="mb-2 flex gap-2 max-[768px]:flex-nowrap max-[768px]:overflow-x-auto max-[768px]:pb-1 min-[769px]:flex-wrap">
          {option.examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => chat.setDraft(example)}
              className="max-w-full rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-left text-xs leading-5 text-[var(--ink)] hover:border-[var(--gold-line)] max-[768px]:max-w-none max-[768px]:shrink-0 max-[768px]:whitespace-nowrap min-[769px]:whitespace-normal"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] shadow-[var(--shadow)]">
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
            className="max-h-28 min-h-14 w-full resize-y bg-transparent px-3 pt-3 text-sm leading-6 text-[var(--ink)] outline-none"
          />
          <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
            <button
              type="button"
              onClick={() => void voice.toggle()}
              disabled={voice.transcribing || chat.busy}
              className={`rounded-xl p-2 hover:bg-[var(--bg-sunken)] disabled:opacity-50 ${
                voice.recording
                  ? 'text-[var(--danger)]'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              aria-label={voice.recording ? 'Stop recording' : 'Speak a message'}
              aria-pressed={voice.recording}
            >
              {voice.recording ? (
                <span className="px-1 text-xs font-medium">
                  {Math.floor(voice.elapsed / 60)}:{String(voice.elapsed % 60).padStart(2, '0')}
                </span>
              ) : (
                <IconMic />
              )}
            </button>
            <button
              type="button"
              onClick={onAttachAudio}
              className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--ink)]"
              aria-label="Upload audio"
            >
              <IconPaperclip />
            </button>
            <details>
              <summary className="cursor-pointer list-none rounded-xl px-2 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg-sunken)]">
                Tune
              </summary>
              <div className="mt-1 w-[min(18rem,70vw)] rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-3">
                <TuneFields
                  temperature={chat.temperature}
                  onTemperature={chat.setTemperature}
                  maxTokens={chat.maxTokens}
                  onMaxTokens={chat.setMaxTokens}
                />
              </div>
            </details>
            <button
              type="button"
              aria-pressed={autoSpeak}
              aria-label="Read replies aloud"
              onClick={() => {
                setAutoSpeak((current) => {
                  const next = !current;
                  try {
                    localStorage.setItem('natlas-auto-speak', next ? '1' : '0');
                  } catch {
                    /* The toggle still applies for this view. */
                  }
                  return next;
                });
              }}
              className={`rounded-xl px-2 py-2 text-xs font-medium ${
                autoSpeak
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--muted)] hover:bg-[var(--bg-sunken)]'
              }`}
            >
              {autoSpeak ? 'Auto on' : 'Auto'}
            </button>
            <p className="ml-auto hidden text-[11px] text-[var(--muted)] sm:block">
              Enter sends, Shift+Enter adds a line.
            </p>
            {chat.busy ? (
              <button
                type="button"
                onClick={chat.stop}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!configured || chat.draft.trim().length === 0}
                aria-label="Send"
                className="rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
