import { useEffect, useMemo, useState } from 'react';
import { index, useYear } from '../../lib/data.ts';
import { go } from '../../lib/router.ts';
import { useNames } from '../../lib/shareSafe.tsx';
import { dateShort, hourLabel, hoursHuman, monthName, monthYear, num, num1, pct, plural } from '../../lib/format.ts';
import { CATEGORICAL, themeColor } from '../../lib/palette.ts';
import type { Counted, YearStats } from '../../shared/stats.ts';
import { CoverageNote, Header, HealthList } from '../../components/Shell.tsx';
import { Bar, Card, ChartCard, SafeHidden, Section, SortableTable, Swatch, Tile, type Column } from './ui.tsx';
import { CalendarHeatmap, DebtLine, DowHourHeatmap, MonthBars, SimpleBars, ThemeStack } from './charts.tsx';
import { SearchPanel } from './Search.tsx';
import { Compare } from './Compare.tsx';

const NAV = [
  ['overview', 'Overview'], ['classics', 'Classics'], ['habits', 'Habits'], ['timing', 'Procrastination'],
  ['themes', 'Themes'], ['routines', 'Routines'], ['lookup', 'Search'], ['compare', 'Compare'], ['health', 'Data health'],
] as const;

export default function Explore({ year, section }: { year: string; section?: string }) {
  const s = useYear(year);
  useEffect(() => {
    if (s && section) document.getElementById(section)?.scrollIntoView();
  }, [s, section]);
  const [theme, setTheme] = useState('all');
  const n = useNames();
  const themes = Object.keys(index!.entities.themes);

  return (
    <div className="min-h-screen">
      <Header
        right={
          <>
            <label className="sr-only" htmlFor="year-select">Year</label>
            <select id="year-select" value={year} onChange={(e) => go({ view: 'explore', year: e.target.value })} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm font-bold">
              {index!.years.map((y) => <option key={y.key} value={y.key}>{y.label}</option>)}
            </select>
            <button type="button" onClick={() => go({ view: 'story', year })} className="hidden rounded-full bg-gradient-to-r from-[#ff4d6d] to-[#7b2ff7] px-3 py-1.5 text-sm font-black sm:inline">
              ▶ Play
            </button>
          </>
        }
      />
      <nav aria-label="Sections" className="sticky top-[57px] z-20 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#/explore/${year}/${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }} className="shrink-0 rounded-full px-3 py-1 font-semibold text-soft hover:bg-panel hover:text-white">
              {label}
            </a>
          ))}
          <span className="ml-auto flex shrink-0 items-center gap-2 pl-3">
            <label htmlFor="theme-filter" className="text-xs font-bold uppercase tracking-wider text-muted">Theme</label>
            <select id="theme-filter" value={theme} onChange={(e) => setTheme(e.target.value)} className="max-w-44 rounded-full border border-line bg-panel px-3 py-1 text-sm font-semibold">
              <option value="all">All themes</option>
              {themes.map((t) => <option key={t} value={t}>{n.theme(t)}</option>)}
            </select>
          </span>
        </div>
      </nav>
      {!s ? (
        <p className="p-10 text-center text-muted">Loading…</p>
      ) : (
        <Body s={s} theme={theme} />
      )}
    </div>
  );
}

function Body({ s, theme }: { s: YearStats; theme: string }) {
  const n = useNames();
  const ents = index!.entities;
  const inTheme = (projectId: string | null | undefined) => theme === 'all' || (!!projectId && ents.projects[projectId]?.theme === theme);
  const c = s.classics;
  const h = s.habits;
  const isAll = s.key === 'all';
  const themeNote = theme !== 'all' ? <span className="text-safe"> · filtered to {n.theme(theme)}</span> : null;

  return (
    <main className="mx-auto max-w-6xl space-y-16 px-4 pb-32 pt-8">
      {/* OVERVIEW */}
      <section id="overview" aria-labelledby="overview-h" className="scroll-mt-28">
        <h1 id="overview-h" className="display text-6xl font-black sm:text-7xl">{s.label}</h1>
        <div className="mt-2"><CoverageNote coverage={s.coverage} label={s.label} /></div>
        {s.health.length > 0 && <div className="mt-3"><HealthList items={s.health} /></div>}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Completed" value={num(c.completions)} note={`${num(c.tasksFinished)} one-off · ${num(c.recurringCompletions)} routine`} />
          <Tile label="Created" value={num(c.created)} note={`${pct(c.completionRate.rate)} of those are done`} />
          <Tile label="Active days" value={num(c.activeDays)} note={`${num1(c.dailyAverage)} completions / day`} />
          <Tile label="Longest streak" value={c.longestStreak ? `${num(c.longestStreak.days)}d` : '—'} note={c.longestDrySpell ? `longest break ${plural(c.longestDrySpell.days, 'day')}` : undefined} />
          <Tile label="Subtasks done" value={num(c.subtasksCompleted)} />
          <Tile label="Comments written" value={num(c.commentsWritten)} />
          <Tile label="Projects touched" value={num(c.uniqueProjects)} note={`${num(c.uniqueLabels)} labels`} />
          <Tile label="Persona" value={<span className="text-2xl">{h.persona.title.replace(/^The /, '')}</span>} note={h.averageHour != null ? `avg finish ${hourLabel(h.averageHour % 24)}` : undefined} />
        </div>
      </section>

      {/* CLASSICS */}
      <Section id="classics" kicker="Productivity classics" title="What you got done">
        <TopLists s={s} inTheme={inTheme} themeNote={themeNote} />
        <ChartCard
          title="Priority mix"
          sub="Share of completions by priority (P1 = highest)."
          summary={`P1 ${c.priority.p1}, P2 ${c.priority.p2}, P3 ${c.priority.p3}, P4 ${c.priority.p4}.`}
          table={{ head: ['Priority', 'Completions'], rows: [['P1', c.priority.p1], ['P2', c.priority.p2], ['P3', c.priority.p3], ['P4 / none', c.priority.p4]] }}
        >
          <SimpleBars data={[{ name: 'P1', value: c.priority.p1 }, { name: 'P2', value: c.priority.p2 }, { name: 'P3', value: c.priority.p3 }, { name: 'P4', value: c.priority.p4 }]} label="Completions" />
        </ChartCard>
        {c.topProject && (
          <Card title={`#1 project: ${n.project(c.topProject.id)}`} sub={`${num(c.topProject.count)} completions · ${pct(c.topProject.share)} of everything`}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Busiest month</dt><dd className="font-bold">{c.topProject.busiestMonth ? `${monthYear(c.topProject.busiestMonth.month)} (${num(c.topProject.busiestMonth.count)})` : '—'}</dd></div>
              <div><dt className="text-muted">First finished</dt><dd className="font-bold">{c.topProject.firstTask ? <>{n.task(c.topProject.firstTask.task)} <span className="text-muted">· {dateShort(c.topProject.firstTask.ts.slice(0, 10))}</span></> : '—'}</dd></div>
              <div className="col-span-2"><dt className="text-muted">Biggest task tree</dt><dd className="font-bold">{c.topProject.biggestParent ? `${n.task(c.topProject.biggestParent.task)} · ${plural(c.topProject.biggestParent.subtasks, 'subtask')}` : '—'}</dd></div>
            </dl>
            {!n.safe && c.topProject.topWords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{c.topProject.topWords.map((w) => <span key={w.word} className="rounded-full bg-panel-2 px-2.5 py-0.5 text-xs font-semibold">{w.word} <span className="text-muted">{w.count}</span></span>)}</div>
            )}
          </Card>
        )}
        {c.busiestDay && (
          <Card title={`Busiest day: ${dateShort(c.busiestDay.date)}`} sub={`${num(c.busiestDay.count)} completions`}>
            {n.safe ? <SafeHidden what="What you finished" count={c.busiestDay.count} /> : (
              <ul className="max-h-56 space-y-1 overflow-auto text-sm">
                {c.busiestDay.tasks.map((t, i) => <li key={i} className="flex items-center"><Swatch color={n.projectColor(t.projectId)} /><span>{n.task(t)}</span></li>)}
              </ul>
            )}
          </Card>
        )}
        <Card title="Just for fun" sub="An invented scale, not real Todoist data.">
          <p className="display mb-2 text-5xl font-black">Top {c.crusher.topPercent}%</p>
          <p className="text-sm text-muted">of task-crushers, based on your {c.crusher.basis}.</p>
        </Card>
        <Card title="Account" sub={s.bonus.joinedAt ? `Member since ${dateShort(s.bonus.joinedAt.slice(0, 10))} · ${num(s.bonus.accountAgeDays ?? 0)} days` : undefined}>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {c.karma && <Stat k="Karma" v={`${num(c.karma.current)} ${c.karma.trend === 'up' ? '↑' : c.karma.trend === 'down' ? '↓' : ''}`} />}
            <Stat k="Active projects" v={num(s.bonus.totals.activeProjects)} />
            <Stat k="Archived" v={num(s.bonus.totals.archivedProjects)} />
            <Stat k="Labels" v={num(s.bonus.totals.labels)} />
            <Stat k="Filters" v={num(s.bonus.totals.filters)} />
            <Stat k="Reminders" v={num(s.bonus.totals.reminders)} />
            <Stat k="Attachments" v={num(s.bonus.totals.attachments)} />
            <Stat k="Comments (all)" v={num(s.bonus.totals.comments)} />
            <Stat k="Shared projects" v={s.bonus.shared.collaborators ? num(s.bonus.shared.sharedProjects) : 'solo'} />
          </dl>
        </Card>
      </Section>

      {/* HABITS */}
      <Section id="habits" kicker="Habits" title="When you get things done">
        <ChartCard wide title="Completions by month" summary={`Monthly completions for ${s.label}.`} table={{ head: ['Month', 'Completions'], rows: h.byMonth.map((m) => [monthYear(m.month), m.count]) }}>
          <MonthBars data={h.byMonth} multiYear={isAll} />
        </ChartCard>
        <ChartCard wide title="Every day" sub="Daily completions, GitHub-style." summary={`Calendar of ${h.calendar.length} days.`} table={{ head: ['Date', 'Completions'], rows: h.calendar.filter((d) => d.count > 0).map((d) => [d.date, d.count]) }}>
          <CalendarHeatmap days={h.calendar} />
        </ChartCard>
        <ChartCard title="When you finish" sub="Completions by weekday and hour (New York time)." summary="Day-of-week by hour heatmap of completions." table={heatTable(h.completionHeatmap)}>
          <DowHourHeatmap grid={h.completionHeatmap} noun="completions" />
        </ChartCard>
        <ChartCard title="When you plan" sub="Tasks created by weekday and hour." summary="Day-of-week by hour heatmap of task creation." table={heatTable(h.creationHeatmap)}>
          <DowHourHeatmap grid={h.creationHeatmap} noun="tasks created" />
        </ChartCard>
        <Card title={h.persona.title} sub={h.persona.blurb}>
          <ul className="space-y-2 text-sm">
            {Object.entries(h.persona.scores).map(([k, v]) => (
              <li key={k}><div className="mb-1 flex justify-between"><span className="capitalize text-soft">{k.replace('-', ' ')}</span><span className="tabular font-bold">{pct(v)}</span></div><Bar frac={v} /></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Early bird = share finished 5–10am · Night owl = 9pm–4am · Sprinter = last-minute finishes + half of late ones, among dated tasks.</p>
        </Card>
        <Card title="Weekdays vs. weekends">
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Per weekday" value={num1(h.weekdayWeekend.weekdayPerDay)} note={`${num(h.weekdayWeekend.weekday)} total`} />
            <Tile label="Per weekend day" value={num1(h.weekdayWeekend.weekendPerDay)} note={`${num(h.weekdayWeekend.weekend)} total`} />
          </div>
        </Card>
      </Section>

      {/* PROCRASTINATION */}
      <Section id="timing" kicker="Procrastination" title="Deadlines, delays & do-overs">
        <ChartCard title="Time from added to done" sub={`One-off tasks · median ${hoursHuman(h.timeToComplete.medianHours)}`} summary={`Median ${hoursHuman(h.timeToComplete.medianHours)}.`} table={{ head: ['Bucket', 'Tasks'], rows: h.timeToComplete.buckets.map((b) => [b.label, b.count]) }}>
          <SimpleBars data={h.timeToComplete.buckets.map((b) => ({ name: b.label, value: b.count }))} color={CATEGORICAL[2]} label="Tasks" />
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Stat k="Fastest project" v={h.timeToComplete.fastestProject ? `${n.project(h.timeToComplete.fastestProject.id)} · ${hoursHuman(h.timeToComplete.fastestProject.medianHours)}` : '—'} />
            <Stat k="Slowest project" v={h.timeToComplete.slowestProject ? `${n.project(h.timeToComplete.slowestProject.id)} · ${hoursHuman(h.timeToComplete.slowestProject.medianHours)}` : '—'} />
          </dl>
        </ChartCard>
        <Card title="On time or late?" sub={`${num(h.dueTiming.withDue)} completions had a due date; ${num(h.dueTiming.noDue)} didn't.`}>
          <Stacked parts={[
            { label: 'Early', value: h.dueTiming.early, color: CATEGORICAL[2] },
            { label: 'On the day', value: h.dueTiming.onDay, color: CATEGORICAL[0] },
            { label: 'Late', value: h.dueTiming.late, color: CATEGORICAL[1] },
          ]} />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat k="Due today, done today" v={pct(h.dueTiming.dueTodayDoneToday)} />
            <Stat k="Last-minute (final 3 hrs)" v={`${pct(h.dueTiming.lastMinute.rate)} · ${num(h.dueTiming.lastMinute.count)}`} />
            <Stat k="Avg days late (when late)" v={h.dueTiming.avgDaysLate != null ? num1(h.dueTiming.avgDaysLate) : '—'} />
            <Stat k="Deadlines met / missed" v={h.deadlines ? `${num(h.deadlines.met)} / ${num(h.deadlines.missed)}` : 'none set'} />
          </dl>
        </Card>
        <Card title="Reschedules" sub={`${num(h.reschedules.total)} due-date changes · ${num(h.reschedules.pushedLater)} later, ${num(h.reschedules.pulledEarlier)} earlier · ${num(h.reschedules.tasksRescheduled)} tasks`}>
          <ol className="space-y-1 text-sm">
            {h.reschedules.mostRescheduled.filter((r) => inTheme(r.task.projectId)).map((r, i) => (
              <li key={i} className="flex items-center gap-2"><span className="w-5 text-muted">{i + 1}</span><Swatch color={n.projectColor(r.task.projectId)} /><span className="min-w-0 flex-1 truncate">{n.task(r.task)}</span><span className="tabular font-bold">{num(r.count)}×</span></li>
            ))}
          </ol>
        </Card>
        <ChartCard title="Task debt" sub="Open one-off tasks over time (created − finished − deleted, cumulative)." summary="Cumulative backlog by month." table={{ head: ['Month', 'Created', 'Finished', 'Deleted', 'Backlog'], rows: h.taskDebt.map((d) => [monthYear(d.month), d.created, d.finished, d.deleted, d.cumulative]) }}>
          <DebtLine data={h.taskDebt} />
        </ChartCard>
        <Card title="Planning style">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat k="Biggest planning burst" v={h.planningBurst ? `${num(h.planningBurst.count)} tasks · ${dateShort(h.planningBurst.date)} ${hourLabel(h.planningBurst.hour)}` : '—'} />
            <Stat k="Sunday-planner score" v={`${num1(h.sundayPlanner.score)}× (${pct(h.sundayPlanner.sundayShare)} added on Sundays; 1× = average day)`} />
            <Stat k="Captured & finished same day" v={`${pct(h.sameDay.rate)} · ${num(h.sameDay.count)} of ${num(h.sameDay.of)}`} />
            <Stat k="Inbox-zero days (approx.)" v={h.inboxZero ? `${num(h.inboxZero.days)} · best run ${plural(h.inboxZero.longestRun, 'day')}` : '—'} />
          </dl>
        </Card>
        <Card title="Lingering & still open">
          <dl className="space-y-3 text-sm">
            <Stat k="Longest wait before done" v={h.timeToComplete.longestLingering ? `${n.task(h.timeToComplete.longestLingering.task)} · ${plural(h.timeToComplete.longestLingering.days, 'day')}` : '—'} />
            <Stat k="Oldest task still open" v={h.oldestOpen ? `${n.task(h.oldestOpen.task)} · added ${dateShort(h.oldestOpen.createdAt.slice(0, 10))} (${plural(h.oldestOpen.ageDays, 'day')})` : isAll || s.key === index!.years[0].key ? 'Nothing open. Wow.' : 'Shown for the latest year and all time.'} />
          </dl>
        </Card>
      </Section>

      {/* THEMES */}
      <ThemesSection s={s} theme={theme} inTheme={inTheme} />

      {/* ROUTINES */}
      <RoutinesSection s={s} inTheme={inTheme} themeNote={themeNote} />

      <Section id="lookup" kicker="Search" title="Look anything up">
        <SearchPanel />
      </Section>

      <Section id="compare" kicker="Year over year" title="Compare two years">
        <Compare current={s.key} />
      </Section>

      <Section id="health" kicker="Data health" title="What your export includes">
        <Card wide title="Coverage & availability" sub="Stats that the export can't support are switched off rather than shown as zero.">
          <HealthList items={[...index!.health, ...s.health]} />
        </Card>
      </Section>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="font-bold">{v}</dd>
    </div>
  );
}

function Stacked({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-5 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.value / total)}`).join(', ')}>
        {parts.map((p) => <div key={p.label} title={`${p.label}: ${num(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
        {parts.map((p) => <li key={p.label}><Swatch color={p.color} />{p.label} <span className="tabular font-bold text-white">{pct(p.value / total)}</span> ({num(p.value)})</li>)}
      </ul>
    </div>
  );
}

function heatTable(grid: number[][]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { head: ['Day', ...Array.from({ length: 24 }, (_, i) => String(i))], rows: grid.map((row, d) => [days[d], ...row]) };
}

function TopLists({ s, inTheme, themeNote }: { s: YearStats; inTheme: (id: string) => boolean; themeNote: React.ReactNode }) {
  const n = useNames();
  const [tab, setTab] = useState<'projects' | 'labels' | 'sections'>('projects');
  const c = s.classics;
  const rows: Counted[] = tab === 'projects' ? c.topProjects.filter((p) => inTheme(p.id)) : tab === 'labels' ? c.topLabels : c.topSections;
  const name = (id: string) => (tab === 'projects' ? n.project(id) : tab === 'labels' ? `@${n.label(id)}` : n.section(id));
  const color = (id: string) => (tab === 'projects' ? n.projectColor(id) : tab === 'labels' ? index!.entities.labels[id]?.color ?? '#808080' : index!.entities.sections[id]?.color ?? '#808080');
  const columns: Column<Counted>[] = [
    { key: 'name', label: 'Name', value: (r) => name(r.id).toLowerCase(), render: (r) => <span className="flex items-center"><Swatch color={color(r.id)} />{name(r.id)}{tab === 'projects' && index!.entities.projects[r.id]?.archived && <span className="ml-2 rounded bg-panel-2 px-1.5 text-[10px] text-muted">archived</span>}</span> },
    ...(tab === 'projects' ? [{ key: 'theme', label: 'Theme', value: (r: Counted) => n.theme(index!.entities.projects[r.id]?.theme).toLowerCase(), render: (r: Counted) => <span className="text-soft">{n.theme(index!.entities.projects[r.id]?.theme)}</span> }] : []),
    { key: 'count', label: 'Done', value: (r) => r.count, numeric: true },
    { key: 'share', label: 'Share', value: (r) => r.share, render: (r) => pct(r.share, 1), numeric: true },
  ];
  return (
    <Card
      wide
      title="Top 50"
      sub={<>Ranked by completions. Click a column to sort.{tab !== 'projects' ? null : themeNote}</>}
      action={
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="List" className="flex rounded-full border border-line p-0.5 text-xs font-bold">
            {(['projects', 'labels', 'sections'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`rounded-full px-3 py-1 capitalize ${tab === t ? 'bg-white text-ink' : 'text-soft'}`}>{t}</button>
            ))}
          </div>
          <div className="flex rounded-full border border-line p-0.5 text-xs font-bold" title="The export has almost no task durations, so the duration ranking is unavailable.">
            <span className="rounded-full bg-white px-3 py-1 text-ink">Count</span>
            <button type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded-full px-3 py-1 text-muted line-through">Duration</button>
          </div>
        </div>
      }
    >
      {rows.length ? <SortableTable key={tab} rows={rows} columns={columns} initialSort="count" caption={`Top ${tab}`} /> : <p className="text-sm text-muted">Nothing here for this filter.</p>}
    </Card>
  );
}

function ThemesSection({ s, theme, inTheme }: { s: YearStats; theme: string; inTheme: (id: string) => boolean }) {
  const n = useNames();
  const t = s.themes;
  const order = Object.keys(index!.entities.themes);
  const present = useMemo(() => {
    const set = new Set(t.byMonth.flatMap((m) => Object.keys(m.counts)));
    const list = order.filter((x) => set.has(x));
    if (set.has('Other')) list.push('Other');
    return theme === 'all' ? list : list.filter((x) => x === theme);
  }, [t, order, theme]);
  const stackData = t.byMonth.map((m) => ({ month: m.month, ...m.counts }));
  const words = theme === 'all' ? t.keywords : t.keywordsByTheme[theme] ?? [];
  const maxWord = words[0]?.count ?? 1;
  const milestones = t.milestones.filter((m) => inTheme(m.task.projectId));
  return (
    <Section id="themes" kicker="Life themes" title="What it was all about">
      <Card title="Theme share" sub="Share of all completions.">
        <ul className="space-y-2.5 text-sm">
          {t.share.slice(0, 10).map((x) => (
            <li key={x.theme} className={theme !== 'all' && theme !== x.theme ? 'opacity-40' : ''}>
              <div className="mb-1 flex justify-between"><span className="flex items-center font-semibold"><Swatch color={themeColor(x.theme)} />{n.theme(x.theme)}</span><span className="tabular text-soft">{pct(x.share)} · {num(x.count)}</span></div>
              <Bar frac={x.share / (t.share[0]?.share || 1)} color={themeColor(x.theme)} />
            </li>
          ))}
        </ul>
        {!index!.themesConfigured && <p className="mt-3 text-xs text-muted">Tip: group projects into themes in <code>config/themes.local.json</code>.</p>}
      </Card>
      <ChartCard title="Themes by month" sub="Top 8 themes, the rest folded into Other." summary="Stacked monthly completions by theme." table={{ head: ['Month', ...present.map((p) => n.theme(p))], rows: t.byMonth.map((m) => [monthYear(m.month), ...present.map((p) => m.counts[p] ?? 0)]) }}>
        <ThemeStack data={stackData} themes={present} label={(x) => (x === 'Other' ? 'Other' : n.theme(x))} />
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-soft">{present.map((p) => <li key={p}><Swatch color={p === 'Other' ? '#6b6b80' : themeColor(p)} />{p === 'Other' ? 'Other' : n.theme(p)}</li>)}</ul>
      </ChartCard>
      <Card wide title="Seasons of your year" sub="Each month's #1 theme and project.">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {t.seasons.map((x) => (
            <li key={x.month} className="rounded-xl border border-line bg-ink/40 p-3" style={{ borderTopColor: x.topTheme ? themeColor(x.topTheme) : undefined, borderTopWidth: 3 }}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">{isMulti(t.seasons) ? monthYear(x.month) : monthName(x.month)}</p>
              <p className="truncate font-extrabold">{n.theme(x.topTheme)}</p>
              <p className="truncate text-xs text-soft">{n.project(x.topProject)}</p>
              <p className="tabular text-xs text-muted">{num(x.count)} done</p>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="New & quiet" sub={s.key === 'all' ? 'Projects that went quiet (60+ days without completions before the data ends).' : 'New this year in your top 10, and projects that went quiet.'}>
        {t.newProjectsInTop10.length > 0 && (
          <><p className="text-xs font-bold uppercase tracking-wider text-muted">New breakouts</p>
            <ul className="mb-3 mt-1 space-y-1 text-sm">{t.newProjectsInTop10.filter(inTheme).map((id) => <li key={id}><Swatch color={n.projectColor(id)} />{n.project(id)}</li>)}</ul></>
        )}
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Went quiet</p>
        <ul className="mt-1 space-y-1 text-sm">
          {t.wentQuiet.filter((q) => inTheme(q.id)).map((q) => <li key={q.id} className="flex"><span className="flex-1"><Swatch color={n.projectColor(q.id)} />{n.project(q.id)}</span><span className="text-muted">last active {monthYear(q.lastActiveMonth)}</span></li>)}
          {t.wentQuiet.length === 0 && <li className="text-muted">Everything stayed active.</li>}
        </ul>
      </Card>
      <Card title="Label combos" sub="Labels most often used together.">
        <ul className="space-y-1 text-sm">
          {t.labelCombos.map((lc) => <li key={lc.labels.join('+')} className="flex"><span className="flex-1">{lc.labels.map((l) => `@${n.label(l)}`).join(' + ')}</span><span className="tabular font-bold">{num(lc.count)}</span></li>)}
          {t.labelCombos.length === 0 && <li className="text-muted">No tasks with two or more labels.</li>}
        </ul>
      </Card>
      <Card title={theme === 'all' ? 'Your words' : `Your words in ${n.theme(theme)}`} sub="From the titles of tasks you finished; common words removed.">
        {n.safe ? <SafeHidden what="Keyword cloud" count={words.length} /> : (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-tight">
            {words.slice(0, 60).map((w) => <span key={w.word} title={`${w.word}: ${w.count} tasks`} className="font-extrabold" style={{ fontSize: `${0.75 + 1.4 * Math.sqrt(w.count / maxWord)}rem`, opacity: 0.5 + 0.5 * (w.count / maxWord) }}>{w.word}</span>)}
            {words.length === 0 && <span className="text-sm text-muted">No words for this filter.</span>}
          </p>
        )}
      </Card>
      <Card wide title="Milestone spotlight" sub="Finished tasks matching your milestone keywords (set them in config/themes.local.json).">
        {n.safe ? <SafeHidden what="Milestones" count={milestones.length} /> : milestones.length === 0 ? <p className="text-sm text-muted">No milestones matched.</p> : (
          <div className="max-h-96 overflow-auto"><ol className="relative ml-2 space-y-2 border-l-2 border-line pl-5">
            {[...milestones].reverse().map((m, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-ink" style={{ background: n.projectColor(m.task.projectId) }} aria-hidden="true" />
                <span className="tabular text-muted">{dateShort(m.ts.slice(0, 10))}</span> · <span className="font-semibold">{n.task(m.task)}</span> <span className="text-xs text-muted">({m.keyword})</span>
              </li>
            ))}
          </ol></div>
        )}
      </Card>
    </Section>
  );
}

const isMulti = (seasons: { month: string }[]) => new Set(seasons.map((x) => x.month.slice(0, 4))).size > 1;

function RoutinesSection({ s, inTheme, themeNote }: { s: YearStats; inTheme: (id: string) => boolean; themeNote: React.ReactNode }) {
  const n = useNames();
  const r = s.routines;
  type A = (typeof r.adherence)[number];
  const cols: Column<A>[] = [
    { key: 'task', label: 'Routine', value: (a) => n.task(a.task).toLowerCase(), render: (a) => <span className="flex items-center"><Swatch color={n.projectColor(a.task.projectId)} />{n.task(a.task)}</span> },
    { key: 'rule', label: 'Rule', value: (a) => a.rule },
    { key: 'completed', label: 'Done', value: (a) => a.completed, numeric: true, render: (a) => `${num(a.completed)} / ${num(a.expected)}` },
    { key: 'rate', label: 'Adherence', value: (a) => a.rate, numeric: true, render: (a) => pct(a.rate) },
    { key: 'chain', label: 'Best chain', value: (a) => a.longestChain, numeric: true, render: (a) => `${num(a.longestChain)} ${a.chainUnit}` },
  ];
  return (
    <Section id="routines" kicker="Recurring tasks" title="Routines & habits">
      <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-4">
        <Tile label="Recurring tasks" value={num(r.recurringTasks)} />
        <Tile label="Check-ins" value={num(r.recurringCompletions)} />
        <Tile label="With a readable rule" value={num(r.adherence.length)} note={`${num(r.unparsedRecurring)} without (no adherence)`} />
        <Tile label="Faded away" value={num(r.died.length)} />
      </div>
      <Card wide title="Adherence" sub={<>Completions vs. expected occurrences from the recurrence rule, and the longest unbroken chain.{themeNote}</>}>
        {r.adherence.length ? <SortableTable rows={r.adherence.filter((a) => inTheme(a.task.projectId))} columns={cols} initialSort="completed" caption="Routine adherence" /> : <p className="text-sm text-muted">No routines with a readable rule in this period.</p>}
      </Card>
      <Card title="Most completed routines">
        <ol className="space-y-1 text-sm">{r.mostCompleted.filter((m) => inTheme(m.task.projectId)).map((m, i) => <li key={m.taskId} className="flex items-center gap-2"><span className="w-5 text-muted">{i + 1}</span><Swatch color={n.projectColor(m.task.projectId)} /><span className="min-w-0 flex-1 truncate">{n.task(m.task)}</span><span className="tabular font-bold">{num(m.count)}</span></li>)}</ol>
      </Card>
      <Card title="Routines that faded" sub="5+ check-ins, then stopped well before the data ends.">
        <ul className="space-y-1 text-sm">
          {r.died.filter((d) => inTheme(d.task.projectId)).map((d) => <li key={d.taskId} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{n.task(d.task)}</span><span className="text-muted">last {dateShort(d.lastCompleted)} · {num(d.completions)}×</span></li>)}
          {r.died.length === 0 && <li className="text-muted">None. Every routine made it.</li>}
        </ul>
      </Card>
      <Card wide title="Things you keep re-adding by hand" sub="Most-repeated one-off task titles (numbers and punctuation ignored).">
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {r.repeatedTitles.filter((x) => inTheme(x.task.projectId)).map((x, i) => <li key={i} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{n.task(x.task)}</span><span className="tabular font-bold">{num(x.count)}×</span></li>)}
          {r.repeatedTitles.length === 0 && <li className="text-muted">No repeats.</li>}
        </ul>
      </Card>
    </Section>
  );
}
