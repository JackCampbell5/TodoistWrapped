import { useMemo, useState, type ReactNode } from 'react';

export function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28">
      {kicker && <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">{kicker}</p>}
      <h2 id={`${id}-h`} className="display mb-5 text-4xl font-black sm:text-5xl">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function Card({ title, sub, children, wide, action }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean; action?: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-panel p-5 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold">{title}</h3>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A chart card with a built-in table equivalent (accessibility + exact values). */
export function ChartCard({ title, sub, wide, table, children, summary }: {
  title: string; sub?: ReactNode; wide?: boolean; summary: string;
  table: { head: string[]; rows: (string | number)[][] }; children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card
      title={title}
      sub={sub}
      wide={wide}
      action={
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-bold text-soft hover:bg-panel-2">
          {showTable ? 'Chart' : 'Table'}
        </button>
      }
    >
      <p className="sr-only">{summary}</p>
      {showTable ? <DataTable head={table.head} rows={table.rows} /> : <div aria-hidden="true">{children}</div>}
    </Card>
  );
}

export function DataTable({ head, rows, max = 400 }: { head: string[]; rows: (string | number)[][]; max?: number }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-panel-2 text-xs uppercase tracking-wider text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody className="tabular">
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${typeof c === 'number' ? 'text-right' : ''}`}>{typeof c === 'number' ? c.toLocaleString('en-US') : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="display tabular mt-1 text-3xl font-black">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  numeric?: boolean;
}

/** Sortable table (click headers). */
export function SortableTable<T>({ rows, columns, initialSort, limit = 50, caption }: { rows: T[]; columns: Column<T>[]; initialSort: string; limit?: number; caption: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initialSort, dir: -1 });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [rows, columns, sort]);
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-panel-2 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="w-10 px-3 py-2">#</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 ${c.numeric ? 'text-right' : ''}`}>
                <button type="button" className="font-bold uppercase hover:text-white" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.numeric ? -1 : 1 }))}>
                  {c.label} {sort.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {sorted.slice(0, limit).map((r, i) => (
            <tr key={i} className="border-t border-line/60 hover:bg-panel-2/60">
              <td className="px-3 py-1.5 text-muted">{i + 1}</td>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 ${c.numeric ? 'text-right' : ''}`}>{c.render ? c.render(r) : c.value(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SafeHidden({ what, count }: { what: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-safe/40 bg-safe/10 p-4 text-sm">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-safe" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /></svg>
      <span>
        {what} hidden in share-safe mode{count != null && <> · <span className="tabular font-bold">{count.toLocaleString('en-US')}</span> total</>}.
      </span>
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle" style={{ background: color }} aria-hidden="true" />;
}

export function Bar({ frac, color = '#338ced' }: { frac: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-panel-2">
      <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, frac * 100)}%`, background: color }} />
    </div>
  );
}
