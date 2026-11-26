// Life themes: map projects → themes via config/themes.local.json (gitignored).
// Supported config shapes (both optional, can be combined):
//   "themes":        { "School": ["Project name or id", ...] }
//   "projectThemes": { "Project name or id": "School" }   ("" = not sorted yet)
//   "milestoneKeywords": ["submit", "apply", ...]
// Projects without a configured theme fall back to their top-level parent project
// (the export has no project hierarchy, so effectively one theme per project).
import fs from 'node:fs';
import type { Project } from './types.ts';

export interface ThemeConfig {
  themes?: Record<string, string[]>;
  projectThemes?: Record<string, string>;
  milestoneKeywords?: string[];
}

export const DEFAULT_MILESTONE_KEYWORDS = ['submit', 'apply', 'interview', 'rehearsal', 'launch', 'finish', 'deadline', 'exam', 'final', 'present'];

export function loadThemeConfig(file: string): ThemeConfig | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ThemeConfig;
}

export interface ThemeAssignment {
  themeOf: Map<string, string>; // projectId → theme name
  fromConfig: Set<string>; // theme names that came from config (safe to show in share-safe mode)
}

export function assignThemes(projects: Project[], cfg: ThemeConfig | null): ThemeAssignment {
  const byKey = new Map<string, string>();
  for (const [theme, keys] of Object.entries(cfg?.themes ?? {})) for (const k of keys) byKey.set(k.toLowerCase(), theme);
  for (const [k, theme] of Object.entries(cfg?.projectThemes ?? {})) if (theme && theme.trim()) byKey.set(k.toLowerCase(), theme.trim());
  const byId = new Map(projects.map((p) => [p.id, p]));
  const themeOf = new Map<string, string>();
  const fromConfig = new Set<string>();
  const lookup = (p: Project) => byKey.get(p.id.toLowerCase()) ?? byKey.get(p.name.toLowerCase());
  for (const p of projects) {
    let theme = lookup(p);
    if (theme) fromConfig.add(theme);
    else {
      let top = p;
      const seen = new Set<string>();
      while (top.parentId && byId.has(top.parentId) && !seen.has(top.id)) {
        seen.add(top.id);
        top = byId.get(top.parentId)!;
      }
      const parentTheme = top !== p ? lookup(top) : undefined;
      if (parentTheme) {
        theme = parentTheme;
        fromConfig.add(theme);
      } else theme = p.isInbox ? 'Inbox' : top.name;
    }
    themeOf.set(p.id, theme);
  }
  if (projects.some((p) => p.isInbox)) fromConfig.add('Inbox');
  return { themeOf, fromConfig };
}
