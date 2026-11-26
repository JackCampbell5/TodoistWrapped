import { useEffect, useState } from 'react';

export type Route = { view: 'landing' } | { view: 'story' | 'explore'; year: string; section?: string };

export function parseHash(hash: string): Route {
  const [, view, year, section] = hash.replace(/^#/, '').split('/');
  if ((view === 'story' || view === 'explore') && year) return { view, year, section };
  return { view: 'landing' };
}

export function go(route: Route) {
  window.location.hash = route.view === 'landing' ? '/' : `/${route.view}/${route.year}${'section' in route && route.section ? `/${route.section}` : ''}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
