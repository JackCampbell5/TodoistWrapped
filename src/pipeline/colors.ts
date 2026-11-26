// Todoist palette. The export stores project colors as numeric ids (30-49) and
// label/filter colors as names.
export const TODOIST_COLORS: { id: number; name: string; hex: string }[] = [
  { id: 30, name: 'berry_red', hex: '#b8256f' },
  { id: 31, name: 'red', hex: '#db4035' },
  { id: 32, name: 'orange', hex: '#ff9933' },
  { id: 33, name: 'yellow', hex: '#fad000' },
  { id: 34, name: 'olive_green', hex: '#afb83b' },
  { id: 35, name: 'lime_green', hex: '#7ecc49' },
  { id: 36, name: 'green', hex: '#299438' },
  { id: 37, name: 'mint_green', hex: '#6accbc' },
  { id: 38, name: 'teal', hex: '#158fad' },
  { id: 39, name: 'sky_blue', hex: '#14aaf5' },
  { id: 40, name: 'light_blue', hex: '#96c3eb' },
  { id: 41, name: 'blue', hex: '#4073ff' },
  { id: 42, name: 'grape', hex: '#884dff' },
  { id: 43, name: 'violet', hex: '#af38eb' },
  { id: 44, name: 'lavender', hex: '#eb96eb' },
  { id: 45, name: 'magenta', hex: '#e05194' },
  { id: 46, name: 'salmon', hex: '#ff8d85' },
  { id: 47, name: 'charcoal', hex: '#808080' },
  { id: 48, name: 'grey', hex: '#b8b8b8' },
  { id: 49, name: 'taupe', hex: '#ccac93' },
];

export const DEFAULT_COLOR = { name: 'charcoal', hex: '#808080' };

export function resolveColor(c: unknown): { name: string; hex: string } {
  if (typeof c === 'number') {
    const hit = TODOIST_COLORS.find((x) => x.id === c);
    if (hit) return hit;
  }
  if (typeof c === 'string') {
    const hit = TODOIST_COLORS.find((x) => x.name === c);
    if (hit) return hit;
    if (/^#[0-9a-f]{6}$/i.test(c)) return { name: c, hex: c };
  }
  return DEFAULT_COLOR;
}
