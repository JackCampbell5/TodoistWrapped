// Text helpers for keyword clouds and repeated-title detection.

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by
  can could did do does doing done down during each few for from further get got had has have having he her here hers him his
  how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours out
  over own same she should so some such than that the their them then there these they this those through to too under until
  up very was we were what when where which while who whom why will with would you your yours yourself
  re ve ll don didn isn wasn aren doesn won can't don't i'm it's i've
  todo task tasks thing things stuff etc via per vs amp com www http https html org edu net pdf png jpg
  jan feb mar apr may jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday
  today tomorrow tonight week weekly day daily month year next last new one two three`.split(/\s+/),
);

/** Strip markdown links/urls/emoji formatting to plain text. */
export function plainText(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`~#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  return plainText(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
}

/** Normalize a title for "you keep re-adding this" detection. */
export function normalizeTitle(s: string): string {
  return plainText(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function topWords(texts: Iterable<string>, n: number): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of texts) for (const w of new Set(tokenize(t))) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}
