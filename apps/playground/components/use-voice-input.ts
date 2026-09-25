'use client';

import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/sse';
import { type ChatLanguage } from '@/lib/types';
import {
  VOICE_CHAT_SECONDS,
  asrLanguageForChat,
  capitalizeTranscript,
  micErrorMessage,
} from '@/lib/voice';

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

export function useVoiceInput({
  language,
  disabled,
  onTranscript,
  onError,
}: {
  language: ChatLanguage;
  disabled: boolean;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const languageRef = useRef(language);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  languageRef.current = language;
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  async function transcribe(file: File) {
    setTranscribing(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('language', asrLanguageForChat(languageRef.current));
      const response = await fetch('/api/transcribe', { method: 'POST', body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorMessage(payload, 'Could not transcribe that recording.'));
      }
      const text =
        payload &&
        typeof payload === 'object' &&
        'text' in payload &&
        typeof payload.text === 'string'
          ? payload.text.trim()
          : '';
      if (!text) throw new Error('The recording had no words to send.');
      onTranscriptRef.current(capitalizeTranscript(text));
    } catch (error) {
      onErrorRef.current(
        error instanceof Error ? error.message : 'Could not transcribe that recording.',
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function toggle() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (disabled || transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('This browser cannot record audio. Type a message instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setRecording(false);
        const type = recorder.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        void transcribe(new File([new Blob(chunks, { type })], `voice.${ext}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        setElapsed(seconds);
        if (seconds >= VOICE_CHAT_SECONDS) recorder.stop();
      }, 250);
    } catch (error) {
      onError(micErrorMessage(error));
    }
  }

  return { recording, transcribing, elapsed, toggle };
}
