'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatLanguage } from '@/lib/types';
import {
  browserSpeechLang,
  gatePidginNote,
  isPidginVoiceNote,
  missingVoiceNote,
  pidginVoiceNote,
  plainSpeechText,
} from '@/lib/voice';

export type Speakable = {
  id: string;
  content: string;
  language?: ChatLanguage;
};

export type SpeakerPhase = 'idle' | 'preparing' | 'speaking';

type BrowserResult = { ok: true; note: string | null } | { ok: false; note: string };

const PIDGIN_NOTE_KEY = 'natlas-pidgin-voice-note';

export function useSpeaker() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pidginShownRef = useRef(false);
  const [phase, setPhase] = useState<SpeakerPhase>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const revealNote = useCallback((next: string | null) => {
    let shown = pidginShownRef.current;
    if (!shown && typeof window !== 'undefined') {
      try {
        shown = sessionStorage.getItem(PIDGIN_NOTE_KEY) === '1';
      } catch {
        shown = false;
      }
    }
    const gated = gatePidginNote(next, shown);
    pidginShownRef.current = gated.shown;
    if (gated.shown && gated.note && isPidginVoiceNote(gated.note)) {
      try {
        sessionStorage.setItem(PIDGIN_NOTE_KEY, '1');
      } catch {
        /* The note still shows this once. */
      }
    }
    setNote(gated.note);
  }, []);

  const releaseAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseAudio();
    setPhase('idle');
    setActiveId(null);
  }, [releaseAudio]);

  useEffect(() => () => releaseAudio(), [releaseAudio]);

  const speakWithBrowser = useCallback(
    (text: string, language: ChatLanguage, id: string): BrowserResult => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return { ok: false, note: missingVoiceNote(language) };
      }
      const wanted = browserSpeechLang(language);
      const prefix = wanted.slice(0, 2).toLowerCase();
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((item) => item.lang.toLowerCase().replace('_', '-').startsWith(prefix)) ??
        (language === 'en' || language === 'pcm'
          ? voices.find((item) => item.lang.toLowerCase().startsWith('en'))
          : undefined);
      if (!voice && (language === 'ha' || language === 'ig' || language === 'yo')) {
        return { ok: false, note: missingVoiceNote(language) };
      }
      if (!voice && voices.length > 0 && language !== 'en' && language !== 'pcm') {
        return { ok: false, note: missingVoiceNote(language) };
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? wanted;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        setPhase('speaking');
        setActiveId(id);
      };
      utterance.onend = () => {
        setPhase('idle');
        setActiveId((current) => (current === id ? null : current));
      };
      utterance.onerror = () => {
        setPhase('idle');
        setActiveId((current) => (current === id ? null : current));
        revealNote(missingVoiceNote(language));
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return { ok: true, note: language === 'pcm' ? pidginVoiceNote() : null };
    },
    [revealNote],
  );

  const speak = useCallback(
    async (message: Speakable) => {
      const language = message.language ?? 'en';
      const text = plainSpeechText(message.content).slice(0, 600);
      if (!text) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      releaseAudio();
      setNote(null);
      setPhase('preparing');
      setActiveId(message.id);
      try {
        const response = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const type = response.headers.get('content-type') ?? '';
        if (response.ok && type.includes('audio')) {
          const voiceNote = response.headers.get('x-natlas-voice-note');
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            if (urlRef.current === url) {
              URL.revokeObjectURL(url);
              urlRef.current = null;
            }
            setPhase('idle');
            setActiveId((current) => (current === message.id ? null : current));
          };
          if (voiceNote) revealNote(voiceNote);
          try {
            await audio.play();
          } catch {
            releaseAudio();
            setPhase('idle');
            setActiveId(null);
            setNote('Tap play on the reply to hear it. The browser blocked automatic playback.');
            return;
          }
          if (controller.signal.aborted || audio.ended) {
            setPhase('idle');
            setActiveId(null);
            return;
          }
          setPhase('speaking');
          return;
        }
        const browser = speakWithBrowser(text, language, message.id);
        if (browser.ok) {
          revealNote(browser.note ?? (language === 'pcm' ? pidginVoiceNote() : null));
          return;
        }
        setPhase('idle');
        setActiveId(null);
        revealNote(browser.note);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const browser = speakWithBrowser(text, language, message.id);
        if (browser.ok) {
          revealNote(browser.note);
          return;
        }
        setPhase('idle');
        setActiveId(null);
        revealNote(browser.note);
      }
    },
    [releaseAudio, revealNote, speakWithBrowser],
  );

  return { phase, activeId, note, speak, stop };
}
