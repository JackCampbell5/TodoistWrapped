import { Card } from './ui.tsx';

export function Compare({ current }: { current: string }) {
  return (
    <Card wide title="Year over year" sub={`Comparing ${current} with another year is coming next.`}>
      <p className="text-sm text-muted">Coming soon.</p>
    </Card>
  );
}
