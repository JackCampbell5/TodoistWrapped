// Adapter for the Todoist support personal-data export (a ZIP of JSON files).
// Shape confirmed by inspecting a real export (2026-11):
//   activities_NNNN.json  event log (item/note/project/section events, full history)
//   items_NNNN.json       non-deleted tasks (completed + open), API-inverted priority
//   projects_NNNN.json    active projects as [project, membership, null] triples
//   notes_NNNN.json       comments (project_id only; task link comes from note events)
//   labels_/filters_/reminders_NNNN.json, user.json, karma.json, goals.json
// authorizations_* and locations_* are never read.
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { resolveColor, DEFAULT_COLOR } from '../colors.ts';
import { decodeDeadline, decodeEventDue, decodeItemDue, isoUtc, parseTs } from '../time.ts';
import type {
  Account, Comment, Completion, DueRef, Event, Label, NormalizedData, Priority, Project,
  Section, SourceAdapter, SourceHealth, Task,
} from '../types.ts';

type Json = any; // raw export records are untyped
const NEVER_READ = /^(authorizations|locations)_/;

/** API priority (4 = P1 ... 1 = none) → normalized (1 = P1 ... 4 = none). */
export function normalizePriority(apiPriority: unknown): Priority {
  const p = typeof apiPriority === 'number' ? apiPriority : 1;
  return (5 - Math.min(4, Math.max(1, p))) as Priority;
}

/** Collect export JSON files from a folder (recursively) or a ZIP, keyed by basename. */
export function readExportFiles(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const add = (name: string, text: () => string) => {
    const base = path.basename(name);
    if (!base.endsWith('.json') || NEVER_READ.test(base)) return;
    if (!out.has(base)) out.set(base, text());
  };
  const addZip = (buf: Uint8Array) => {
    const files = unzipSync(buf, { filter: (f) => f.name.endsWith('.json') && !NEVER_READ.test(path.basename(f.name)) });
    for (const [name, data] of Object.entries(files)) add(name, () => strFromU8(data));
  };
  const walk = (p: string) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f));
    else if (p.toLowerCase().endsWith('.zip')) addZip(fs.readFileSync(p));
    else add(p, () => fs.readFileSync(p, 'utf8'));
  };
  walk(source);
  return out;
}

function group(files: Map<string, string>, prefix: string): Json[] {
  const names = [...files.keys()].filter((n) => n === `${prefix}.json` || new RegExp(`^${prefix}_\\d+\\.json$`).test(n)).sort();
  return names.flatMap((n) => {
    const j = JSON.parse(files.get(n)!);
    return Array.isArray(j) ? j : [j];
  });
}

const DEDUP_SEP = '\u0001';

export class ExportAdapter implements SourceAdapter {
  readonly name = 'todoist-support-export';
  constructor(private readonly sourcePath: string) {}

  async load(): Promise<NormalizedData> {
    return parseExport(readExportFiles(this.sourcePath), this.sourcePath);
  }
}

export function parseExport(files: Map<string, string>, sourceLabel = 'export'): NormalizedData {
  const rawUser: Json = group(files, 'user')[0] ?? {};
  const rawItems = group(files, 'items');
  const rawActs = group(files, 'activities');
  const rawProjects = group(files, 'projects');
  const rawNotes = group(files, 'notes');
  const rawLabels = group(files, 'labels');
  const rawFilters = group(files, 'filters');
  const rawReminders = group(files, 'reminders');
  const notesHealth: string[] = [];

  // ---- account (only non-identifying fields are read)
  const account: Account = {
    joinedAt: rawUser.joined_at ? isoUtc(rawUser.joined_at) : undefined,
    timezone: rawUser.tz_info?.timezone,
    karma: typeof rawUser.karma === 'number' ? rawUser.karma : undefined,
    karmaTrend: rawUser.karma_trend,
    dailyGoal: rawUser.daily_goal,
    weeklyGoal: rawUser.weekly_goal,
    isPremium: rawUser.is_premium,
    inboxProjectId: rawUser.inbox_project_id,
    userId: rawUser.id != null ? String(rawUser.id) : undefined,
    counts: {
      filters: rawFilters.filter((f) => !f.is_deleted).length,
      reminders: rawReminders.filter((r) => !r.is_deleted).length,
      labels: rawLabels.filter((l) => !l.is_deleted).length,
      attachments: rawNotes.filter((n) => n.file_attachment && !n.is_deleted).length,
    },
  };

  // ---- events (deduped by object/type/timestamp; the numeric event id loses precision)
  const seen = new Set<string>();
  const acts: Json[] = [];
  for (const a of rawActs) {
    if (!a?.event_date || !a.object_id) continue;
    const key = [a.object_type, a.object_id, a.event_type, a.event_date].join(DEDUP_SEP);
    if (seen.has(key)) continue;
    seen.add(key);
    a._ms = parseTs(a.event_date);
    acts.push(a);
  }
  acts.sort((x, y) => x._ms - y._ms);

  // ---- projects: file (active) + names recovered from project events (archived/deleted)
  const projects = new Map<string, Project>();
  for (const rec of rawProjects) {
    const p = Array.isArray(rec) ? rec[0] : rec;
    const membership = Array.isArray(rec) ? rec[1] : undefined;
    if (!p?.id) continue;
    const c = resolveColor(p.color);
    projects.set(p.id, {
      id: p.id,
      name: p.name ?? 'Untitled project',
      color: c.hex,
      colorName: c.name,
      parentId: p.parent_id ?? undefined,
      isArchived: Boolean(membership?.is_archived ?? p.is_archived),
      isDeleted: Boolean(p.is_deleted),
      isInbox: Boolean(p.is_user_inbox) || p.id === account.inboxProjectId,
      isShared: Boolean(p.shared ?? p.is_shared),
      createdAt: p.created_at ? isoUtc(p.created_at) : undefined,
      source: 'projects',
    });
  }
  const projEventName = new Map<string, string>();
  const projArchive = new Map<string, boolean>();
  for (const a of acts) {
    if (a.object_type !== 'project') continue;
    if (a.extra_data?.name) projEventName.set(a.object_id, a.extra_data.name);
    if (a.event_type === 'archived') projArchive.set(a.object_id, true);
    if (a.event_type === 'unarchived') projArchive.set(a.object_id, false);
  }
  const ensureProject = (id: string | null | undefined): string => {
    const pid = id ?? 'unknown';
    if (!projects.has(pid)) {
      const archived = projArchive.get(pid) === true;
      projects.set(pid, {
        id: pid,
        name: projEventName.get(pid) ?? 'Unknown project',
        color: DEFAULT_COLOR.hex,
        colorName: DEFAULT_COLOR.name,
        isArchived: archived,
        isDeleted: !archived,
        isInbox: pid === account.inboxProjectId,
        isShared: false,
        source: 'events-only',
      });
    }
    return pid;
  };
  for (const a of acts) if (a.parent_project_id) ensureProject(a.parent_project_id);

  // ---- sections: no sections file in the export; names only via section events
  const sections = new Map<string, Section>();
  const ensureSection = (id: string | null | undefined, projectId?: string) => {
    if (!id) return undefined;
    const s = sections.get(id) ?? { id };
    if (!s.projectId && projectId) s.projectId = projectId;
    sections.set(id, s);
    return id;
  };
  for (const a of acts) {
    if (a.object_type === 'section') {
      ensureSection(a.object_id, a.parent_project_id ?? undefined);
      if (a.extra_data?.name) sections.get(a.object_id)!.name = a.extra_data.name;
    } else if (a.object_type === 'item' && a.extra_data?.section_id) {
      ensureSection(a.extra_data.section_id, a.parent_project_id ?? undefined);
    }
  }

  // ---- per-task event streams
  const itemEvents = new Map<string, Json[]>();
  for (const a of acts) {
    if (a.object_type !== 'item') continue;
    let list = itemEvents.get(a.object_id);
    if (!list) itemEvents.set(a.object_id, (list = []));
    list.push(a);
  }
  const noteCountByTask = new Map<string, number>();
  for (const a of acts) {
    if (a.object_type !== 'note' || !a.parent_item_id) continue;
    const d = a.event_type === 'added' ? 1 : a.event_type === 'deleted' ? -1 : 0;
    noteCountByTask.set(a.parent_item_id, (noteCountByTask.get(a.parent_item_id) ?? 0) + d);
  }

  // ---- tasks from items file
  const tasks = new Map<string, Task>();
  for (const i of rawItems) {
    if (!i?.id) continue;
    const projectId = ensureProject(i.project_id);
    const due = i.due?.date
      ? { ...decodeItemDue(i.due.date), isRecurring: Boolean(i.due.is_recurring), recurrenceString: i.due.string || undefined }
      : undefined;
    tasks.set(i.id, {
      id: i.id,
      content: i.content ?? '',
      description: i.description || undefined,
      projectId,
      sectionId: ensureSection(i.section_id, projectId),
      parentId: i.parent_id ?? undefined,
      labels: Array.isArray(i.labels) ? i.labels : [],
      priority: normalizePriority(i.priority),
      createdAt: i.date_added ? isoUtc(i.date_added) : undefined,
      completedAt: i.date_completed ? isoUtc(i.date_completed) : undefined,
      isCompleted: Boolean(i.is_completed ?? i.checked),
      due,
      deadline: decodeDeadline(i.deadline),
      durationMinutes: i.duration?.amount ?? undefined,
      postponeCount: i.postpone_count ?? 0,
      completeCount: i.complete_count ?? 0,
      isDeleted: Boolean(i.is_deleted),
      isRecurring: Boolean(i.due?.is_recurring),
      assigneeId: i.responsible_uid != null ? String(i.responsible_uid) : undefined,
      commentCount: Math.max(0, noteCountByTask.get(i.id) ?? 0),
      source: 'items',
    });
  }

  // ---- walk each task's events: completions (net of uncompletes), dues, reschedules, deletes
  const events: Event[] = [];
  const completions: Completion[] = [];
  let mismatches = 0;
  let durationEvents = 0;

  for (const [taskId, evs] of itemEvents) {
    let task = tasks.get(taskId);
    if (!task) {
      // Deleted task or task in an archived/deleted project: rebuild from its events.
      const last = evs[evs.length - 1];
      const firstAdded = evs.find((e) => e.event_type === 'added');
      const withContent = [...evs].reverse().find((e) => e.extra_data?.content);
      const withPrio = [...evs].reverse().find((e) => typeof e.extra_data?.priority === 'number');
      const withLabels = [...evs].reverse().find((e) => Array.isArray(e.extra_data?.labels));
      const withParent = [...evs].reverse().find((e) => e.extra_data?.parent_id);
      const withSection = [...evs].reverse().find((e) => e.extra_data?.section_id);
      const created = firstAdded?.event_date ?? evs.find((e) => e.extra_data?.date_added)?.extra_data.date_added;
      const projectId = ensureProject(last.parent_project_id);
      task = {
        id: taskId,
        content: withContent?.extra_data.content ?? '',
        projectId,
        sectionId: ensureSection(withSection?.extra_data.section_id, projectId),
        parentId: withParent?.extra_data.parent_id ?? undefined,
        labels: withLabels?.extra_data.labels ?? [],
        priority: normalizePriority(withPrio?.extra_data.priority),
        createdAt: created ? isoUtc(created) : undefined,
        isCompleted: false,
        postponeCount: 0,
        completeCount: 0,
        isDeleted: false,
        isRecurring: false,
        commentCount: Math.max(0, noteCountByTask.get(taskId) ?? 0),
        source: 'events-only',
      };
      tasks.set(taskId, task);
    }

    const stack: Completion[] = [];
    let currentDue: DueRef | undefined;
    let flaggedRecurring = task.isRecurring || evs.some((e) => e.extra_data?.is_recurring);
    let lastCompletedState = false;
    let reschedules = 0;

    for (const e of evs) {
      const x = e.extra_data ?? {};
      const ts = new Date(e._ms).toISOString();
      const projectId = ensureProject(e.parent_project_id ?? task.projectId);
      if (x.duration) durationEvents++;
      switch (e.event_type) {
        case 'added':
          if ('due_date' in x) currentDue = decodeEventDue(x.due_date, x.has_time);
          events.push({ ts, type: 'added', objectType: 'item', objectId: taskId, projectId });
          break;
        case 'updated': {
          const hadDue = 'due_date' in x;
          const next = hadDue ? decodeEventDue(x.due_date, x.has_time) : currentDue;
          const prev = x.last_due_date ? decodeEventDue(x.last_due_date, x.has_time) : undefined;
          if (prev && next && (prev.date !== next.date || prev.datetime !== next.datetime)) {
            reschedules++;
            events.push({ ts, type: 'rescheduled', objectType: 'item', objectId: taskId, projectId, extra: { dueFrom: prev, dueTo: next } });
          } else {
            events.push({ ts, type: 'updated', objectType: 'item', objectId: taskId, projectId });
          }
          if (hadDue) currentDue = next;
          break;
        }
        case 'completed': {
          let dueAt: DueRef | undefined;
          if (x.completed_due_date) dueAt = decodeEventDue(x.completed_due_date, x.has_time);
          else if (flaggedRecurring) dueAt = currentDue ?? (x.due_date ? decodeEventDue(x.due_date, x.has_time) : undefined);
          else dueAt = 'due_date' in x ? decodeEventDue(x.due_date, x.has_time) : currentDue;
          if (!dueAt && !flaggedRecurring && task.source === 'items' && task.due) dueAt = { date: task.due.date, datetime: task.due.datetime };
          const c: Completion = {
            taskId,
            ts,
            projectId,
            content: x.content ?? task.content,
            labels: Array.isArray(x.labels) ? x.labels : task.labels,
            priority: typeof x.priority === 'number' ? normalizePriority(x.priority) : task.priority,
            parentId: x.parent_id ?? task.parentId,
            sectionId: x.section_id ?? task.sectionId,
            dueAtCompletion: dueAt,
            isRecurringOccurrence: false,
          };
          stack.push(c);
          if (stack.length > 1) flaggedRecurring = true;
          // Completing a recurring task moves its due to the next occurrence.
          if ('due_date' in x && x.due_date) currentDue = decodeEventDue(x.due_date, x.has_time);
          lastCompletedState = true;
          events.push({ ts, type: 'completed', objectType: 'item', objectId: taskId, projectId });
          break;
        }
        case 'uncompleted':
          stack.pop(); // cancels the most recent completion
          lastCompletedState = false;
          events.push({ ts, type: 'uncompleted', objectType: 'item', objectId: taskId, projectId });
          break;
        case 'moved':
          events.push({
            ts, type: 'moved', objectType: 'item', objectId: taskId, projectId,
            extra: { fromProjectId: x.source_project_id, toProjectId: x.destination_project_id },
          });
          break;
        case 'deleted':
          task.isDeleted = task.source === 'events-only' ? true : task.isDeleted;
          task.deletedAt = ts;
          events.push({ ts, type: 'deleted', objectType: 'item', objectId: taskId, projectId });
          break;
        default:
          break;
      }
    }

    if (stack.length > 1) flaggedRecurring = true;
    task.isRecurring = flaggedRecurring;
    for (const c of stack) {
      c.isRecurringOccurrence = flaggedRecurring;
      completions.push(c);
    }
    if (task.source === 'events-only') {
      task.isCompleted = lastCompletedState && stack.length > 0;
      task.completeCount = stack.length;
      task.postponeCount = reschedules;
      // An event-only task that still exists would be in items; treat it as gone.
      // Without a delete event (e.g. its project was deleted), its last event approximates when it left.
      if (!task.isDeleted) task.isDeleted = true;
      if (!task.deletedAt && !task.isCompleted) task.deletedAt = new Date(evs[evs.length - 1]._ms).toISOString();
    }
    const lastNet = stack[stack.length - 1]?.ts;
    if (lastNet) {
      if (task.completedAt && Math.abs(parseTs(task.completedAt) - parseTs(lastNet)) > 120_000) mismatches++;
      task.completedAt = lastNet; // event log wins over the task record
    } else if (task.source === 'events-only') {
      task.completedAt = undefined;
    }
  }

  // Tasks completed per the items file but with no completion event (no activity history).
  for (const t of tasks.values()) {
    if (t.source !== 'items' || itemEvents.has(t.id)) continue;
    if (t.createdAt) events.push({ ts: t.createdAt, type: 'added', objectType: 'item', objectId: t.id, projectId: t.projectId });
    if (t.isCompleted && t.completedAt) {
      completions.push({
        taskId: t.id, ts: t.completedAt, projectId: t.projectId, content: t.content, labels: t.labels,
        priority: t.priority, parentId: t.parentId, sectionId: t.sectionId,
        dueAtCompletion: t.due ? { date: t.due.date, datetime: t.due.datetime } : undefined,
        isRecurringOccurrence: t.isRecurring,
      });
      events.push({ ts: t.completedAt, type: 'completed', objectType: 'item', objectId: t.id, projectId: t.projectId });
    }
  }

  // ---- project-level events + activity ranges
  for (const a of acts) {
    if (a.object_type === 'project' && ['added', 'archived', 'unarchived', 'updated'].includes(a.event_type)) {
      events.push({ ts: new Date(a._ms).toISOString(), type: a.event_type, objectType: 'project', objectId: a.object_id, projectId: a.object_id });
    }
    if (a.object_type === 'note' && a.event_type === 'added') {
      events.push({ ts: new Date(a._ms).toISOString(), type: 'added', objectType: 'note', objectId: a.object_id, projectId: a.parent_project_id ?? undefined, taskId: a.parent_item_id ?? undefined });
    }
  }
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  completions.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  for (const e of events) {
    if (!e.projectId) continue;
    const p = projects.get(e.projectId);
    if (!p) continue;
    if (!p.firstActivityAt || e.ts < p.firstActivityAt) p.firstActivityAt = e.ts;
    if (!p.lastActivityAt || e.ts > p.lastActivityAt) p.lastActivityAt = e.ts;
  }

  // ---- comments: note "added" events carry the task link; notes file adds attachments
  const comments = new Map<string, Comment>();
  for (const a of acts) {
    if (a.object_type === 'note' && a.event_type === 'added') {
      comments.set(a.object_id, {
        id: a.object_id, taskId: a.parent_item_id ?? undefined, projectId: a.parent_project_id ?? undefined,
        postedAt: new Date(a._ms).toISOString(), hasAttachment: false,
      });
    }
  }
  for (const n of rawNotes) {
    if (!n?.id || n.is_deleted) continue;
    const c: Comment = comments.get(n.id) ?? { id: n.id, projectId: n.project_id, postedAt: isoUtc(n.posted), hasAttachment: false };
    c.hasAttachment = Boolean(n.file_attachment);
    if (!c.taskId && n.item_id) c.taskId = n.item_id;
    comments.set(n.id, c);
  }

  // ---- labels (file + any names used on tasks)
  const labels = new Map<string, Label>();
  for (const l of rawLabels) if (l?.name && !l.is_deleted) labels.set(l.name, { name: l.name, color: resolveColor(l.color).hex });
  for (const t of tasks.values()) for (const l of t.labels) if (!labels.has(l)) labels.set(l, { name: l });

  const uids = new Set<string>();
  for (const a of acts) if (a.initiator_id) uids.add(String(a.initiator_id));
  for (const i of rawItems) for (const k of ['responsible_uid', 'assigned_by_uid', 'added_by_uid', 'completed_by_uid']) if (i[k] != null) uids.add(String(i[k]));
  if (account.userId) uids.delete(account.userId);

  const sectionList = [...sections.values()];
  if (mismatches) notesHealth.push(`${mismatches} tasks had a different completion time in the task record than in the event log; the event log was used.`);
  const health: SourceHealth = {
    hasEventLog: acts.length > 0,
    eventLogRange: acts.length ? { first: new Date(acts[0]._ms).toISOString(), last: new Date(acts[acts.length - 1]._ms).toISOString() } : undefined,
    durationEvents,
    sectionsNamed: sectionList.filter((s) => s.name).length,
    sectionsTotal: sectionList.length,
    hasKarmaHistory: false,
    collaboratorCount: uids.size,
    completionTimeMismatches: mismatches,
    eventOnlyTasks: [...tasks.values()].filter((t) => t.source === 'events-only').length,
    eventOnlyProjects: [...projects.values()].filter((p) => p.source === 'events-only').length,
    notes: notesHealth,
  };

  return {
    source: `${'todoist-support-export'}:${path.basename(sourceLabel)}`,
    account,
    projects: [...projects.values()],
    sections: sectionList,
    labels: [...labels.values()],
    tasks: [...tasks.values()],
    comments: [...comments.values()],
    events,
    completions,
    health,
  };
}
