import { Header } from '../../components/Shell.tsx';

export default function Explore({ year }: { year: string }) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">Explore {year}: coming next.</main>
    </div>
  );
}
