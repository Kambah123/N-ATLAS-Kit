'use client';

import { CHAT_LANGUAGE_OPTIONS } from '@/lib/languages';
import { MAX_MAX_TOKENS, MAX_TEMPERATURE, MIN_MAX_TOKENS, MIN_TEMPERATURE } from '@/lib/limits';
import { isChatLanguage, type ChatLanguage } from '@/lib/types';

type LanguageFieldProps = {
  language: ChatLanguage;
  onLanguage: (language: ChatLanguage) => void;
};

export function LanguageField({ language, onLanguage }: LanguageFieldProps) {
  const selected = CHAT_LANGUAGE_OPTIONS.find((option) => option.id === language);
  return (
    <div className="min-w-0">
      <label className="sr-only" htmlFor="chat-language">
        Language hint
      </label>
      <select
        id="chat-language"
        aria-describedby="chat-language-blurb"
        value={language}
        onChange={(event) => {
          const value = event.target.value;
          if (isChatLanguage(value)) onLanguage(value);
        }}
        className="header-control max-w-[11rem] rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-[var(--header-ink)]"
      >
        {CHAT_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <span id="chat-language-blurb" className="sr-only">
        {selected?.blurb}
      </span>
    </div>
  );
}

type TuneFieldsProps = {
  temperature: number;
  onTemperature: (value: number) => void;
  maxTokens: number;
  onMaxTokens: (value: number) => void;
};

export function TuneFields({
  temperature,
  onTemperature,
  maxTokens,
  onMaxTokens,
}: TuneFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs">
        <span className="flex items-center justify-between text-[var(--muted)]">
          Temperature
          <span className="font-medium text-[var(--ink)]">{temperature.toFixed(1)}</span>
        </span>
        <input
          className="mt-2"
          type="range"
          min={MIN_TEMPERATURE}
          max={MAX_TEMPERATURE}
          step={0.1}
          value={temperature}
          aria-describedby="temperature-hint"
          onChange={(event) => onTemperature(Number(event.target.value))}
        />
        <span id="temperature-hint" className="mt-1 block text-[11px] text-[var(--muted)]">
          Lower = more accurate, higher = more creative
        </span>
      </label>
      <label className="block text-xs">
        <span className="flex items-center justify-between text-[var(--muted)]">
          Max tokens
          <span className="font-medium text-[var(--ink)]">{maxTokens}</span>
        </span>
        <input
          className="mt-2"
          type="range"
          min={MIN_MAX_TOKENS}
          max={MAX_MAX_TOKENS}
          step={16}
          value={maxTokens}
          onChange={(event) => onMaxTokens(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
