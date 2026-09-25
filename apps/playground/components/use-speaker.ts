'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatLanguage } from '@/lib/types';
import { browserSpeechLang, missingVoiceNote, pidginVoiceNote } from '@/lib/voice';

export type Speakable = {
  id: string;
  content: string;
  language?: ChatLanguage;
};

type BrowserResult = { ok: true; note: string | null } | { ok: false; note: string };

export function useSpeaker() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
    releaseAudio();
    setSpeakingId(null);
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
      utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onerror = () => {
        setSpeakingId((current) => (current === id ? null : current));
        setNote(missingVoiceNote(language));
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return { ok: true, note: language === 'pcm' ? pidginVoiceNote() : null };
    },
    [],
  );

  const speak = useCallback(
    async (message: Speakable) => {
      const language = message.language ?? 'en';
      const text = message.content.trim().slice(0, 600);
      if (!text) return;
      releaseAudio();
      setNote(null);
      setSpeakingId(message.id);
      try {
        const response = await fetch('/api/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language }),
        });
        const type = response.headers.get('content-type') ?? '';
        if (response.ok && type.includes('audio')) {
          const voiceNote = response.headers.get('x-natlas-voice-note');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            if (urlRef.current === url) {
              URL.revokeObjectURL(url);
              urlRef.current = null;
            }
            setSpeakingId((current) => (current === message.id ? null : current));
          };
          if (voiceNote) setNote(voiceNote);
          try {
            await audio.play();
          } catch {
            releaseAudio();
            setSpeakingId(null);
            setNote('Tap play on the reply to hear it. The browser blocked automatic playback.');
          }
          return;
        }
        const browser = speakWithBrowser(text, language, message.id);
        if (browser.ok) {
          setNote(browser.note ?? (language === 'pcm' ? pidginVoiceNote() : null));
          return;
        }
        setSpeakingId(null);
        setNote(browser.note);
      } catch {
        const browser = speakWithBrowser(text, language, message.id);
        if (browser.ok) {
          setNote(browser.note);
          return;
        }
        setSpeakingId(null);
        setNote(browser.note);
      }
    },
    [releaseAudio, speakWithBrowser],
  );

  return { speakingId, note, speak, stop };
}
