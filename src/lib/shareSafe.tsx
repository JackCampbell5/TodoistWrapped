// Share-safe mode: hides task text and swaps names for build-time aliases. Numbers stay real.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { index } from './data.ts';
import type { TaskRef } from '../shared/stats.ts';

const KEY = 'mdl.shareSafe';
interface Ctx {
  on: boolean;
  toggle: () => void;
}
const ShareSafeContext = createContext<Ctx>({ on: false, toggle: () => {} });

export function ShareSafeProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => setOn((v) => !v), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.shareSafe = on ? 'on' : 'off';
  }, [on]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  const value = useMemo(() => ({ on, toggle }), [on, toggle]);
  return <ShareSafeContext.Provider value={value}>{children}</ShareSafeContext.Provider>;
}

export const useShareSafe = () => useContext(ShareSafeContext);

/** Name resolution that respects share-safe mode. */
export function useNames() {
  const { on } = useShareSafe();
  return useMemo(() => {
    const e = index?.entities;
    const pick = (x: { name: string; alias: string } | undefined, fallback: string) => (x ? (on ? x.alias : x.name) : fallback);
    return {
      safe: on,
      project: (id: string | null | undefined) => pick(id ? e?.projects[id] : undefined, 'Unknown project'),
      projectColor: (id: string | null | undefined) => (id && e?.projects[id]?.color) || '#808080',
      label: (name: string) => pick(e?.labels[name], on ? 'A label' : name),
      section: (id: string) => pick(e?.sections[id], 'A section'),
      theme: (name: string | null | undefined) => {
        if (!name) return '—';
        const t = e?.themes[name];
        return t ? (on ? t.alias : t.name) : on ? 'Other' : name;
      },
      task: (ref: TaskRef | null | undefined) => (ref ? (on ? ref.safe : ref.text || '(untitled task)') : ''),
    };
  }, [on]);
}
