import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';
import { CATEGORICAL, OTHER, seqColor, themeColor } from '../../lib/palette.ts';
import { DOW_SHORT, dateShort, hourLabel, monthName, monthYear, num } from '../../lib/format.ts';

const axisProps = { tickLine: false, axisLine: false, stroke: '#9b9bb0', fontSize: 11 } as const;

function TipBox({ title, lines }: { title: string; lines: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-[#0f0f18]/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-white">{title}</p>
      {lines.map((l) => (
        <p key={l.label} className="flex items-center gap-2 text-soft">
          {l.color && <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />}
          <span>{l.label}</span>
          <span className="tabular ml-auto pl-3 font-bold text-white">{l.value}</span>
        </p>
      ))}
    </div>
  );
}

export function MonthBars({ data, multiYear }: { data: { month: string; count: number }[]; multiYear: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap={multiYear ? 1 : 6}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => (multiYear ? (m.endsWith('-01') ? m.slice(0, 4) : '') : monthName(m, true))} interval={multiYear ? 0 : 'preserveStartEnd'} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }} content={({ active, payload }) => active && payload?.[0] ? <TipBox title={monthYear(String(payload[0].payload.month))} lines={[{ label: 'Completions', value: num(Number(payload[0].value)) }]} /> : null} />
        <Bar dataKey="count" fill={CATEGORICAL[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({ data, color = CATEGORICAL[0], label = 'Count' }: { data: { name: string; value: number }[]; color?: string; label?: string }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }} content={({ active, payload }) => active && payload?.[0] ? <TipBox title={String(payload[0].payload.name)} lines={[{ label, value: num(Number(payload[0].value)) }]} /> : null} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stacked monthly theme bars. `themes` is in fixed all-time order so colors follow the entity. */
export function ThemeStack({ data, themes, label }: { data: Record<string, number | string>[]; themes: string[]; label: (t: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => monthName(m, true)} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.06)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox title={monthYear(String(payload[0].payload.month))} lines={[...payload].reverse().filter((p) => Number(p.value) > 0).map((p) => ({ label: label(String(p.dataKey)), value: num(Number(p.value)), color: String(p.color) }))} />
            ) : null
          }
        />
        {themes.map((t, i) => (
          <Bar key={t} dataKey={t} stackId="t" fill={t === 'Other' ? OTHER : themeColor(t)} stroke="#14141f" strokeWidth={1} radius={i === themes.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DebtLine({ data }: { data: { month: string; cumulative: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => (data.length > 14 ? (m.endsWith('-01') ? m.slice(0, 4) : '') : monthName(m, true))} interval={data.length > 14 ? 0 : 'preserveStartEnd'} />
        <YAxis {...axisProps} allowDecimals={false} />
        <ReferenceLine y={0} stroke="#4a4a5e" />
        <Tooltip cursor={{ stroke: '#9b9bb0', strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.[0] ? <TipBox title={monthYear(String(payload[0].payload.month))} lines={[{ label: 'Open backlog', value: num(Number(payload[0].value)) }]} /> : null} />
        <Line type="monotone" dataKey="cumulative" stroke={CATEGORICAL[1]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#14141f', strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HistoryBars({ monthly }: { monthly: Record<string, number> }) {
  const months = Object.keys(monthly).sort();
  if (!months.length) return <p className="text-sm text-muted">No completions.</p>;
  const all: { month: string; count: number }[] = [];
  let [y, m] = [+months[0].slice(0, 4), +months[0].slice(5, 7)];
  const end = months[months.length - 1];
  for (;;) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    all.push({ month: k, count: monthly[k] ?? 0 });
    if (k >= end) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return <MonthBars data={all} multiYear={all.length > 14} />;
}

/** Day-of-week × hour heatmap with a hover readout. */
export function DowHourHeatmap({ grid, noun }: { grid: number[][]; noun: string }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div>
      <p className="mb-2 h-5 text-xs text-soft" aria-live="polite">
        {hover ? `${DOW_SHORT[hover.d]} ${hourLabel(hover.h)}: ${num(grid[hover.d][hover.h])} ${noun}` : 'Hover a cell for details'}
      </p>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: '2.2rem repeat(24, minmax(0, 1fr))' }} onMouseLeave={() => setHover(null)}>
        {order.map((d) => (
          <div key={d} className="contents">
            <span className="pr-1 text-right text-[10px] leading-5 text-muted">{DOW_SHORT[d]}</span>
            {grid[d].map((v, h) => (
              <div key={h} title={`${DOW_SHORT[d]} ${hourLabel(h)}: ${v}`} onMouseEnter={() => setHover({ d, h })} className="h-5 rounded-[3px] outline-white hover:outline-2" style={{ background: seqColor(v, max) }} />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[9px] text-muted">{h % 6 === 0 ? hourLabel(h).replace(' ', '') : ''}</span>
        ))}
      </div>
      <Legend max={max} />
    </div>
  );
}

function Legend({ max }: { max: number }) {
  return (
    <div className="mt-2 flex items-center gap-1 text-[10px] text-muted">
      <span>0</span>
      {[0, 0.15, 0.3, 0.5, 0.7, 0.9, 1].map((f) => <span key={f} className="h-2.5 w-4 rounded-sm" style={{ background: seqColor(f * max, max) }} />)}
      <span>{num(max)}</span>
    </div>
  );
}

/** GitHub-style calendar of daily completions, weeks as columns. */
export function CalendarHeatmap({ days }: { days: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);
  if (!days.length) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  const firstDow = new Date(`${days[0].date}T12:00:00Z`).getUTCDay();
  const cells: ({ date: string; count: number } | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks = Math.ceil(cells.length / 7);
  const size = days.length > 400 ? 6 : 15;
  const gap = days.length > 400 ? 1 : 3;
  return (
    <div>
      <p className="mb-2 h-5 text-xs text-soft" aria-live="polite">{hover ? `${dateShort(hover.date)}: ${num(hover.count)} completions` : 'Hover a day for details'}</p>
      <div className="overflow-x-auto pb-1">
        <svg width={weeks * (size + gap)} height={7 * (size + gap)} onMouseLeave={() => setHover(null)} role="presentation">
          {cells.map((c, i) =>
            c ? (
              <rect key={c.date} x={Math.floor(i / 7) * (size + gap)} y={(i % 7) * (size + gap)} width={size} height={size} rx={2} fill={seqColor(c.count, max)} onMouseEnter={() => setHover(c)}>
                <title>{`${c.date}: ${c.count}`}</title>
              </rect>
            ) : null,
          )}
        </svg>
      </div>
      <Legend max={max} />
    </div>
  );
}
