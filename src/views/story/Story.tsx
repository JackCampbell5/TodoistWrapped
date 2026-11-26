import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { index, useYear } from '../../lib/data.ts';
import { go } from '../../lib/router.ts';
import { useNames } from '../../lib/shareSafe.tsx';
import { ShareSafeToggle } from '../../components/Shell.tsx';
import { buildSlides } from './slides.tsx';

const SPEED_KEY = 'mdl.slideSeconds';
const SPEEDS = [4, 6, 8, 12, 0]; // 0 = manual
const HOLD_MS = 220;

function prevYearKey(key: string) {
  if (key === 'all') return null;
  const k = String(+key - 1);
  return index?.years.some((y) => y.key === k) ? k : null;
}

export default function Story({ year, start = 0 }: { year: string; start?: number }) {
  const stats = useYear(year);
  const prev = useYear(prevYearKey(year));
  const names = useNames();
  const reduce = useReducedMotion();
  const slides = useMemo(() => (stats ? buildSlides(stats, names, prev) : []), [stats, names, prev]);

  const [idx, setIdx] = useState(Math.max(0, start));
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [seconds, setSeconds] = useState(() => {
    const raw = localStorage.getItem(SPEED_KEY);
    const v = raw === null ? 6 : Number(raw);
    return SPEEDS.includes(v) ? v : 6;
  });
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);
  const didHold = useRef(false);

  const count = slides.length;
  const safeIdx = Math.min(idx, Math.max(0, count - 1));
  const next = useCallback(() => setIdx((i) => Math.min(count - 1, i + 1)), [count]);
  const prevSlide = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    localStorage.setItem(SPEED_KEY, String(seconds));
  }, [seconds]);

  // reset the timer on every slide change
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
  }, [safeIdx]);

  // auto-advance
  const running = !paused && !held && seconds > 0 && safeIdx < count - 1;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      elapsed.current += t - last;
      last = t;
      const p = Math.min(1, elapsed.current / (seconds * 1000));
      setProgress(p);
      if (p >= 1) next();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, seconds, next, safeIdx]);

  useEffect(() => {
    const onVis = () => document.hidden && setPaused(true);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'Escape') go({ view: 'landing' });
      else if (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'k') setPaused((v) => !v);
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(count - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prevSlide, count]);

  if (!stats) return <div className="grid min-h-screen place-items-center text-muted">Loading your year…</div>;
  const slide = slides[safeIdx];

  const onPointerDown = () => {
    didHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      didHold.current = true;
      setHeld(true);
    }, HOLD_MS);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    window.clearTimeout(holdTimer.current);
    if (didHold.current) {
      setHeld(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prevSlide();
    else next();
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black sm:gap-4">
      <div
        role="region"
        aria-roledescription="slideshow"
        aria-label={`Your ${stats.label} story`}
        className="relative h-[100dvh] w-full select-none overflow-hidden sm:h-[min(88dvh,920px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[28px] sm:shadow-2xl"
        style={{ containerType: 'inline-size', background: slide.palette.bg, color: slide.palette.ink, transition: 'background 600ms ease' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          window.clearTimeout(holdTimer.current);
          if (didHold.current) setHeld(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* progress */}
        <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-3 pt-3" aria-hidden="true">
          {slides.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, currentColor 28%, transparent)' }}>
              <div className="h-full rounded-full" style={{ background: 'currentColor', width: i < safeIdx ? '100%' : i === safeIdx ? `${(seconds ? progress : 1) * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="absolute right-3 top-6 z-10 flex items-center gap-2 sm:hidden">
          <button type="button" aria-label="Close story" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); go({ view: 'landing' }); }} className="rounded-full bg-black/25 p-2">
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {(paused || held) && (
          <div className="absolute left-1/2 top-8 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">Paused</div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id + String(names.safe)}
            className="absolute inset-0 px-7 pb-10 pt-14"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.03, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {slide.el}
          </motion.div>
        </AnimatePresence>
        <p className="sr-only" aria-live="polite">
          Slide {safeIdx + 1} of {count}. {slide.alt}
        </p>
      </div>

      {/* controls */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-2 py-1.5 text-white backdrop-blur sm:static sm:translate-x-0 sm:bg-transparent">
        <CtlButton label="Previous slide (←)" onClick={prevSlide} disabled={safeIdx === 0}>
          <path d="M15 5 8 12l7 7" />
        </CtlButton>
        <CtlButton label={paused ? 'Play (P)' : 'Pause (P)'} onClick={() => setPaused((v) => !v)}>
          {paused ? <path d="M8 5v14l11-7z" fill="currentColor" /> : <path d="M9 5v14M15 5v14" />}
        </CtlButton>
        <CtlButton label="Next slide (→ or space)" onClick={next} disabled={safeIdx === count - 1}>
          <path d="m9 5 7 7-7 7" />
        </CtlButton>
        <span className="tabular px-1 text-sm font-bold text-soft">{safeIdx + 1}/{count}</span>
        <label className="hidden items-center gap-1 text-sm text-soft sm:flex">
          <span className="sr-only">Seconds per slide</span>
          <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="rounded-full border border-line bg-panel px-2 py-1 text-sm">
            {SPEEDS.map((s) => <option key={s} value={s}>{s ? `${s}s / slide` : 'Manual'}</option>)}
          </select>
        </label>
        <span className="hidden sm:inline"><ShareSafeToggle compact /></span>
        <button type="button" onClick={() => go({ view: 'explore', year })} className="hidden rounded-full border border-line px-3 py-1.5 text-sm font-bold hover:bg-panel sm:inline">
          Explore
        </button>
        <button type="button" onClick={() => go({ view: 'landing' })} className="hidden rounded-full border border-line px-3 py-1.5 text-sm font-bold hover:bg-panel sm:inline">
          Exit (Esc)
        </button>
      </div>
    </div>
  );
}

function CtlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
