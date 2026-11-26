// Share-safe aliases, computed at build time so the browser never derives them.
import type { Entities, EntityInfo, ThemeInfo } from '../shared/stats.ts';
import type { NormalizedData } from './types.ts';
import type { ThemeAssignment } from './themes.ts';

export function letterName(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const byCountThenName = <T extends { count: number; name: string }>(a: T, b: T) => b.count - a.count || a.name.localeCompare(b.name);

export function buildEntities(
  data: NormalizedData,
  themes: ThemeAssignment,
  projectCounts: Map<string, number>,
  labelCounts: Map<string, number>,
  sectionCounts: Map<string, number>,
): Entities {
  const projects: Record<string, EntityInfo> = {};
  const sorted = data.projects.map((p) => ({ p, name: p.name, count: projectCounts.get(p.id) ?? 0 })).sort(byCountThenName);
  const perTheme = new Map<string, number>();
  let letter = 0;
  for (const { p } of sorted) {
    const theme = themes.themeOf.get(p.id)!;
    let alias: string;
    if (p.isInbox) alias = 'Inbox';
    else if (themes.fromConfig.has(theme)) {
      const n = (perTheme.get(theme) ?? 0) + 1;
      perTheme.set(theme, n);
      alias = `${theme} ${n}`;
    } else alias = `Project ${letterName(letter++)}`;
    projects[p.id] = { name: p.name, alias, color: p.color, theme, archived: p.isArchived || undefined, deleted: p.isDeleted || undefined };
  }

  const labels: Record<string, EntityInfo> = {};
  const labelColor = new Map(data.labels.map((l) => [l.name, l.color]));
  data.labels
    .map((l) => ({ name: l.name, count: labelCounts.get(l.name) ?? 0 }))
    .sort(byCountThenName)
    .forEach((l, i) => {
      labels[l.name] = { name: l.name, alias: `Label ${letterName(i)}`, color: labelColor.get(l.name) ?? '#808080' };
    });

  const sections: Record<string, EntityInfo> = {};
  const unnamedPerProject = new Map<string, number>();
  data.sections
    .map((s) => ({ s, name: s.name ?? '', count: sectionCounts.get(s.id) ?? 0 }))
    .sort(byCountThenName)
    .forEach(({ s }, i) => {
      const proj = s.projectId ? projects[s.projectId] : undefined;
      let name = s.name;
      if (!name) {
        const k = (unnamedPerProject.get(s.projectId ?? '') ?? 0) + 1;
        unnamedPerProject.set(s.projectId ?? '', k);
        name = `${proj?.name ?? 'Unknown project'} · section ${k}`;
      }
      sections[s.id] = { name, alias: `Section ${i + 1}`, color: proj?.color ?? '#808080' };
    });

  const themeInfo: Record<string, ThemeInfo> = {};
  for (const { p } of sorted) {
    const t = themes.themeOf.get(p.id)!;
    if (themeInfo[t]) continue; // first (most-completed) project sets the theme color/alias
    const fromConfig = themes.fromConfig.has(t);
    themeInfo[t] = { name: t, alias: fromConfig ? t : projects[p.id].alias, color: p.color, fromConfig };
  }
  return { projects, labels, sections, themes: themeInfo };
}
