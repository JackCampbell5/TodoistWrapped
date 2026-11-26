import { describe, expect, it } from 'vitest';
import { normalizePriority, parseExport, readExportFiles } from '../src/pipeline/adapters/exportAdapter.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const UID = 1000001;
const ev = (event_type: string, object_id: string, event_date: string, extra: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  event_date, event_type, extra_data: { note_count: 0, ...extra }, extra_data_id: null, id: 1e30, initiator_id: String(UID),
  object_id, object_type: 'item', parent_item_id: null, parent_project_id: 'PMOON', ...more,
});
const item = (over: Record<string, unknown>) => ({
  added_by_uid: UID, child_order: 0, complete_count: 0, content: 'Water the cactus', date_added: '2026-01-01T15:00:00Z', date_completed: null,
  deadline: null, description: '', due: null, id: 'T1', in_history: false, is_completed: false, is_deleted: false, labels: [], parent_id: null,
  postpone_count: 0, priority: 1, project_id: 'PMOON', responsible_uid: null, section_id: null, ...over,
});
function files(obj: Record<string, unknown>) {
  return new Map(Object.entries(obj).map(([k, v]) => [k, JSON.stringify(v)]));
}
const baseProjects = [[{ id: 'PMOON', name: 'Moon Base Renovation', color: 41, is_user_inbox: false, created_at: '2026-01-01T00:00:00Z' }, { is_archived: false }, null]];

describe('normalizePriority', () => {
  it('flips the API encoding so 1 = P1', () => {
    expect([4, 3, 2, 1].map(normalizePriority)).toEqual([1, 2, 3, 4]);
    expect(normalizePriority(undefined)).toBe(4);
  });
});

describe('parseExport', () => {
  it('reads project triples and maps numeric colors', () => {
    const d = parseExport(files({ 'projects_0000.json': baseProjects, 'user.json': { id: String(UID) } }));
    expect(d.projects[0]).toMatchObject({ id: 'PMOON', name: 'Moon Base Renovation', color: '#4073ff', isArchived: false });
  });

  it('cancels a completion that was later uncompleted, and lets the event log win', () => {
    const d = parseExport(files({
      'projects_0000.json': baseProjects,
      'items_0000.json': [item({ is_completed: true, date_completed: '2026-01-02T15:00:00Z', priority: 4 })],
      'activities_0000.json': [
        ev('completed', 'T1', '2026-01-02T15:00:00.000000Z', { content: 'Water the cactus', priority: 4 }),
        ev('uncompleted', 'T1', '2026-01-02T15:00:30.000000Z'),
        ev('completed', 'T1', '2026-01-03T20:00:00.123456Z', { content: 'Water the cactus', priority: 4 }),
      ],
    }));
    expect(d.completions).toHaveLength(1);
    expect(d.completions[0]).toMatchObject({ ts: '2026-01-03T20:00:00.123Z', priority: 1, isRecurringOccurrence: false });
    expect(d.tasks[0].completedAt).toBe('2026-01-03T20:00:00.123Z');
    expect(d.health.completionTimeMismatches).toBe(1);
  });

  it('dedupes repeated events', () => {
    const e = ev('completed', 'T1', '2026-01-02T15:00:00.000000Z');
    const d = parseExport(files({ 'projects_0000.json': baseProjects, 'items_0000.json': [item({})], 'activities_0000.json': [e], 'activities_0001.json': [e] }));
    expect(d.completions).toHaveLength(1);
  });

  it('rebuilds deleted tasks and archived projects from events', () => {
    const d = parseExport(files({
      'projects_0000.json': baseProjects,
      'activities_0000.json': [
        { ...ev('added', 'PVOLC', '2025-01-01T10:00:00Z', { name: 'Volcano Lair Gift Shop' }), object_type: 'project', parent_project_id: 'PVOLC' },
        { ...ev('archived', 'PVOLC', '2025-06-01T10:00:00Z', { name: 'Volcano Lair Gift Shop' }), object_type: 'project', parent_project_id: 'PVOLC' },
        ev('added', 'GONE', '2025-02-01T10:00:00Z', { content: 'Paint the gift shop sign', priority: 3, labels: ['errand'] }, { parent_project_id: 'PVOLC' }),
        ev('completed', 'GONE', '2025-02-02T10:00:00Z', { content: 'Paint the gift shop sign' }, { parent_project_id: 'PVOLC' }),
      ],
    }));
    const p = d.projects.find((x) => x.id === 'PVOLC')!;
    expect(p).toMatchObject({ name: 'Volcano Lair Gift Shop', isArchived: true, source: 'events-only' });
    const t = d.tasks.find((x) => x.id === 'GONE')!;
    expect(t).toMatchObject({ content: 'Paint the gift shop sign', priority: 2, labels: ['errand'], source: 'events-only', isCompleted: true });
    expect(d.completions[0].projectId).toBe('PVOLC');
  });

  it('treats repeated completions as recurring and finds the due each occurrence satisfied', () => {
    const d = parseExport(files({
      'projects_0000.json': baseProjects,
      'items_0000.json': [item({ due: { date: '2026-01-04', is_recurring: true, string: 'every day', lang: 'en', timezone: null } })],
      'activities_0000.json': [
        ev('added', 'T1', '2026-01-01T15:00:00Z', { due_date: '2026-01-02T04:59:59.000000Z' }),
        ev('completed', 'T1', '2026-01-02T03:00:00Z', { due_date: '2026-01-03T04:59:59.000000Z' }),
        ev('completed', 'T1', '2026-01-03T02:00:00Z', { due_date: '2026-01-04T04:59:59.000000Z', completed_due_date: '2026-01-03T04:59:59.000000Z', is_recurring: true }),
      ],
    }));
    expect(d.tasks[0].isRecurring).toBe(true);
    expect(d.completions.map((c) => c.dueAtCompletion?.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(d.completions.every((c) => c.isRecurringOccurrence)).toBe(true);
  });

  it('turns due-date updates into reschedule events', () => {
    const d = parseExport(files({
      'projects_0000.json': baseProjects,
      'items_0000.json': [item({})],
      'activities_0000.json': [
        ev('updated', 'T1', '2026-01-02T12:00:00Z', { due_date: '2026-01-06T04:59:59.000000Z', last_due_date: '2026-01-03T04:59:59.000000Z' }),
        ev('updated', 'T1', '2026-01-02T13:00:00Z', { content: 'Water the big cactus' }),
      ],
    }));
    const r = d.events.filter((e) => e.type === 'rescheduled');
    expect(r).toHaveLength(1);
    expect(r[0].extra).toEqual({ dueFrom: { date: '2026-01-02' }, dueTo: { date: '2026-01-05' } });
  });

  it('never reads authorizations or locations files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdl-'));
    fs.writeFileSync(path.join(dir, 'authorizations_0000.json'), '["not-for-us"]');
    fs.writeFileSync(path.join(dir, 'locations_0000.json'), '[["x","1","2"]]');
    fs.writeFileSync(path.join(dir, 'labels_0000.json'), '[]');
    const got = readExportFiles(dir);
    expect([...got.keys()]).toEqual(['labels_0000.json']);
  });

  it('reads a ZIP directly, including nested folders', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdl-'));
    const zip = zipSync({ 'export/labels_0000.json': strToU8('[{"name":"quick","color":"red"}]'), 'export/authorizations_0000.json': strToU8('[]') });
    fs.writeFileSync(path.join(dir, 'export.zip'), zip);
    const got = readExportFiles(dir);
    expect([...got.keys()]).toEqual(['labels_0000.json']);
  });
});
