const nf = new Intl.NumberFormat('en-US');
export const num = (n: number) => nf.format(Math.round(n));
export const num1 = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthName(ym: string, short = false) {
  const m = MONTHS[+ym.slice(5, 7) - 1] ?? ym;
  return short ? m.slice(0, 3) : m;
}
export function monthYear(ym: string) {
  return `${monthName(ym, true)} ${ym.slice(0, 4)}`;
}
/** Format a local YYYY-MM-DD date without any timezone shifting. */
export function dateLong(d: string, withYear = true) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}${withYear ? `, ${y}` : ''}`;
}
export function dateShort(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${day}, ${y}`;
}
export function weekdayOf(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return DOWS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}
/** Timestamp (UTC ISO) → NY local date string. */
export function nyDate(ts: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}
export function hourLabel(h: number) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  const suffix = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}
export function hoursHuman(h: number | null | undefined) {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${num1(h)} hrs`;
  if (h < 24 * 60) return `${num1(h / 24)} days`;
  return `${num1(h / 24 / 30.4)} months`;
}
export function plural(n: number, one: string, many = `${one}s`) {
  return `${num(n)} ${n === 1 ? one : many}`;
}
