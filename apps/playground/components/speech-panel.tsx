'use client';

import { useEffect, useRef, useState } from 'react';
import { type LastAction } from '@/components/types';
import { WakingCard } from '@/components/waking-card';
import { useSlow } from '@/components/use-slow';
import { ASR_LANGUAGE_OPTIONS, PRIVACY_NOTE, TRANSLATE_SYSTEM } from '@/lib/languages';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '@/lib/limits';
import { errorMessage, messageFromCompletion } from '@/lib/sse';
import { LLM_MODEL_ID, type AsrLanguage, type ChatRequestBody } from '@/lib/types';

type SpeechPanelProps = {
  configured: boolean;
  onReply: (transcript: string) => void;
  onAction: (action: LastAction) => void;
  onBusy: (busy: boolean) => void;
  replyDisabled: boolean;
  uploadRequest?: number;
};

export function SpeechPanel({
  configured,
  onReply,
  onAction,
  onBusy,
  replyDisabled,
  uploadRequest = 0,
}: SpeechPanelProps) {
  const [language, setLanguage] = useState<AsrLanguage>('ha');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [filename, setFilename] = useState('');
  const [translation, setTranslation] = useState('');
  const [translating, setTranslating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const slow = useSlow(busy || translating);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onBusy(busy || translating);
  }, [busy, onBusy, translating]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (uploadRequest < 1) return;
    fileInputRef.current?.click();
  }, [uploadRequest]);

  async function submitFile(file: File) {
    if (!configured) {
      setError('No N-ATLAS backend connected. Set the server environment variables, then reload.');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError('Audio must be under 8 MB.');
      return;
    }
    const duration = await audioDuration(file);
    if (duration !== null && duration > MAX_AUDIO_SECONDS + 0.2) {
      setError('Audio must be 2 minutes or shorter.');
      return;
    }

    setBusy(true);
    setError(null);
    setTranslation('');
    setFilename(file.name || 'audio');
    const body = new FormData();
    body.append('file', file, file.name || 'audio');
    body.append('language', language);
    onAction({
      title: 'Transcription',
      request: { kind: 'transcription', language, filename: file.name || 'voice-note.ogg' },
    });
    try {
      const response = await fetch('/api/transcribe', { method: 'POST', body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorMessage(payload, 'Transcription failed.'));
      }
      const text =
        payload &&
        typeof payload === 'object' &&
        'text' in payload &&
        typeof payload.text === 'string'
          ? payload.text
          : '';
      if (!text.trim()) throw new Error('The transcript was empty.');
      setTranscript(text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transcription failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot record audio. Upload a file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        setRecording(false);
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        void submitFile(new File([blob], `recording.${ext}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      setError(null);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_AUDIO_SECONDS) recorder.stop();
      }, 250);
    } catch {
      setError('Microphone access was blocked. You can still upload a file.');
    }
  }

  async function translate() {
    if (!transcript.trim() || translating) return;
    const body: ChatRequestBody = {
      model: LLM_MODEL_ID,
      messages: [
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      max_tokens: 512,
      stream: false,
      language: 'en',
    };
    onAction({ title: 'Translate to English', request: { kind: 'chat', body } });
    setTranslating(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, 'Translation failed.'));
      const text = messageFromCompletion(payload);
      if (!text.trim()) throw new Error('N-ATLaS returned an empty translation.');
      setTranslation(text.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Translation failed.');
    } finally {
      setTranslating(false);
    }
  }

  const model = ASR_LANGUAGE_OPTIONS.find((option) => option.id === language)?.model;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-label="Speech">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Speech</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Record or upload a voice note. Each language uses its own NCAIR1 model. Pidgin shares
            the Nigerian English model.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 shadow-[var(--shadow)]">
          <div
            role="radiogroup"
            aria-label="Transcription language"
            className="flex flex-wrap gap-2"
          >
            {ASR_LANGUAGE_OPTIONS.map((option) => {
              const active = option.id === language;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLanguage(option.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">{model}</p>

          <div
            className={`mt-4 rounded-2xl border border-dashed px-4 py-6 text-center ${
              dragOver ? 'border-[var(--blue)] bg-[var(--bg-sunken)]' : 'border-[var(--line)]'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files[0];
              if (file) void submitFile(file);
            }}
          >
            {recording ? (
              <div className="mb-4 flex h-8 items-end justify-center gap-1" aria-hidden>
                {Array.from({ length: 12 }, (_, index) => (
                  <span
                    key={index}
                    className="wave-bar h-7 w-1 rounded-full bg-[var(--accent)]"
                    style={{ animationDelay: `${index * 0.08}s` }}
                  />
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void toggleRecording()}
                disabled={busy}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50"
              >
                {recording ? `Stop · ${formatTime(elapsed)}` : 'Record'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || recording}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                Upload audio
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ogg,.mp3,.m4a,.wav,.webm,audio/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void submitFile(file);
                }}
              />
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              .ogg, .mp3, .m4a, .wav — up to 2 minutes and 8 MB.
            </p>
          </div>

          {recording ? (
            <p className="mt-3 text-center text-xs text-[var(--muted)]" role="status">
              Recording {formatTime(elapsed)} of 2:00
            </p>
          ) : null}
          {busy ? (
            <div className="mt-4" role="status">
              <p className="text-sm text-[var(--ink)]">Transcribing…</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                <div className="progress-slide h-full w-1/3 rounded-full bg-[var(--blue)]" />
              </div>
            </div>
          ) : null}
          {slow ? (
            <div className="mt-4">
              <WakingCard />
            </div>
          ) : null}
          {error ? (
            <p
              className="mt-4 rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {!transcript && !busy && !recording && !error ? (
            <p className="mt-4 text-center text-sm text-[var(--muted)]">
              A transcript will show up here. It is not stored.
            </p>
          ) : null}
        </div>

        {transcript ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 shadow-[var(--shadow)]">
            <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
              Transcript{filename ? ` · ${filename}` : ''}
            </p>
            <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{transcript}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={replyDisabled || busy}
                onClick={() => onReply(transcript)}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50"
              >
                Reply to this
              </button>
              <button
                type="button"
                disabled={translating || busy}
                onClick={() => void translate()}
                className="rounded-xl border border-[var(--blue)] px-4 py-2 text-sm font-medium text-[var(--blue)] disabled:opacity-50"
              >
                {translating ? 'Translating…' : 'Translate to English'}
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(transcript)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium"
              >
                Copy
              </button>
            </div>
            {translation ? (
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                  English
                </p>
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{translation}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-[var(--muted)]">{PRIVACY_NOTE}</p>
      </div>
    </section>
  );
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => {
      finish(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
