import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { YearStats } from '../../shared/stats.ts';
import { compareYears, describeShift } from '../../shared/yoy.ts';
import type { useNames } from '../../lib/shareSafe.tsx';
import { dateLong, hourLabel, hoursHuman, monthName, num, num1, pct, plural, weekdayOf } from '../../lib/format.ts';
import { projectPalette, SLIDE_PALETTES } from '../../lib/palette.ts';
import { Big, Chip, CountUp, Hidden, Kicker, RankList, Rise, Sub } from './parts.tsx';
import { Logo } from '../../components/Shell.tsx';

type Names = ReturnType<typeof useNames>;
export interface SlideDef {
  id: string;
  palette: { bg: string; ink: string; accent: string };
  alt: string; // text equivalent for screen readers
  el: ReactNode;
}

const P = SLIDE_PALETTES;

export function buildSlides(s: YearStats, n: Names, prev: YearStats | null): SlideDef[] {
  const c = s.classics;
  const h = s.habits;
  const t = s.themes;
  const r = s.routines;
  const isAll = s.key === 'all';
  const period = isAll ? 'all time' : s.label;
  const thisYear = isAll ? 'so far' : 'this year';
  const out: (SlideDef | false | null | undefined)[] = [];

  // 1. intro
  out.push({
    id: 'intro', palette: P[0], alt: `Jack's Todoist Wrapped, ${period}.`,
    el: (
      <div className="flex h-full flex-col justify-between">
        <Rise><Logo size={44} /></Rise>
        <div>
          <Kicker>Jack's Todoist Wrapped</Kicker>
          <Big i={1}>{isAll ? 'All of it.' : s.label}</Big>
          <Sub>Here’s everything you got done{isAll ? ' since day one' : ''}. Tap to begin.</Sub>
        </div>
        <Rise i={3}><p className="text-sm font-semibold opacity-75">{s.coverage.firstDate ? `${dateLong(s.coverage.firstDate)} – ${dateLong(s.coverage.lastDate!)}` : ''}</p></Rise>
      </div>
    ),
  });

  // 2. total
  out.push(c.completions > 0 && {
    id: 'total', palette: P[1], alt: `You completed ${num(c.completions)} tasks ${thisYear}.`,
    el: (
      <Center>
        <Kicker>You checked off</Kicker>
        <Big i={1}><CountUp value={c.completions} /></Big>
        <Sub>things {thisYear}.</Sub>
        <Rise i={3} className="mt-6 flex flex-wrap gap-2">
          <Chip>{plural(c.tasksFinished, 'one-off task')}</Chip>
          <Chip>{plural(c.recurringCompletions, 'routine check-in')}</Chip>
          {c.subtasksCompleted > 0 && <Chip>{plural(c.subtasksCompleted, 'subtask')}</Chip>}
        </Rise>
      </Center>
    ),
  });

  // 3. pace
  out.push(c.completions > 0 && {
    id: 'pace', palette: P[2], alt: `That's ${num1(c.dailyAverage)} per day, active on ${c.activeDays} days.`,
    el: (
      <Center>
        <Kicker>That works out to</Kicker>
        <Big i={1}><CountUp value={c.dailyAverage} format={num1} /></Big>
        <Sub>tasks a day, every day.</Sub>
        <Rise i={3}><p className="mt-6 text-lg font-bold">You showed up on <span className="underline decoration-4 underline-offset-4">{num(c.activeDays)}</span> of {num(s.coverage.daysCovered)} days.</p></Rise>
      </Center>
    ),
  });

  // 4. created
  out.push(c.created > 0 && {
    id: 'created', palette: P[3], alt: `You added ${num(c.created)} new tasks and finished ${pct(c.completionRate.rate)} of them.`,
    el: (
      <Center>
        <Kicker>You captured</Kicker>
        <Big i={1}><CountUp value={c.created} /></Big>
        <Sub>new tasks…</Sub>
        <Rise i={3}><p className="display mt-8 text-6xl font-black">{pct(c.completionRate.rate)}</p></Rise>
        <Sub i={4}>of them are already done.</Sub>
      </Center>
    ),
  });

  // 5. busiest day
  out.push(c.busiestDay && {
    id: 'busiest', palette: P[4], alt: `Your busiest day was ${weekdayOf(c.busiestDay.date)}, ${dateLong(c.busiestDay.date)}, with ${c.busiestDay.count} completions.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Your biggest day</Kicker>
        <Big i={1} size="md">{weekdayOf(c.busiestDay.date)}, {dateLong(c.busiestDay.date, false)}</Big>
        <Sub><span className="display text-5xl font-black">{num(c.busiestDay.count)}</span> things done in one day.</Sub>
        {n.safe ? <Hidden what="What you finished" /> : (
          <ul className="mt-5 space-y-1.5 text-base font-semibold">
            {c.busiestDay.tasks.slice(0, 7).map((x, i) => (
              <Rise key={i} i={3 + i}><li className="truncate">✦ {n.task(x)}</li></Rise>
            ))}
            {c.busiestDay.count > 7 && <Rise i={10}><li className="opacity-70">+ {num(c.busiestDay.count - 7)} more</li></Rise>}
          </ul>
        )}
      </div>
    ),
  });

  // 6. streak
  out.push(c.longestStreak && c.longestStreak.days > 1 && {
    id: 'streak', palette: P[5], alt: `Longest streak: ${c.longestStreak.days} days in a row.`,
    el: (
      <Center>
        <Kicker>Longest streak</Kicker>
        <Big i={1}><CountUp value={c.longestStreak.days} /></Big>
        <Sub>days in a row with at least one thing done.</Sub>
        <Rise i={3}><p className="mt-3 text-base font-semibold opacity-80">{dateLong(c.longestStreak.start)} → {dateLong(c.longestStreak.end)}</p></Rise>
        {c.longestDrySpell && c.longestDrySpell.days > 0 && (
          <Rise i={4}><p className="mt-10 rounded-2xl bg-white/10 p-4 text-base font-semibold">Longest break: {plural(c.longestDrySpell.days, 'day')} off ({dateLong(c.longestDrySpell.start, false)}{c.longestDrySpell.days > 1 ? ` – ${dateLong(c.longestDrySpell.end, false)}` : ''}). Rest counts too.</p></Rise>
        )}
      </Center>
    ),
  });

  // 7. #1 project
  const tp = c.topProject;
  out.push(tp && {
    id: 'top-project', palette: projectPalette(n.projectColor(tp.id)), alt: `Your number one project was ${n.project(tp.id)} with ${num(tp.count)} completions, ${pct(tp.share)} of everything.`,
    el: (
      <Center>
        <Kicker>Your #1 project</Kicker>
        <Big i={1} size="lg">{n.project(tp.id)}</Big>
        <Sub><CountUp value={tp.count} /> completions, {pct(tp.share)} of everything you did.</Sub>
      </Center>
    ),
  });

  // 8. top 5 projects
  out.push(c.topProjects.length >= 2 && {
    id: 'top-projects', palette: P[6], alt: `Top projects: ${c.topProjects.slice(0, 5).map((x, i) => `${i + 1}. ${n.project(x.id)} (${x.count})`).join(', ')}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Where your energy went</Kicker>
        <Big i={1} size="md">Top projects</Big>
        <RankList accent="#fff" rows={c.topProjects.slice(0, 5).map((x) => ({ label: n.project(x.id), value: num(x.count), frac: x.count / c.topProjects[0].count, color: n.projectColor(x.id) }))} />
      </div>
    ),
  });

  // 9. deep dive
  out.push(tp && (tp.firstTask || tp.busiestMonth) && {
    id: 'deep-dive', palette: P[7], alt: `Inside ${n.project(tp.id)}: busiest month ${tp.busiestMonth ? monthName(tp.busiestMonth.month) : 'n/a'}.`,
    el: (
      <div className="flex h-full flex-col justify-center gap-5">
        <Kicker>Inside {n.project(tp.id)}</Kicker>
        {tp.firstTask && (
          <Rise i={1}>
            <p className="text-sm font-bold uppercase tracking-widest opacity-70">First thing you finished there</p>
            <p className="mt-1 text-2xl font-black">{n.task(tp.firstTask.task)}</p>
          </Rise>
        )}
        {tp.busiestMonth && (
          <Rise i={2}>
            <p className="text-sm font-bold uppercase tracking-widest opacity-70">Busiest month</p>
            <p className="display text-5xl font-black">{isAll ? `${monthName(tp.busiestMonth.month)} ${tp.busiestMonth.month.slice(0, 4)}` : monthName(tp.busiestMonth.month)}</p>
            <p className="font-semibold">{plural(tp.busiestMonth.count, 'completion')}</p>
          </Rise>
        )}
        {tp.biggestParent && (
          <Rise i={3}>
            <p className="text-sm font-bold uppercase tracking-widest opacity-70">Biggest task tree</p>
            <p className="text-xl font-black">{n.task(tp.biggestParent.task)}</p>
            <p className="font-semibold">{plural(tp.biggestParent.subtasks, 'subtask')} done</p>
          </Rise>
        )}
        {!n.safe && tp.topWords.length > 0 && (
          <Rise i={4} className="flex flex-wrap gap-2">{tp.topWords.slice(0, 6).map((w) => <Chip key={w.word}>{w.word}</Chip>)}</Rise>
        )}
      </div>
    ),
  });

  // 10. priority
  const pr = c.priority;
  const prTotal = pr.p1 + pr.p2 + pr.p3 + pr.p4;
  out.push(prTotal > 0 && {
    id: 'priority', palette: P[8], alt: `Priority mix: P1 ${pct(pr.p1 / prTotal)}, P2 ${pct(pr.p2 / prTotal)}, P3 ${pct(pr.p3 / prTotal)}, no priority ${pct(pr.p4 / prTotal)}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Priorities</Kicker>
        <Big i={1}>{pct(pr.p1 / prTotal)}</Big>
        <Sub>of what you finished was flagged P1.</Sub>
        <RankList accent="#260018" rows={[
          { label: 'P1 · urgent', value: num(pr.p1), frac: pr.p1 / prTotal },
          { label: 'P2', value: num(pr.p2), frac: pr.p2 / prTotal },
          { label: 'P3', value: num(pr.p3), frac: pr.p3 / prTotal },
          { label: 'P4 · no priority', value: num(pr.p4), frac: pr.p4 / prTotal },
        ]} />
      </div>
    ),
  });

  // 11. labels
  out.push(c.topLabels.length >= 2 && {
    id: 'labels', palette: P[9], alt: `Top labels: ${c.topLabels.slice(0, 5).map((x) => n.label(x.id)).join(', ')}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Your favorite labels</Kicker>
        <Big i={1} size="md">@{n.label(c.topLabels[0].id)}</Big>
        <RankList accent="#0d0221" rows={c.topLabels.slice(0, 5).map((x) => ({ label: n.label(x.id), value: num(x.count), frac: x.count / c.topLabels[0].count }))} />
      </div>
    ),
  });

  // 12. persona
  out.push(c.completions >= 20 && {
    id: 'persona', palette: h.persona.id === 'night-owl' ? P[4] : h.persona.id === 'early-bird' ? P[2] : h.persona.id === 'deadline-sprinter' ? P[0] : P[3],
    alt: `Your persona: ${h.persona.title}. ${h.persona.blurb}`,
    el: (
      <Center>
        <Kicker>You are</Kicker>
        <Rise i={1}><PersonaGlyph id={h.persona.id} /></Rise>
        <Big i={2} size="md">{h.persona.title}</Big>
        <Sub i={3}>{h.persona.blurb}</Sub>
        {h.averageHour != null && <Rise i={4}><p className="mt-4 font-bold opacity-85">Your average finish time: {hourLabel(h.averageHour % 24)}</p></Rise>}
      </Center>
    ),
  });

  // 13. clock
  const hours = Array.from({ length: 24 }, (_, hr) => h.completionHeatmap.reduce((sum, row) => sum + row[hr], 0));
  const peak = hours.indexOf(Math.max(...hours));
  out.push(c.completions >= 20 && {
    id: 'clock', palette: P[5], alt: `Completions by hour of day; peak hour ${hourLabel(peak)}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Power hour</Kicker>
        <Big i={1} size="lg">{hourLabel(peak)}</Big>
        <Sub>is when you finish the most.</Sub>
        <Rise i={3}>
          <div className="mt-8 flex h-40 items-end gap-[3px]" aria-hidden="true">
            {hours.map((v, i) => (
              <motion.div key={i} className="flex-1 rounded-t-[3px]" style={{ background: i === peak ? '#ff5a5f' : 'rgba(255,255,255,0.55)' }}
                initial={{ height: 0 }} animate={{ height: `${Math.max(2, (v / Math.max(...hours)) * 100)}%` }} transition={{ delay: 0.3 + i * 0.02, duration: 0.6 }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs font-bold opacity-70"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
        </Rise>
      </div>
    ),
  });

  // 14. weekday vs weekend
  const ww = h.weekdayWeekend;
  out.push(ww.weekday + ww.weekend > 0 && {
    id: 'weekend', palette: P[3], alt: `${num1(ww.weekdayPerDay)} per weekday versus ${num1(ww.weekendPerDay)} per weekend day.`,
    el: (
      <Center>
        <Kicker>Weekdays vs. weekends</Kicker>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Rise i={1}><div className="rounded-3xl bg-black/15 p-5"><p className="display text-6xl font-black"><CountUp value={ww.weekdayPerDay} format={num1} /></p><p className="font-bold">per weekday</p></div></Rise>
          <Rise i={2}><div className="rounded-3xl bg-black/15 p-5"><p className="display text-6xl font-black"><CountUp value={ww.weekendPerDay} format={num1} /></p><p className="font-bold">per weekend day</p></div></Rise>
        </div>
        <Sub i={3}>{ww.weekendPerDay >= ww.weekdayPerDay ? 'Weekends are for getting things done, apparently.' : ww.weekendPerDay > ww.weekdayPerDay * 0.6 ? 'Weekends slow you down, but not by much.' : 'You protect your weekends. Respect.'}</Sub>
      </Center>
    ),
  });

  // 15. procrastination
  const ttc = h.timeToComplete;
  out.push(ttc.count > 0 && {
    id: 'ttc', palette: P[7], alt: `Median time from adding a task to finishing it: ${hoursHuman(ttc.medianHours)}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>From “add” to “done”</Kicker>
        <Big i={1} size="lg">{hoursHuman(ttc.medianHours)}</Big>
        <Sub>is your typical turnaround.</Sub>
        {ttc.longestLingering && (
          <Rise i={3}>
            <div className="mt-8 rounded-2xl bg-black/10 p-4">
              <p className="text-sm font-bold uppercase tracking-widest opacity-70">The one that lingered</p>
              <p className="mt-1 text-xl font-black">{n.task(ttc.longestLingering.task)}</p>
              <p className="font-semibold">waited {plural(ttc.longestLingering.days, 'day')}, then you finally did it.</p>
            </div>
          </Rise>
        )}
      </div>
    ),
  });

  // 16. due timing
  const dt = h.dueTiming;
  const onTime = dt.withDue ? (dt.onDay + dt.early) / dt.withDue : 0;
  out.push(dt.withDue > 0 && {
    id: 'due', palette: P[1], alt: `${pct(onTime)} of dated tasks done on time; ${pct(dt.lastMinute.rate)} were last-minute.`,
    el: (
      <Center>
        <Kicker>Beat the clock</Kicker>
        <Big i={1}>{pct(onTime)}</Big>
        <Sub>of dated tasks were done on or before their day.</Sub>
        <Rise i={3} className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stat big={pct(dt.lastMinute.rate)} small="finished in the final 3 hours" />
          <Stat big={dt.avgDaysLate != null ? `${num1(dt.avgDaysLate)}d` : '—'} small="average lateness when late" />
        </Rise>
        {h.deadlines && <Rise i={4}><p className="mt-5 font-bold">Deadlines: {num(h.deadlines.met)} met · {num(h.deadlines.missed)} missed</p></Rise>}
      </Center>
    ),
  });

  // 17. reschedules
  const rs = h.reschedules;
  out.push(rs.total > 0 && {
    id: 'reschedules', palette: P[8], alt: `You rescheduled tasks ${num(rs.total)} times; ${num(rs.pushedLater)} pushed later.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>“Tomorrow, for sure”</Kicker>
        <Big i={1}><CountUp value={rs.total} /></Big>
        <Sub>reschedules. {pct(rs.total ? rs.pushedLater / rs.total : 0)} of them pushed things later.</Sub>
        {rs.mostRescheduled[0] && (
          <Rise i={3}>
            <div className="mt-6 rounded-2xl bg-black/15 p-4">
              <p className="text-sm font-bold uppercase tracking-widest opacity-70">Most-moved task</p>
              <p className="text-xl font-black">{n.task(rs.mostRescheduled[0].task)}</p>
              <p className="font-semibold">moved {plural(rs.mostRescheduled[0].count, 'time')}</p>
            </div>
          </Rise>
        )}
      </div>
    ),
  });

  // 18. planning
  out.push(h.planningBurst && {
    id: 'planning', palette: P[6], alt: `Biggest planning burst: ${h.planningBurst.count} tasks created in one hour on ${dateLong(h.planningBurst.date)}.`,
    el: (
      <Center>
        <Kicker>Planning mode</Kicker>
        <Big i={1}><CountUp value={h.planningBurst.count} /></Big>
        <Sub>tasks added in a single hour on {dateLong(h.planningBurst.date, isAll)}, {hourLabel(h.planningBurst.hour)}.</Sub>
        <Rise i={3} className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stat big={`${num1(h.sundayPlanner.score)}×`} small={`Sunday planner score (${pct(h.sundayPlanner.sundayShare)} of tasks added on Sundays)`} />
          <Stat big={pct(h.sameDay.rate)} small="captured and finished the same day" />
        </Rise>
      </Center>
    ),
  });

  // 19. themes
  out.push(t.share.length >= 2 && {
    id: 'themes', palette: P[9], alt: `What your ${isAll ? 'history' : 'year'} was about: ${t.share.slice(0, 5).map((x) => `${n.theme(x.theme)} ${pct(x.share)}`).join(', ')}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>What your {isAll ? 'time' : 'year'} was about</Kicker>
        <Big i={1} size="md">{n.theme(t.share[0].theme)}</Big>
        <RankList accent="#0d0221" rows={t.share.slice(0, 6).map((x) => ({ label: n.theme(x.theme), value: pct(x.share), frac: x.share / t.share[0].share }))} />
      </div>
    ),
  });

  // 20. seasons
  out.push(!isAll && t.seasons.length >= 3 && {
    id: 'seasons', palette: P[0], alt: `Seasons of your year: ${t.seasons.map((x) => `${monthName(x.month, true)} ${n.theme(x.topTheme)}`).join('; ')}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>The seasons of {s.label}</Kicker>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {t.seasons.map((x, i) => (
            <Rise key={x.month} i={1 + i * 0.5}>
              <div className="rounded-xl bg-black/20 p-2.5">
                <p className="text-xs font-black uppercase tracking-widest opacity-70">{monthName(x.month, true)}</p>
                <p className="truncate text-sm font-extrabold">{n.theme(x.topTheme)}</p>
                <p className="truncate text-xs font-semibold opacity-75">{n.project(x.topProject)}</p>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    ),
  });

  // 21. keywords (text, hidden in share-safe)
  out.push(!n.safe && t.keywords.length >= 8 && {
    id: 'keywords', palette: P[2], alt: `Your most-used words: ${t.keywords.slice(0, 10).map((w) => w.word).join(', ')}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>In your own words</Kicker>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {t.keywords.slice(0, 24).map((w, i) => (
            <Rise key={w.word} i={1 + i * 0.25}>
              <span className="display font-black" style={{ fontSize: `${Math.max(1.1, 3.6 * Math.sqrt(w.count / t.keywords[0].count))}rem`, opacity: 0.55 + 0.45 * (w.count / t.keywords[0].count) }}>{w.word}</span>
            </Rise>
          ))}
        </div>
      </div>
    ),
  });

  // 22. milestones
  out.push(t.milestones.length > 0 && {
    id: 'milestones', palette: P[4], alt: `${t.milestones.length} milestone tasks completed.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Milestones</Kicker>
        <Big i={1}><CountUp value={t.milestones.length} /></Big>
        <Sub>big moments: submitted, applied, interviewed, shipped.</Sub>
        {n.safe ? <Hidden what="Milestone names" /> : (
          <ol className="mt-5 space-y-2 border-l-2 border-white/40 pl-4">
            {t.milestones.slice(-6).map((m, i) => (
              <Rise key={i} i={3 + i}><li><span className="text-xs font-black uppercase tracking-widest opacity-70">{dateLong(m.ts.slice(0, 10), isAll)}</span><p className="truncate font-bold">{n.task(m.task)}</p></li></Rise>
            ))}
          </ol>
        )}
      </div>
    ),
  });

  // 23. routines
  const bestChain = [...r.adherence].sort((a, b) => b.longestChain - a.longestChain)[0];
  out.push(r.mostCompleted.length > 0 && {
    id: 'routines', palette: P[3], alt: `${r.recurringTasks} routines, ${num(r.recurringCompletions)} check-ins. Most completed: ${n.task(r.mostCompleted[0].task)}.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Your routines</Kicker>
        <Big i={1}><CountUp value={r.recurringCompletions} /></Big>
        <Sub>check-ins across {plural(r.recurringTasks, 'recurring task')}.</Sub>
        <Rise i={3}>
          <div className="mt-6 rounded-2xl bg-black/15 p-4">
            <p className="text-sm font-bold uppercase tracking-widest opacity-70">Most reliable habit</p>
            <p className="text-xl font-black">{n.task(r.mostCompleted[0].task)}</p>
            <p className="font-semibold">{plural(r.mostCompleted[0].count, 'time')}</p>
          </div>
        </Rise>
        {bestChain && bestChain.longestChain > 2 && (
          <Rise i={4}><p className="mt-4 font-bold">Longest unbroken chain: {num(bestChain.longestChain)} {bestChain.chainUnit} of {n.task(bestChain.task)} ({pct(bestChain.rate)} adherence).</p></Rise>
        )}
      </div>
    ),
  });

  // 24. routines that died
  out.push(r.died.length > 0 && {
    id: 'died', palette: P[5], alt: `${r.died.length} routines stopped partway through.`,
    el: (
      <div className="flex h-full flex-col justify-center">
        <Kicker>Gone but not forgotten</Kicker>
        <Big i={1} size="md">Routines that faded</Big>
        <RankList accent="#ff5a5f" rows={r.died.slice(0, 5).map((d) => ({ label: n.task(d.task), value: `last ${dateLong(d.lastCompleted, isAll).replace(/, \d{4}$/, '')}` }))} />
      </div>
    ),
  });

  // 25. year over year
  if (prev) {
    const y = compareYears(prev, s);
    const lines = y.shifts.map(describeShift).filter(Boolean).slice(0, 3) as string[];
    out.push(y.enough && {
      id: 'yoy', palette: P[6], alt: `Compared with ${prev.label}: ${y.completions.delta >= 0 ? 'up' : 'down'} ${num(Math.abs(y.completions.delta))} completions. ${lines.join(' ')}`,
      el: (
        <div className="flex h-full flex-col justify-center">
          <Kicker>Versus {prev.label}</Kicker>
          <Big i={1} size="lg">{y.completions.delta >= 0 ? '+' : '−'}{y.completions.pct != null ? pct(Math.abs(y.completions.pct)) : num(Math.abs(y.completions.delta))}</Big>
          <Sub>{y.completions.delta >= 0 ? 'more' : 'fewer'} completions ({num(y.completions.a)} → {num(y.completions.b)}).</Sub>
          <ul className="mt-6 space-y-2 text-lg font-bold">
            {lines.map((l, i) => <Rise key={i} i={3 + i}><li>→ {l}</li></Rise>)}
          </ul>
          {y.projects.stayed.length > 0 && <Rise i={6}><p className="mt-4 text-sm font-semibold opacity-85">{plural(y.projects.stayed.length, 'project')} stayed in your top 10 both years.</p></Rise>}
        </div>
      ),
    });
  }

  // 26. crusher (playful)
  out.push(c.completions > 0 && {
    id: 'crusher', palette: P[8], alt: `Just for fun: you're in the top ${c.crusher.topPercent}% of task-crushers. Not a real ranking.`,
    el: (
      <Center>
        <Kicker>Very official ranking*</Kicker>
        <Sub i={1}>You’re in the top</Sub>
        <Big i={2}>{c.crusher.topPercent}%</Big>
        <Sub i={3}>of task-crushers.</Sub>
        <Rise i={4}><p className="mt-10 text-xs font-semibold opacity-70">*Completely made up, just for fun. Based on your {c.crusher.basis}, not on any real Todoist data.</p></Rise>
      </Center>
    ),
  });

  // 27. account
  out.push((isAll || s.classics.karma) && s.bonus.accountAgeDays != null && {
    id: 'account', palette: P[1], alt: `Account age ${num(s.bonus.accountAgeDays)} days.${c.karma ? ` Karma ${num(c.karma.current)}.` : ''}`,
    el: (
      <Center>
        <Kicker>Been at this a while</Kicker>
        <Big i={1}><CountUp value={s.bonus.accountAgeDays} /></Big>
        <Sub>days since you made your account.</Sub>
        <Rise i={3} className="mt-6 grid grid-cols-2 gap-3 text-left">
          {c.karma && <Stat big={num(c.karma.current)} small={`karma, trending ${c.karma.trend ?? 'steady'}`} />}
          <Stat big={num(s.bonus.totals.activeProjects + s.bonus.totals.archivedProjects + s.bonus.totals.deletedProjects)} small={`projects (${num(s.bonus.totals.archivedProjects)} archived)`} />
          <Stat big={num(s.bonus.totals.filters)} small="saved filters" />
          <Stat big={num(s.bonus.totals.attachments)} small="attachments" />
        </Rise>
      </Center>
    ),
  });

  // 28. summary
  out.push({ id: 'summary', palette: { bg: 'linear-gradient(160deg,#14141f 0%,#0b0b12 100%)', ink: '#fff', accent: '#ffb400' }, alt: summaryAlt(s, n), el: <Summary s={s} n={n} /> });

  return out.filter(Boolean) as SlideDef[];
}

function summaryAlt(s: YearStats, n: Names) {
  const c = s.classics;
  return `Summary for ${s.label}: ${num(c.completions)} completed. Top projects: ${c.topProjects.slice(0, 5).map((p) => n.project(p.id)).join(', ')}. Top theme ${n.theme(s.themes.share[0]?.theme)}. Longest streak ${c.longestStreak?.days ?? 0} days. Persona ${s.habits.persona.title}. Share-safe ${n.safe ? 'on' : 'off'}.`;
}

function Summary({ s, n }: { s: YearStats; n: Names }) {
  const c = s.classics;
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <Rise className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-black"><Logo size={26} /> Jack's Todoist Wrapped</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${n.safe ? 'bg-safe text-ink' : 'bg-white/10 text-soft'}`}>
          Share-safe {n.safe ? 'on' : 'off'}
        </span>
      </Rise>
      <Rise i={1}><p className="display bg-gradient-to-r from-[#ff5a5f] via-[#ffb400] to-[#00c2a8] bg-clip-text text-[clamp(3rem,18cqw,6rem)] font-black text-transparent">{s.label}</p></Rise>
      <Rise i={2} className="grid grid-cols-2 gap-3">
        <Stat big={num(c.completions)} small="things done" />
        <Stat big={c.longestStreak ? `${num(c.longestStreak.days)}d` : '—'} small="longest streak" />
      </Rise>
      <Rise i={3}>
        <p className="text-xs font-black uppercase tracking-widest text-muted">Top projects</p>
        <ol className="mt-2 space-y-1.5">
          {c.topProjects.slice(0, 5).map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 text-lg font-bold">
              <span className="w-4 text-muted">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: n.projectColor(p.id) }} aria-hidden="true" />
              <span className="truncate">{n.project(p.id)}</span>
              <span className="tabular ml-auto text-sm text-muted">{num(p.count)}</span>
            </li>
          ))}
        </ol>
      </Rise>
      <Rise i={4} className="grid grid-cols-2 gap-3">
        <Stat big={n.theme(s.themes.share[0]?.theme)} small="top theme" small2 />
        <Stat big={s.habits.persona.title.replace(/^The /, '')} small="persona" small2 />
      </Rise>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col justify-center">{children}</div>;
}

function Stat({ big, small, small2 }: { big: string; small: string; small2?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3.5">
      <p className={`display font-black ${small2 ? 'line-clamp-2 text-xl leading-tight' : 'text-4xl'}`}>{big}</p>
      <p className="text-sm font-semibold opacity-80">{small}</p>
    </div>
  );
}

function PersonaGlyph({ id }: { id: string }) {
  const common = { width: 120, height: 120, viewBox: '0 0 120 120', 'aria-hidden': true } as const;
  if (id === 'night-owl')
    return (
      <svg {...common} className="my-4"><circle cx="60" cy="60" r="44" fill="#fff" opacity=".15" /><path d="M78 30a34 34 0 1 0 14 48A28 28 0 0 1 78 30z" fill="#ffe066" /><circle cx="34" cy="34" r="3" fill="#fff" /><circle cx="92" cy="96" r="2.5" fill="#fff" /><circle cx="24" cy="80" r="2" fill="#fff" /></svg>
    );
  if (id === 'early-bird')
    return (
      <svg {...common} className="my-4"><circle cx="60" cy="72" r="26" fill="#fff" />{Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 7) * i; return <rect key={i} x="57" y="18" width="6" height="16" rx="3" fill="#fff" transform={`rotate(${(a * 180) / Math.PI - 90} 60 72)`} />; })}<rect x="10" y="96" width="100" height="8" rx="4" fill="#1a0a00" opacity=".4" /></svg>
    );
  if (id === 'deadline-sprinter')
    return (
      <svg {...common} className="my-4"><circle cx="60" cy="62" r="40" fill="none" stroke="#fff" strokeWidth="8" /><path d="M60 62V36M60 62l18 10" stroke="#ffe066" strokeWidth="8" strokeLinecap="round" /><rect x="50" y="10" width="20" height="10" rx="4" fill="#fff" /></svg>
    );
  return (
    <svg {...common} className="my-4"><rect x="18" y="74" width="84" height="22" rx="11" fill="#fff" /><rect x="30" y="48" width="60" height="20" rx="10" fill="#fff" opacity=".75" /><rect x="42" y="24" width="36" height="18" rx="9" fill="#fff" opacity=".5" /></svg>
  );
}

