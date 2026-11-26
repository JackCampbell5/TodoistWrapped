import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { index, useYear } from '../lib/data.ts';
import { go } from '../lib/router.ts';
import { num } from '../lib/format.ts';
import { CoverageNote, Header, HealthList } from '../components/Shell.tsx';

export function Landing() {
  const years = index!.years;
  const [key, setKey] = useState(years[0]?.key ?? 'all');
  const stats = useYear(key);
  const reduce = useReducedMotion();
  const summary = years.find((y) => y.key === key)!;
  const issues = [...index!.health, ...(stats?.health ?? [])].filter((h) => h.status !== 'ok');

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:pt-16">
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          className="display text-6xl font-black sm:text-8xl"
        >
          Look what <span className="bg-gradient-to-r from-[#ff5a5f] via-[#ffb400] to-[#00c2a8] bg-clip-text text-transparent">you got done.</span>
        </motion.h1>
        <p className="mt-5 max-w-xl text-lg text-soft">
          A private recap of everything you finished, built from your own Todoist export. It runs on your machine and never goes online.
        </p>

        <section aria-labelledby="pick" className="mt-10">
          <h2 id="pick" className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">
            Pick a year
          </h2>
          <div role="radiogroup" aria-label="Year" className="flex flex-wrap gap-2">
            {years.map((y) => (
              <button
                key={y.key}
                type="button"
                role="radio"
                aria-checked={y.key === key}
                onClick={() => setKey(y.key)}
                className={`rounded-full px-4 py-2 text-base font-bold transition ${
                  y.key === key ? 'bg-white text-ink' : 'bg-panel text-soft hover:bg-panel-2'
                }`}
              >
                {y.label}
                <span className={`ml-2 text-xs font-semibold ${y.key === key ? 'text-ink/60' : 'text-muted'}`}>{num(y.completions)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <CoverageNote coverage={summary.coverage} label={summary.label} />
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => go({ view: 'story', year: key })}
            className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ff4d6d] to-[#7b2ff7] px-7 py-4 text-xl font-black shadow-lg shadow-[#7b2ff7]/30 transition hover:scale-[1.02]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
            Play my {key === 'all' ? 'story' : 'year'}
          </button>
          <button
            type="button"
            onClick={() => go({ view: 'explore', year: key })}
            className="inline-flex items-center gap-3 rounded-2xl border border-line bg-panel px-7 py-4 text-xl font-black transition hover:bg-panel-2"
          >
            Explore
          </button>
        </div>

        {issues.length > 0 && (
          <section aria-labelledby="health" className="mt-14 rounded-2xl border border-line bg-panel p-5">
            <h2 id="health" className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">
              What your export can and can’t tell us
            </h2>
            <HealthList items={issues} />
          </section>
        )}
        <p className="mt-10 text-xs text-muted">
          Not affiliated with Doist or Spotify. The “top %” line is just for fun and isn’t a real ranking.
        </p>
      </main>
    </div>
  );
}
