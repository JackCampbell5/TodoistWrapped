import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { num } from '../../lib/format.ts';

export function CountUp({ value, duration = 1.4, format = num }: { value: number; duration?: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, reduce]);
  return (
    <span className="tabular" aria-label={format(value)}>
      {format(shown)}
    </span>
  );
}

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.15 + i * 0.12, type: 'spring' as const, stiffness: 140, damping: 18 } }),
};

export function Rise({ i = 0, children, className = '' }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div custom={i} variants={rise} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function Kicker({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return (
    <Rise i={i}>
      <p className="text-sm font-extrabold uppercase tracking-[0.22em] opacity-80">{children}</p>
    </Rise>
  );
}

export function Big({ children, i = 1, size = 'xl' }: { children: ReactNode; i?: number; size?: 'md' | 'lg' | 'xl' }) {
  const cls = size === 'xl' ? 'text-[clamp(4.5rem,27cqw,10rem)]' : size === 'lg' ? 'text-[clamp(3rem,14cqw,6rem)]' : 'text-[clamp(2.2rem,10cqw,4.2rem)]';
  return (
    <Rise i={i}>
      <div className={`display font-black ${cls} break-words`}>{children}</div>
    </Rise>
  );
}

export function Sub({ children, i = 2 }: { children: ReactNode; i?: number }) {
  return (
    <Rise i={i}>
      <p className="mt-3 text-[clamp(1.05rem,4.6cqw,1.5rem)] font-semibold leading-snug opacity-90">{children}</p>
    </Rise>
  );
}

/** Staggered list with optional proportional bars. */
export function RankList({ rows, accent, start = 3 }: { rows: { label: string; value: string; frac?: number; color?: string }[]; accent: string; start?: number }) {
  return (
    <ol className="mt-2 space-y-2.5">
      {rows.map((r, i) => (
        <Rise key={i} i={start + i}>
          <li className="flex items-center gap-3">
            <span className="display w-8 shrink-0 text-3xl font-black opacity-70">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-lg font-extrabold">{r.label}</span>
                <span className="tabular shrink-0 text-base font-bold opacity-80">{r.value}</span>
              </div>
              {r.frac !== undefined && (
                <div className="mt-1 h-2 rounded-full bg-black/20">
                  <motion.div
                    className="h-2 rounded-full"
                    style={{ background: r.color ?? accent }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(3, r.frac * 100)}%` }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              )}
            </div>
          </li>
        </Rise>
      ))}
    </ol>
  );
}

export function Hidden({ what }: { what: string }) {
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/25 px-4 py-2 text-sm font-bold">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /></svg>
      {what} hidden in share-safe mode
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-full bg-black/20 px-3 py-1 text-sm font-bold">{children}</span>;
}
