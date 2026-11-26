// npm run init:themes [-- --force]
// Writes a starter config/themes.local.json (gitignored) listing every project in your export,
// most-completed first, so you can assign each one a theme. Empty "" = not sorted yet.
import fs from 'node:fs';
import { ExportAdapter } from '../src/pipeline/adapters/exportAdapter.ts';
import { DEFAULT_MILESTONE_KEYWORDS } from '../src/pipeline/themes.ts';

const target = 'config/themes.local.json';
const source = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'data/raw';
if (fs.existsSync(target) && !process.argv.includes('--force')) {
  console.error(`${target} already exists. Use --force to overwrite.`);
  process.exit(1);
}
const data = await new ExportAdapter(source).load();
const counts = new Map<string, number>();
for (const c of data.completions) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
const byName = new Map<string, number>();
for (const p of data.projects) byName.set(p.name, (byName.get(p.name) ?? 0) + (counts.get(p.id) ?? 0));
const ordered = [...byName.entries()].sort((a, b) => b[1] - a[1]);

const projectThemes: Record<string, string> = {};
const completionsHint: Record<string, number> = {};
for (const [name, n] of ordered) {
  projectThemes[name] = '';
  completionsHint[name] = n;
}
fs.mkdirSync('config', { recursive: true });
fs.writeFileSync(
  target,
  JSON.stringify(
    {
      _help: 'Set each project to a theme name (e.g. "School", "Job Search", "Clubs", "Life"). Leave "" to keep the project as its own theme. You can also use "themes": { "Theme": ["Project", ...] }. Then run npm run build:data.',
      projectThemes,
      milestoneKeywords: DEFAULT_MILESTONE_KEYWORDS,
      _allTimeCompletions: completionsHint,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${target} with ${ordered.length} projects (gitignored). Fill in the themes, then run npm run build:data.`);
