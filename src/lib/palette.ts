import { index } from './data.ts';

// Validated categorical palette (dark-surface steps), fixed order. Never cycled.
export const CATEGORICAL = ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef', '#eb6263'];
export const OTHER = '#6b6b80';
// Sequential blue ramp, light → dark steps reordered for a dark surface (low = recedes into surface).
export const SEQUENTIAL = ['#1c1c2a', '#0f4a96', '#1757ac', '#1b64be', '#2370cd', '#257de0', '#338ced', '#519ced', '#84b9f3', '#cce3fd'];

export function seqColor(value: number, max: number) {
  if (!value || !max) return SEQUENTIAL[0];
  const i = 1 + Math.min(SEQUENTIAL.length - 2, Math.floor((value / max) * (SEQUENTIAL.length - 1)));
  return SEQUENTIAL[i];
}

/** Theme colors follow the entity: slot = the theme's all-time rank, so filters never repaint. */
const themeOrder = Object.keys(index?.entities.themes ?? {});
export function themeColor(name: string) {
  const i = themeOrder.indexOf(name);
  return i >= 0 && i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER;
}

// Story-mode slide palettes: bold, saturated, original combinations.
export const SLIDE_PALETTES: { bg: string; ink: string; accent: string }[] = [
  { bg: 'linear-gradient(160deg,#ff4d6d 0%,#7b2ff7 100%)', ink: '#fff', accent: '#ffe066' },
  { bg: 'linear-gradient(160deg,#00c2a8 0%,#0057ff 100%)', ink: '#fff', accent: '#d6ff3f' },
  { bg: 'linear-gradient(160deg,#ffb400 0%,#ff3d00 100%)', ink: '#1a0a00', accent: '#fff' },
  { bg: 'linear-gradient(160deg,#d6ff3f 0%,#00b37e 100%)', ink: '#06210f', accent: '#3a0ca3' },
  { bg: 'linear-gradient(160deg,#3a0ca3 0%,#f72585 100%)', ink: '#fff', accent: '#4cc9f0' },
  { bg: 'linear-gradient(160deg,#0b0b12 0%,#2b2d42 100%)', ink: '#fff', accent: '#ff5a5f' },
  { bg: 'linear-gradient(160deg,#4cc9f0 0%,#4361ee 100%)', ink: '#04102e', accent: '#fff' },
  { bg: 'linear-gradient(160deg,#ff8fab 0%,#ffd6a5 100%)', ink: '#2a0a17', accent: '#7b2ff7' },
  { bg: 'linear-gradient(160deg,#f15bb5 0%,#fee440 100%)', ink: '#260018', accent: '#00bbf9' },
  { bg: 'linear-gradient(160deg,#00f5d4 0%,#9b5de5 100%)', ink: '#0d0221', accent: '#fff' },
];

/** A slide palette built from a real project color. */
export function projectPalette(hex: string) {
  return { bg: `linear-gradient(160deg, ${hex} 0%, #0b0b12 115%)`, ink: '#fff', accent: '#fff' };
}
