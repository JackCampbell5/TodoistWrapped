import { lazy, Suspense } from 'react';
import { index } from './lib/data.ts';
import { useRoute } from './lib/router.ts';
import { Landing } from './views/Landing.tsx';
import { Header } from './components/Shell.tsx';

const Story = lazy(() => import('./views/story/Story.tsx'));
const Explore = lazy(() => import('./views/explore/Explore.tsx'));

function NoData() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-20">
        <h1 className="display text-5xl font-black">No stats yet</h1>
        <p className="mt-4 text-soft">
          Unzip your Todoist export into <code className="rounded bg-panel px-1.5">data/raw/</code>, then run:
        </p>
        <pre className="mt-3 rounded-xl bg-panel p-4 text-sm">npm run build:data</pre>
        <p className="mt-4 text-soft">
          Just want a demo? <code className="rounded bg-panel px-1.5">npm run build:fixtures</code> builds stats from a fake export.
        </p>
      </main>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  if (!index) return <NoData />;
  const valid = route.view !== 'landing' && index.years.some((y) => y.key === route.year);
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-muted">Loading…</div>}>
      {route.view === 'story' && valid ? <Story year={route.year} start={Number(route.section) || 0} /> : route.view === 'explore' && valid ? <Explore year={route.year} section={route.section} /> : <Landing />}
    </Suspense>
  );
}
