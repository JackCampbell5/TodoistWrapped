import { useEffect, useMemo, useState } from 'react';
import { loadSearch } from '../../lib/data.ts';
import { useNames } from '../../lib/shareSafe.tsx';
import { dateShort, num } from '../../lib/format.ts';
import type { SearchEntry } from '../../shared/stats.ts';
import { HistoryBars } from './charts.tsx';
import { Swatch } from './ui.tsx';

export function SearchPanel() {
  const n = useNames();
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<SearchEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const ensure = () => {
    if (entries || loading) return;
    setLoading(true);
    loadSearch().then((f) => {
      setEntries(f.entries);
      setLoading(false);
    });
  };
  useEffect(() => setPicked(null), [n.safe]);

  const display = (e: SearchEntry) => (e.kind === 'project' ? n.project(e.id) : e.kind === 'label' ? `@${n.label(e.id)}` : n.safe ? 'Hidden task' : e.text);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!entries || query.length < 2) return null;
    const entities = entries.filter((e) => e.kind !== 'task' && display(e).toLowerCase().includes(query)).sort((a, b) => b.total - a.total);
    const tasks = entries.filter((e) => e.kind === 'task' && e.text.toLowerCase().includes(query)).sort((a, b) => b.total - a.total);
    return { entities: entities.slice(0, 12), tasks, taskCount: tasks.length };
  }, [entries, q, n.safe]);

  return (
    <div className="md:col-span-2 rounded-2xl border border-line bg-panel p-5">
      <label htmlFor="search" className="text-base font-extrabold">Look something up</label>
      <p className="text-sm text-muted">Any project, label{n.safe ? '' : ', or task text'}. See its completions by month and first/last activity.</p>
      <input
        id="search"
        type="search"
        value={q}
        onFocus={ensure}
        onChange={(e) => {
          ensure();
          setQ(e.target.value);
          setPicked(null);
        }}
        placeholder={n.safe ? 'Search projects or labels by alias…' : 'Try a project, a label, or a word from a task…'}
        className="mt-3 w-full rounded-xl border border-line bg-ink px-4 py-3 text-base outline-none placeholder:text-muted focus:border-soft"
        autoComplete="off"
      />
      {loading && <p className="mt-3 text-sm text-muted">Loading search index…</p>}
      {results && !picked && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <ResultList title="Projects & labels" items={results.entities} display={display} onPick={setPicked} empty="No matching projects or labels." />
          {n.safe ? (
            <div className="rounded-xl border border-safe/40 bg-safe/10 p-4 text-sm">
              Task text is hidden in share-safe mode. <span className="tabular font-bold">{num(results.taskCount)}</span> tasks match.
            </div>
          ) : (
            <ResultList title={`Tasks (${num(results.taskCount)})`} items={results.tasks.slice(0, 30)} display={display} onPick={setPicked} empty="No matching tasks." sub={(e) => n.project(e.projectId)} />
          )}
        </div>
      )}
      {picked && (
        <div className="mt-4 rounded-xl border border-line bg-ink/60 p-4">
          <button type="button" onClick={() => setPicked(null)} className="mb-2 text-sm font-bold text-soft hover:text-white">← Back to results</button>
          <p className="text-lg font-black">
            {picked.kind === 'project' && <Swatch color={n.projectColor(picked.id)} />}
            {display(picked)}
          </p>
          <p className="text-sm text-muted">
            {picked.kind === 'task' && <>in {n.project(picked.projectId)} · </>}
            <span className="tabular font-bold text-soft">{num(picked.total)}</span> completions
            {picked.first && <> · first activity {dateShort(picked.first)}</>}
            {picked.last && <> · last {dateShort(picked.last)}</>}
          </p>
          <div className="mt-3">
            <HistoryBars monthly={picked.monthly} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultList({ title, items, display, onPick, empty, sub }: { title: string; items: SearchEntry[]; display: (e: SearchEntry) => string; onPick: (e: SearchEntry) => void; empty: string; sub?: (e: SearchEntry) => string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="max-h-72 overflow-auto rounded-lg border border-line">
          {items.map((e) => (
            <li key={e.kind + e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left text-sm hover:bg-panel-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{display(e)}</span>
                  {sub && <span className="block truncate text-xs text-muted">{sub(e)}</span>}
                </span>
                <span className="tabular text-xs text-muted">{num(e.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
