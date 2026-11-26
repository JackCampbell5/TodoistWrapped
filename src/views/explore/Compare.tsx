import { useState } from 'react';
import { index, useYear } from '../../lib/data.ts';
import { useNames } from '../../lib/shareSafe.tsx';
import { num, pct } from '../../lib/format.ts';
import { themeColor } from '../../lib/palette.ts';
import { compareYears, describeShift, type RankChange, type RankComparison } from '../../shared/yoy.ts';
import { Card, Swatch } from './ui.tsx';

export function Compare({ current }: { current: string }) {
  const years = index!.years.filter((y) => y.key !== 'all').map((y) => y.key); // newest first
  const defaultB = current !== 'all' ? current : years[0];
  const defaultA = years.find((y) => y < (defaultB ?? '')) ?? years[1] ?? years[0];
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(defaultB);
  const sa = useYear(a ?? null);
  const sb = useYear(b ?? null);

  if (years.length < 2) {
    return (
      <Card wide title="Not enough history yet" sub="Year-over-year needs at least two years of data.">
        <p className="text-sm text-soft">Your export only covers {years[0] ?? 'no full year'}. Come back next year and this will light up.</p>
      </Card>
    );
  }

  const picker = (id: string, value: string, set: (v: string) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm font-bold">
      <span className="text-muted">{label}</span>
      <select id={id} value={value} onChange={(e) => set(e.target.value)} className="rounded-full border border-line bg-ink px-3 py-1.5">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        {picker('yoy-a', a, setA, 'Compare')}
        {picker('yoy-b', b, setB, 'with')}
      </div>
      {!sa || !sb ? <p className="text-sm text-muted">Loading…</p> : a === b ? (
        <Card wide title="Pick two different years"><p className="text-sm text-muted">Choose two different years to see what changed.</p></Card>
      ) : (
        <Result y={compareYears(sa, sb)} />
      )}
    </div>
  );
}

function Result({ y }: { y: ReturnType<typeof compareYears> }) {
  const n = useNames();
  if (!y.enough) {
    return (
      <Card wide title="Not enough history yet" sub={y.reason}>
        <p className="text-sm text-soft">One of these years is too thin for a fair comparison. Try another pair.</p>
      </Card>
    );
  }
  const shifts = y.shifts.map((s) => describeShift(s)).filter(Boolean) as string[];
  const up = y.completions.delta >= 0;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={`${y.a} → ${y.b}`} sub="Completions">
        <p className={`display text-6xl font-black ${up ? 'text-[#0aac23]' : 'text-[#f18a59]'}`}>
          <span aria-hidden="true">{up ? '▲' : '▼'}</span> {y.completions.pct != null ? pct(Math.abs(y.completions.pct)) : num(Math.abs(y.completions.delta))}
        </p>
        <p className="mt-1 text-sm text-soft">
          {num(y.completions.a)} → {num(y.completions.b)} ({up ? '+' : '−'}{num(Math.abs(y.completions.delta))}) {up ? 'more' : 'fewer'} completions
        </p>
        <p className="mt-3 text-sm text-muted">{y.projects.stayed.length} of your top-10 projects stayed in the top 10 both years.</p>
      </Card>
      <Card title="Habit shifts">
        <ul className="space-y-2 text-sm">
          {shifts.map((s) => <li key={s} className="flex gap-2"><span aria-hidden="true" className="text-muted">→</span>{s}</li>)}
          {shifts.length === 0 && <li className="text-muted">Your habits barely moved.</li>}
        </ul>
      </Card>
      <RankCard title="Projects" r={y.projects} name={(id) => n.project(id)} color={(id) => n.projectColor(id)} a={y.a} b={y.b} />
      <RankCard title="Themes" r={y.themes} name={(id) => n.theme(id)} color={themeColor} a={y.a} b={y.b} />
      <RankCard title="Labels" r={y.labels} name={(id) => `@${n.label(id)}`} color={(id) => index!.entities.labels[id]?.color ?? '#808080'} a={y.a} b={y.b} />
      {y.projects.stayed.length > 0 && (
        <Card title="Top-10 regulars" sub="Projects in your top 10 both years.">
          <ul className="flex flex-wrap gap-2 text-sm">
            {y.projects.stayed.map((id) => <li key={id} className="rounded-full bg-panel-2 px-3 py-1"><Swatch color={n.projectColor(id)} />{n.project(id)}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Movement({ c }: { c: RankChange }) {
  if (c.status === 'new') return <span className="rounded bg-[#338ced]/20 px-1.5 py-0.5 text-[11px] font-black text-[#84b9f3]">NEW</span>;
  if (c.status === 'same') return <span className="text-muted" aria-label="no change">=</span>;
  const up = c.status === 'up';
  return (
    <span className={`font-bold ${up ? 'text-[#0aac23]' : 'text-[#f18a59]'}`} aria-label={`${up ? 'up' : 'down'} ${Math.abs(c.moved)}`}>
      {up ? '↑' : '↓'}{Math.abs(c.moved)}
    </span>
  );
}

function RankCard({ title, r, name, color, a, b }: { title: string; r: RankComparison; name: (id: string) => string; color: (id: string) => string; a: string; b: string }) {
  return (
    <Card title={`${title}: rank changes`} sub={`Top 10 in ${b}, compared with ${a}.`}>
      {r.top.length === 0 ? <p className="text-sm text-muted">Nothing to compare.</p> : (
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{title} rank changes from {a} to {b}</caption>
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr><th scope="col" className="w-8 py-1 text-left">#</th><th scope="col" className="text-left">Name</th><th scope="col" className="w-14 text-left">Move</th><th scope="col" className="w-28 text-right">{a} → {b}</th></tr>
          </thead>
          <tbody className="tabular">
            {r.top.map((c) => (
              <tr key={c.id} className="border-t border-line/60">
                <td className="py-1.5 text-muted">{c.rankB}</td>
                <td className="max-w-0 truncate pr-2"><Swatch color={color(c.id)} />{name(c.id)}</td>
                <td><Movement c={c} /></td>
                <td className="text-right text-soft">{num(c.countA)} → <span className="font-bold text-white">{num(c.countB)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.dropped.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Dropped out of the top 10: {r.dropped.map((d) => `${name(d.id)} (was #${d.rankA})`).join(', ')}
        </p>
      )}
    </Card>
  );
}
