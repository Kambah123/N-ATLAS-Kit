import { type HealthView } from '@/components/types';

const LABEL: Record<HealthView['status'], string> = {
  checking: 'Checking',
  ready: 'Ready',
  waking: 'Waking up',
  degraded: 'Starting',
  offline: 'Offline',
  unconfigured: 'Not connected',
};

const DOT: Record<HealthView['status'], string> = {
  checking: 'bg-[var(--gold-line)] pulse-dot',
  ready: 'bg-[var(--accent)]',
  waking: 'bg-[var(--gold-line)] pulse-dot',
  degraded: 'bg-[var(--gold-line)] pulse-dot',
  offline: 'bg-[var(--danger)]',
  unconfigured: 'bg-[var(--header-muted)]',
};

export function StatusPill({ health }: { health: HealthView }) {
  return (
    <p
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-[var(--header-ink)]"
      title={health.message}
      role="status"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[health.status]}`} aria-hidden />
      <span className="truncate">
        <span className="font-medium">{LABEL[health.status]}</span>
        <span className="hidden text-[var(--header-muted)] sm:inline"> · {health.message}</span>
      </span>
    </p>
  );
}
