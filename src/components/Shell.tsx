import type { ReactNode } from 'react';
import { useShareSafe } from '../lib/shareSafe.tsx';
import { go } from '../lib/router.ts';
import type { Coverage, HealthItem } from '../shared/stats.ts';
import { dateShort } from '../lib/format.ts';

/** Original mark: three stacked rounded bars, a "done pile". */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="18" width="26" height="9" rx="4.5" fill="#ff5a5f" />
      <rect x="7" y="10" width="18" height="7" rx="3.5" fill="#ffb400" />
      <rect x="11" y="3" width="10" height="6" rx="3" fill="#00c2a8" />
    </svg>
  );
}

export function ShareSafeToggle({ compact = false }: { compact?: boolean }) {
  const { on, toggle } = useShareSafe();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="Share-safe mode hides task text and replaces names with aliases (shortcut: S)"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
        on ? 'border-safe bg-safe text-ink' : 'border-line bg-panel text-soft hover:border-muted'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {on ? (
          <>
            <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
            <path d="m9 12 2 2 4-4" />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      {compact ? (on ? 'Safe' : 'Names') : on ? 'Share-safe ON' : 'Share-safe off'}
      <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-bold sm:inline">S</kbd>
    </button>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  const { on } = useShareSafe();
  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur ${on ? 'border-safe/60 bg-ink/85' : 'border-line bg-ink/80'}`}>
      {on && <div className="h-1 w-full bg-safe" aria-hidden="true" />}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => go({ view: 'landing' })} className="flex items-center gap-2 text-left">
          <Logo />
          <span className="text-lg font-black tracking-tight">Jack's Todoist Wrapped</span>
        </button>
        <div className="flex items-center gap-2">
          {right}
          <ShareSafeToggle />
        </div>
      </div>
    </header>
  );
}

export function CoverageNote({ coverage, label }: { coverage: Coverage; label: string }) {
  if (!coverage.firstDate) return <p className="text-sm text-muted">No data in {label}.</p>;
  const full = coverage.percent >= 99.5;
  return (
    <p className="text-sm text-muted">
      Data from <span className="text-soft">{dateShort(coverage.firstDate)}</span> to{' '}
      <span className="text-soft">{dateShort(coverage.lastDate!)}</span>
      {label !== 'All time' && !full && <> · covers {coverage.percent}% of {label}</>}
      {label === 'All time' && <> · {coverage.daysCovered.toLocaleString('en-US')} days</>}
    </p>
  );
}

const STATUS_STYLE = {
  ok: { icon: '✓', label: 'Available', cls: 'text-[#0aac23]' },
  partial: { icon: '◐', label: 'Partial', cls: 'text-[#fbb315]' },
  unavailable: { icon: '✕', label: 'Unavailable', cls: 'text-[#f18a59]' },
} as const;

export function HealthList({ items, only }: { items: HealthItem[]; only?: ('ok' | 'partial' | 'unavailable')[] }) {
  const shown = only ? items.filter((i) => only.includes(i.status)) : items;
  if (!shown.length) return null;
  return (
    <ul className="space-y-2">
      {shown.map((h) => {
        const s = STATUS_STYLE[h.status];
        return (
          <li key={h.group + h.message} className="flex gap-3 text-sm">
            <span className={`mt-0.5 w-28 shrink-0 font-semibold ${s.cls}`}>
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </span>
            <span>
              <span className="font-semibold text-soft">{h.group}.</span> <span className="text-muted">{h.message}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
