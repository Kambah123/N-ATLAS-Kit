'use client';

import { CHAT_LANGUAGE_OPTIONS } from '@/lib/languages';
import { MAX_MAX_TOKENS, MAX_TEMPERATURE, MIN_MAX_TOKENS, MIN_TEMPERATURE } from '@/lib/limits';
import { type ChatLanguage } from '@/lib/types';

type ChatSettingsProps = {
  idPrefix?: string;
  language: ChatLanguage;
  onLanguage: (language: ChatLanguage) => void;
  temperature: number;
  onTemperature: (value: number) => void;
  maxTokens: number;
  onMaxTokens: (value: number) => void;
};

export function ChatSettings({
  idPrefix = 'chat-language',
  language,
  onLanguage,
  temperature,
  onTemperature,
  maxTokens,
  onMaxTokens,
}: ChatSettingsProps) {
  const selected = CHAT_LANGUAGE_OPTIONS.find((option) => option.id === language);
  const labelId = `${idPrefix}-label`;
  return (
    <div className="space-y-5">
      <div>
        <p id={labelId} className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
          Language hint
        </p>
        <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
          {CHAT_LANGUAGE_OPTIONS.map((option) => {
            const active = option.id === language;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onLanguage(option.id)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'bg-[var(--bg-sunken)] text-[var(--ink)] hover:bg-[var(--line)]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{selected?.blurb}</p>
      </div>
      <label className="block text-sm">
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
          onChange={(event) => onTemperature(Number(event.target.value))}
        />
      </label>
      <label className="block text-sm">
        <span className="flex items-center justify-between text-[var(--muted)]">
          Max tokens
          <span className="font-medium text-[var(--ink)]">{maxTokens}</span>
        </span>
        <input
          className="mt-2"
          type="range"
          min={MIN_MAX_TOKENS}
          max={MAX_MAX_TOKENS}
          step={64}
          value={maxTokens}
          onChange={(event) => onMaxTokens(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
