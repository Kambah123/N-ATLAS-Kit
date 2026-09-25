'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chatLanguageOption } from '@/lib/languages';
import { MAX_MESSAGE_CHARS } from '@/lib/limits';
import { deltaFromEvent, errorMessage, messageFromCompletion, takeSseData } from '@/lib/sse';
import { LLM_MODEL_ID, type ChatLanguage, type ChatRequestBody } from '@/lib/types';
import { type LastAction } from '@/components/types';
import { useSlow } from '@/components/use-slow';

export type VisibleMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type UseChatOptions = {
  configured: boolean;
  onAction: (action: LastAction) => void;
};

export function useChat({ configured, onAction }: UseChatOptions) {
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [language, setLanguage] = useState<ChatLanguage>('en');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const slow = useSlow(busy);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const buildBody = useCallback(
    (history: VisibleMessage[], stream: boolean): ChatRequestBody => ({
      model: LLM_MODEL_ID,
      messages: [
        { role: 'system', content: chatLanguageOption(language).system },
        ...history
          .filter((message) => message.content.trim().length > 0)
          .map((message) => ({ role: message.role, content: message.content })),
      ],
      temperature: Math.round(temperature * 10) / 10,
      max_tokens: maxTokens,
      stream,
      language,
    }),
    [language, maxTokens, temperature],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busyRef.current) return;
      if (content.length > MAX_MESSAGE_CHARS) {
        setError(`Keep a message under ${MAX_MESSAGE_CHARS} characters.`);
        return;
      }
      if (!configured) {
        setError(
          'No N-ATLAS backend connected. Set NATLAS_BASE_URL and NATLAS_API_KEY on the server, then reload.',
        );
        return;
      }

      const history = [...messages, { id: newId(), role: 'user' as const, content }];
      const assistantId = newId();
      const body = buildBody(history, true);
      setMessages([...history, { id: assistantId, role: 'assistant', content: '' }]);
      setDraft('');
      setError(null);
      setBusy(true);
      busyRef.current = true;
      onAction({ title: 'Chat', request: { kind: 'chat', body } });

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
          throw new Error(errorMessage(payload, 'N-ATLaS could not answer that.'));
        }
        if (!type.includes('text/event-stream') || !response.body) {
          const payload: unknown = await response.json().catch(() => null);
          const textOut = messageFromCompletion(payload);
          if (!textOut) throw new Error('N-ATLaS returned an empty reply.');
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: textOut } : message,
            ),
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assembled = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = takeSseData(buffer);
          buffer = parsed.rest;
          let changed = false;
          for (const data of parsed.data) {
            const delta = deltaFromEvent(data);
            if (!delta) continue;
            assembled += delta;
            changed = true;
          }
          if (changed) {
            const snapshot = assembled;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, content: snapshot } : message,
              ),
            );
          }
        }
        if (!assembled.trim()) {
          setError('N-ATLaS returned an empty reply.');
        }
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') {
          setError('Stopped.');
        } else {
          setError(caught instanceof Error ? caught.message : 'N-ATLaS could not answer that.');
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        abortRef.current = null;
      }
    },
    [buildBody, configured, messages, onAction],
  );

  const clear = useCallback(() => {
    if (busyRef.current) return;
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    draft,
    setDraft,
    language,
    setLanguage,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    busy,
    slow,
    error,
    send,
    stop,
    clear,
  };
}

export type ChatController = ReturnType<typeof useChat>;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
