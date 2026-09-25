import { WAKING_MESSAGE } from '@/lib/languages';

export function WakingCard() {
  return (
    <div
      className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 shadow-[var(--shadow)]"
      role="status"
    >
      <p className="text-sm font-medium text-[var(--ink)]">{WAKING_MESSAGE}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        The gateway is starting the model. You can leave this tab open.
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
        <div className="progress-slide h-full w-1/3 rounded-full bg-[var(--accent)]" />
      </div>
    </div>
  );
}
