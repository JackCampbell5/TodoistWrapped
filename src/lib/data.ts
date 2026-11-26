// Loads the precomputed JSON from src/generated/ (gitignored). Nothing is computed here.
import { useEffect, useState } from 'react';
import type { IndexFile, SearchFile, YearStats } from '../shared/stats.ts';

const indexMods = import.meta.glob<IndexFile>('../generated/index.json', { eager: true, import: 'default' });
const yearMods = import.meta.glob<YearStats>('../generated/year-*.json', { import: 'default' });
const searchMods = import.meta.glob<SearchFile>('../generated/search.json', { import: 'default' });

export const index: IndexFile | null = Object.values(indexMods)[0] ?? null;

const yearCache = new Map<string, Promise<YearStats>>();
export function loadYear(key: string): Promise<YearStats> {
  const path = `../generated/year-${key}.json`;
  if (!yearCache.has(key)) {
    const loader = yearMods[path];
    yearCache.set(key, loader ? loader() : Promise.reject(new Error(`No stats for ${key}`)));
  }
  return yearCache.get(key)!;
}

export function useYear(key: string | null): YearStats | null {
  const [state, setState] = useState<{ key: string; stats: YearStats } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    loadYear(key).then((stats) => live && setState({ key, stats }));
    return () => {
      live = false;
    };
  }, [key]);
  return state && state.key === key ? state.stats : null;
}

let searchPromise: Promise<SearchFile> | null = null;
export function loadSearch(): Promise<SearchFile> {
  const loader = Object.values(searchMods)[0];
  if (!loader) return Promise.resolve({ entries: [] });
  return (searchPromise ??= loader());
}
