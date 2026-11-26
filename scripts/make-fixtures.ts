// npm run make:fixtures — writes a synthetic export to fixtures/export/ with the same file
// layout and field shapes as a real Todoist support export. All content is invented.
import fs from 'node:fs';
import path from 'node:path';
import { nyWallToUtc } from '../src/pipeline/time.ts';

const OUT = 'fixtures/export';
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
let idn = 0;
const newId = (prefix: string) => `${prefix}${(++idn).toString(36).padStart(6, '0')}`;

const UID = 1000001;
const projects = [
  { id: 'PINBOX', name: 'Inbox', color: 47, inbox: true },
  { id: 'PMOON', name: 'Moon Base Renovation', color: 41 },
  { id: 'PCACT', name: 'Cactus Care', color: 36 },
  { id: 'PTIME', name: 'Time Machine Repair', color: 43 },
  { id: 'PBOOK', name: 'Intergalactic Book Club', color: 32 },
  { id: 'PLLAMA', name: 'Llama Grooming Co', color: 45 },
];
const ARCHIVED = { id: 'PVOLC', name: 'Volcano Lair Gift Shop' }; // only in events
const sections = [
  { id: 'SDOME', project: 'PMOON', name: 'Dome repairs' },
  { id: 'SFLUX', project: 'PTIME', name: 'Flux capacitor' },
];
const labels = ['errand', 'deep-work', 'quick', 'phone', 'outside'];
const verbs = ['Water', 'Polish', 'Order', 'Paint', 'Measure', 'Email', 'Submit', 'Apply for', 'Rehearse', 'Sketch', 'Fix', 'Research', 'Interview'];
const nouns = ['the cactus', 'moon dome panels', 'llama brushes', 'flux capacitor', 'book club snacks', 'crater map', 'oxygen garden', 'rocket wax', 'time ledger', 'gift shop sign'];
const projText: Record<string, string[]> = {
  PMOON: ['moon dome panels', 'crater map', 'oxygen garden', 'rocket wax'],
  PCACT: ['the cactus', 'cactus soil', 'spine trimmer'],
  PTIME: ['flux capacitor', 'time ledger', 'paradox checklist'],
  PBOOK: ['book club snacks', 'chapter 7 notes', 'alien poetry'],
  PLLAMA: ['llama brushes', 'llama spa menu', 'wool samples'],
  PINBOX: nouns,
  PVOLC: ['gift shop sign', 'lava lamp stock'],
};

const items: any[] = [];
const acts: any[] = [];
const notes: any[] = [];
const iso = (wall: string) => nyWallToUtc(wall).replace(/\.000Z$/, 'Z');
const micro = (wall: string) => nyWallToUtc(wall).replace(/\.(\d{3})Z$/, '.$1000Z');
const eod = (date: string) => nyWallToUtc(`${date}T23:59:59`).replace(/\.000Z$/, '.000000Z');
const wall = (date: string, h: number, m: number) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nightOwlHour = () => (chance(0.45) ? 20 + Math.floor(rand() * 4) : 9 + Math.floor(rand() * 11));

function act(type: string, objectType: string, objectId: string, projectId: string, at: string, extra: any = {}, parentItem: string | null = null) {
  acts.push({
    event_date: micro(at), event_type: type, extra_data: { client: 'Fixture/1.0', note_count: 0, ...extra },
    extra_data_id: null, id: 1e30 + acts.length, initiator_id: String(UID), object_id: objectId, object_type: objectType,
    parent_item_id: parentItem, parent_project_id: projectId,
  });
}

// projects: added events + archived project that only exists in events
for (const p of projects) act('added', 'project', p.id, p.id, '2024-03-10T09:00:00', { name: p.name });
act('added', 'project', ARCHIVED.id, ARCHIVED.id, '2024-04-01T10:00:00', { name: ARCHIVED.name });
act('archived', 'project', ARCHIVED.id, ARCHIVED.id, '2025-02-01T10:00:00', { name: ARCHIVED.name });
for (const s of sections) act('added', 'section', s.id, s.project, '2024-03-11T09:00:00', { name: s.name });

// one-off tasks
const start = '2024-03-10';
const end = '2026-11-15';
const totalDays = (Date.parse(end) - Date.parse(start)) / 86_400_000;
for (let k = 0; k < 600; k++) {
  const pid = k % 25 === 0 ? ARCHIVED.id : pick(projects).id;
  if (pid === ARCHIVED.id && k > 300) continue;
  const created = addDays(start, Math.floor(rand() * totalDays));
  const createdAt = wall(created, chance(0.2) ? 15 : 8 + Math.floor(rand() * 14), Math.floor(rand() * 60));
  const id = newId('T');
  const content = `${pick(verbs)} ${pick(projText[pid])}`;
  const hasDue = chance(0.75);
  let due = hasDue ? addDays(created, Math.floor(rand() * 10)) : null;
  const lbls = chance(0.5) ? [pick(labels)].concat(chance(0.3) ? [pick(labels)] : []) : [];
  const uniq = [...new Set(lbls)];
  const apiPrio = chance(0.08) ? 4 : chance(0.1) ? 3 : chance(0.1) ? 2 : 1;
  const section = pid === 'PMOON' && chance(0.5) ? 'SDOME' : pid === 'PTIME' && chance(0.5) ? 'SFLUX' : null;
  const deadline = hasDue && chance(0.08) ? addDays(due!, 2) : null;
  act('added', 'item', id, pid, createdAt, {
    content, due_date: due ? eod(due) : null, labels: uniq, priority: apiPrio, date_added: micro(createdAt), added_by_uid: UID,
    child_order: k, ...(section ? { section_id: section } : {}),
  });
  // reschedules
  let postpones = 0;
  if (due && chance(0.3)) {
    const n = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < n; r++) {
      const nd = addDays(due, 1 + Math.floor(rand() * 4));
      act('updated', 'item', id, pid, wall(due, 21, 30), { content, due_date: eod(nd), last_due_date: eod(due) });
      due = nd;
      postpones++;
    }
  }
  const completes = chance(0.85) && created < '2026-11-14';
  const deleted = !completes && chance(0.3);
  let completedAt: string | null = null;
  if (completes) {
    const lag = chance(0.25) ? 0 : Math.floor(rand() * 20);
    let doneDate = addDays(created, lag);
    if (doneDate > end) doneDate = end;
    completedAt = wall(doneDate, nightOwlHour(), Math.floor(rand() * 60));
    if (completedAt < createdAt) completedAt = wall(created, 23, 50);
    act('completed', 'item', id, pid, completedAt, { content, due_date: due ? eod(due) : null, labels: uniq, priority: apiPrio });
    if (k % 97 === 0) {
      // accidental completion undone, then done for real later
      act('uncompleted', 'item', id, pid, completedAt.replace(/:\d{2}$/, ':59'), { content });
      completedAt = wall(addDays(completedAt.slice(0, 10), 1), 22, 15);
      act('completed', 'item', id, pid, completedAt, { content, due_date: due ? eod(due) : null, labels: uniq, priority: apiPrio });
    }
  }
  if (deleted) act('deleted', 'item', id, pid, wall(addDays(created, 3), 12, 0), { content });
  if (chance(0.05)) {
    const nid = newId('N');
    const at = wall(created, 13, 0);
    act('added', 'note', nid, pid, at, { content: 'Remember the space glue' }, id);
    if (pid !== ARCHIVED.id) notes.push({ content: 'Remember the space glue', file_attachment: chance(0.3) ? { resource_type: 'website', title: 'Space glue', url: 'https://example.com/glue' } : null, id: nid, initiated_by_uid: UID, instance_id: nid, is_deleted: false, posted: iso(at), posted_uid: UID, project_id: pid, reactions: {}, uids_to_notify: [], updated_at: '1970-01-01T00:00:00Z', upload_id: null });
  }
  if (pid === ARCHIVED.id || deleted) continue; // not in items file
  items.push({
    added_by_uid: UID, assigned_by_uid: null, child_order: k, complete_count: completes ? 1 : 0, completed_by_uid: completes ? UID : null,
    content, date_added: iso(createdAt), date_completed: completedAt ? iso(completedAt) : null,
    deadline: deadline ? `${deadline}T00:00:00Z` : null, deadline_lang: deadline ? 'en' : null, description: '',
    due: due ? { date: due, is_recurring: false, lang: 'en', string: due, timezone: null } : null,
    id, in_history: completes, initiated_by_uid: UID, is_completed: completes, is_deleted: false, labels: uniq, order_key: null,
    parent_id: null, postpone_count: postpones, priority: apiPrio, project_id: pid, responsible_uid: null, section_id: section,
    updated_at: completedAt ? iso(completedAt) : iso(createdAt), was_overdue: null,
  });
}

// subtasks under one big parent
const parentId = newId('T');
items.push({ added_by_uid: UID, assigned_by_uid: null, child_order: 0, complete_count: 1, completed_by_uid: UID, content: 'Rebuild the moon dome', date_added: iso('2025-01-05T10:00:00'), date_completed: iso('2025-03-01T22:00:00'), deadline: null, deadline_lang: null, description: '', due: null, id: parentId, in_history: true, initiated_by_uid: UID, is_completed: true, is_deleted: false, labels: [], order_key: null, parent_id: null, postpone_count: 0, priority: 4, project_id: 'PMOON', responsible_uid: null, section_id: 'SDOME', updated_at: iso('2025-03-01T22:00:00'), was_overdue: null });
act('added', 'item', parentId, 'PMOON', '2025-01-05T10:00:00', { content: 'Rebuild the moon dome', priority: 4 });
for (let s = 0; s < 8; s++) {
  const sid = newId('T');
  const at = `2025-0${1 + Math.floor(s / 4)}-${String(10 + s).padStart(2, '0')}T21:${String(10 + s).padStart(2, '0')}:00`;
  act('added', 'item', sid, 'PMOON', '2025-01-05T10:05:00', { content: `Dome panel ${s + 1}`, parent_id: parentId });
  act('completed', 'item', sid, 'PMOON', at, { content: `Dome panel ${s + 1}`, parent_id: parentId });
  items.push({ added_by_uid: UID, assigned_by_uid: null, child_order: s, complete_count: 1, completed_by_uid: UID, content: `Dome panel ${s + 1}`, date_added: iso('2025-01-05T10:05:00'), date_completed: iso(at), deadline: null, deadline_lang: null, description: '', due: null, id: sid, in_history: true, initiated_by_uid: UID, is_completed: true, is_deleted: false, labels: [], order_key: null, parent_id: parentId, postpone_count: 0, priority: 1, project_id: 'PMOON', responsible_uid: null, section_id: 'SDOME', updated_at: iso(at), was_overdue: null });
}

// recurring routines
const routines = [
  { content: 'Water the cactus', pid: 'PCACT', string: 'every day', rate: 0.85, from: '2024-04-01', to: null as string | null, step: (d: string) => addDays(d, 1), dayOk: (_d: string) => true },
  { content: 'Feed the moon cat', pid: 'PMOON', string: 'every weekday', rate: 0.95, from: '2024-06-01', to: null, step: (d: string) => addDays(d, 1), dayOk: (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) },
  { content: 'Polish the telescope', pid: 'PMOON', string: 'every mon, thu', rate: 0.7, from: '2024-05-01', to: null, step: (d: string) => addDays(d, 1), dayOk: (d: string) => [1, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) },
  { content: 'Check llama mood', pid: 'PLLAMA', string: 'every week', rate: 0.9, from: '2024-04-01', to: '2025-07-20', step: (d: string) => addDays(d, 7), dayOk: (_d: string) => true },
];
for (const r of routines) {
  const id = newId('R');
  act('added', 'item', id, r.pid, `${r.from}T08:00:00`, { content: r.content, due_date: eod(r.from), is_recurring: true });
  let d = r.from;
  let count = 0;
  let last: string | null = null;
  const stop = r.to ?? end;
  while (d <= stop) {
    if (r.dayOk(d) && chance(r.rate)) {
      const at = wall(d, nightOwlHour(), Math.floor(rand() * 60));
      let next = r.step(d);
      while (!r.dayOk(next)) next = addDays(next, 1);
      act('completed', 'item', id, r.pid, at, { content: r.content, due_date: eod(next), ...(d >= '2025-01-01' ? { is_recurring: true, completed_due_date: eod(d), completed_date_source: 'due_date', completed_due_date_local: `${d}T23:59:59` } : {}) });
      count++;
      last = at;
    }
    d = r.step(d);
  }
  if (r.to) {
    act('deleted', 'item', id, r.pid, `${r.to}T12:00:00`, { content: r.content });
    continue;
  }
  let nextDue = addDays(end, 1);
  while (!r.dayOk(nextDue)) nextDue = addDays(nextDue, 1);
  items.push({ added_by_uid: UID, assigned_by_uid: null, child_order: 0, complete_count: count, completed_by_uid: null, content: r.content, date_added: iso(`${r.from}T08:00:00`), date_completed: last ? iso(last) : null, deadline: null, deadline_lang: null, description: '', due: { date: nextDue, is_recurring: true, lang: 'en', string: r.string, timezone: null }, id, in_history: false, initiated_by_uid: UID, is_completed: false, is_deleted: false, labels: ['outside'], order_key: null, parent_id: null, postpone_count: 0, priority: 1, project_id: r.pid, responsible_uid: null, section_id: null, updated_at: last ? iso(last) : iso(`${r.from}T08:00:00`), was_overdue: null });
}

// 2026 moves (the real export only logs "moved" events recently)
const movable = items.filter((i) => i.project_id === 'PINBOX' && i.date_added > '2026-02' && !i.parent_id).slice(0, 5);
for (const m of movable) {
  act('moved', 'item', m.id, 'PBOOK', m.date_added.slice(0, 10) + 'T16:00:00', { content: m.content, source_project_id: 'PINBOX', destination_project_id: 'PBOOK' });
  m.project_id = 'PBOOK';
}

acts.sort((a, b) => (a.event_date < b.event_date ? 1 : -1)); // real export is newest-first
const projFile = projects.map((p) => [
  { collaborator_role_default: 'READ_WRITE', color: p.color, created_at: '2024-03-10T14:00:00Z', creator_uid: UID, default_order: 0, default_order_key: null, description: '', icon: 0, id: p.id, initiated_by_uid: UID, is_link_sharing_enabled: false, is_user_inbox: Boolean(p.inbox), name: p.name, public_access: false, status: 'IN_PROGRESS', updated_at: '1970-01-01T00:00:00Z', view_style: 'list' },
  { archived_date: null, archived_timestamp: 0, created_at: '2024-03-10T14:00:00Z', is_archived: false, is_collapsed: false, is_favorite: false, is_frozen: false, project_id: p.id, role: 'CREATOR', updated_at: '1970-01-01T00:00:00Z', user_id: UID },
  null,
]);
const user = {
  activated_user: true, daily_goal: 5, weekly_goal: 25, id: String(UID), inbox_project_id: 'PINBOX', is_premium: true,
  joined_at: '2024-03-10T14:00:00.000000Z', karma: 4242, karma_trend: 'up', lang: 'en', start_day: 1,
  tz_info: { gmt_string: '-05:00', hours: -5, is_dst: 0, minutes: 0, timezone: 'US/Eastern' },
};

fs.mkdirSync(OUT, { recursive: true });
const w = (name: string, obj: unknown) =>
  fs.writeFileSync(
    path.join(OUT, name),
    Array.isArray(obj) ? '[\n' + obj.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n' : JSON.stringify(obj, null, 2) + '\n',
  );
const half = Math.ceil(acts.length / 2);
w('activities_0000.json', acts.slice(0, half));
w('activities_0001.json', acts.slice(half));
w('items_0000.json', items);
w('projects_0000.json', projFile);
w('notes_0000.json', notes);
w('labels_0000.json', labels.map((n, i) => ({ color: pick(['red', 'teal', 'grape', 'lime_green']), id: `L${i}`, is_deleted: false, is_favorite: false, item_order: i, name: n, order_key: 'a' })));
w('filters_0000.json', [{ color: 'charcoal', description: '', id: 'F1', is_deleted: false, is_favorite: true, is_frozen: false, item_order: 0, name: 'Moon stuff', order_key: 'a', query: '#Moon Base Renovation' }]);
w('reminders_0000.json', []);
w('user.json', user);
w('karma.json', { karma: [4242, 'up'] });
w('goals.json', { daily_goal: 5, ignore_days: [6, 7], user: UID, vacation_mode: 0, weekly_goal: 25 });
console.log(`fixtures: ${items.length} items, ${acts.length} events, ${notes.length} notes → ${OUT}`);
