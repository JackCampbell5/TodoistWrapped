// npm run build:data [-- --source data/raw --out src/generated --themes config/themes.local.json]
// Reads the Todoist export (folder or ZIP), aggregates, writes static JSON for the app.
// Output contains personal data and is gitignored. Logs only counts, never task text.
import fs from 'node:fs';
import path from 'node:path';
import { ExportAdapter } from '../src/pipeline/adapters/exportAdapter.ts';
import { buildAll } from '../src/pipeline/aggregate.ts';
import { loadThemeConfig } from '../src/pipeline/themes.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const source = arg('source', 'data/raw');
const out = arg('out', 'src/generated');
const isFixture = source.replace(/\\/g, '/').startsWith('fixtures');
const themesFile = arg('themes', isFixture ? 'fixtures/themes.fixture.json' : 'config/themes.local.json');

if (!fs.existsSync(source)) {
  console.error(`No export found at ${source}. Unzip your Todoist export there (see README).`);
  process.exit(1);
}

const t0 = Date.now();
const data = await new ExportAdapter(source).load();
const themeConfig = loadThemeConfig(themesFile);
const result = buildAll(data, { themeConfig });

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.json')) fs.rmSync(path.join(out, f));
const write = (name: string, obj: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(obj));
write('index.json', result.index);
for (const y of result.years) write(`year-${y.key}.json`, y);
write('search.json', result.search);

console.log(`Built stats in ${Date.now() - t0} ms → ${out}/`);
console.log(`  tasks ${data.tasks.length}, projects ${data.projects.length}, completions ${data.completions.length}, events ${data.events.length}`);
console.log(`  periods: ${result.index.years.map((y) => `${y.key}(${y.completions})`).join(' ')}`);
console.log(`  themes config: ${themeConfig ? themesFile : 'none (one theme per project)'}`);
