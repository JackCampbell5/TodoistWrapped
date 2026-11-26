// Normalized, source-agnostic data model. Adapters (support export now, API later)
// produce a NormalizedData; aggregation code only ever sees these types.

export type Priority = 1 | 2 | 3 | 4; // 1 = highest (P1)

export interface Due {
  date: string; // local YYYY-MM-DD
  datetime?: string; // UTC ISO when the due has a time
  isRecurring: boolean;
  recurrenceString?: string;
}

export interface Task {
  id: string;
  content: string;
  description?: string;
  projectId: string;
  sectionId?: string;
  parentId?: string;
  labels: string[];
  priority: Priority;
  createdAt?: string; // UTC ISO
  completedAt?: string; // last net completion, UTC ISO
  isCompleted: boolean;
  due?: Due;
  deadline?: string; // YYYY-MM-DD
  durationMinutes?: number;
  postponeCount: number;
  completeCount: number;
  isDeleted: boolean;
  deletedAt?: string;
  isRecurring: boolean;
  assigneeId?: string;
  commentCount: number;
  source: 'items' | 'events-only' | 'api';
}

export interface Project {
  id: string;
  name: string;
  color: string; // hex
  colorName?: string;
  parentId?: string;
  isArchived: boolean;
  isDeleted: boolean;
  isInbox: boolean;
  isShared: boolean;
  createdAt?: string;
  firstActivityAt?: string;
  lastActivityAt?: string;
  source: 'projects' | 'events-only' | 'api';
}

export interface Section {
  id: string;
  projectId?: string;
  name?: string;
}

export interface Label {
  name: string;
  color?: string;
}

export interface Comment {
  id: string;
  taskId?: string;
  projectId?: string;
  postedAt: string;
  hasAttachment: boolean;
}

export type EventType =
  | 'added'
  | 'completed'
  | 'uncompleted'
  | 'updated'
  | 'rescheduled'
  | 'moved'
  | 'deleted'
  | 'archived'
  | 'unarchived';

export interface DueRef {
  date: string;
  datetime?: string;
}

export interface Event {
  ts: string; // UTC ISO
  type: EventType;
  objectType: 'item' | 'project' | 'section' | 'note';
  objectId: string;
  projectId?: string;
  taskId?: string; // for notes: parent task
  extra?: {
    dueFrom?: DueRef;
    dueTo?: DueRef;
    fromProjectId?: string;
    toProjectId?: string;
  };
}

/** One net completion (after cancelling out "uncompleted" events). */
export interface Completion {
  taskId: string;
  ts: string; // UTC ISO
  projectId: string;
  content: string;
  labels: string[];
  priority: Priority;
  parentId?: string;
  sectionId?: string;
  dueAtCompletion?: DueRef;
  isRecurringOccurrence: boolean;
}

export interface Account {
  joinedAt?: string;
  timezone?: string;
  karma?: number;
  karmaTrend?: string;
  dailyGoal?: number;
  weeklyGoal?: number;
  isPremium?: boolean;
  inboxProjectId?: string;
  userId?: string;
  counts: { filters: number; reminders: number; labels: number; attachments: number };
}

/** What the source could and couldn't provide; aggregation turns this into data-health notes. */
export interface SourceHealth {
  hasEventLog: boolean;
  eventLogRange?: { first: string; last: string };
  durationEvents: number;
  sectionsNamed: number;
  sectionsTotal: number;
  hasKarmaHistory: boolean;
  collaboratorCount: number;
  completionTimeMismatches: number; // task record vs event log disagreements (event log wins)
  eventOnlyTasks: number;
  eventOnlyProjects: number;
  notes: string[];
}

export interface NormalizedData {
  source: string;
  account: Account;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  tasks: Task[];
  comments: Comment[];
  events: Event[];
  completions: Completion[];
  health: SourceHealth;
}

/** Any data source (support export, future read-only API) implements this. */
export interface SourceAdapter {
  readonly name: string;
  load(): Promise<NormalizedData>;
}
