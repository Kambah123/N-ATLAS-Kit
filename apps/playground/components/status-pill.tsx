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
  unconfigured: 'bg-[var(--muted)]',
};

export function StatusPill({ health }: { health: HealthView }) {
  return (
    <p
      className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-[var(--header-ink)] sm:max-w-xs"
      title={health.message}
      role="status"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[health.status]}`} aria-hidden />
      <span className="truncate">
        <span className="font-medium">{LABEL[health.status]}</span>
        <span className="hidden text-[var(--header-muted)] md:inline"> · {health.message}</span>
      </span>
    </p>
  );
}
