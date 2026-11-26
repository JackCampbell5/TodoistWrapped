// Shape of the precomputed JSON in src/generated/. Shared by the pipeline (writer) and the app (reader).
// Entities are referenced by id; names and share-safe aliases live once in IndexFile.entities.

export interface EntityInfo {
  name: string;
  alias: string; // share-safe alias, computed at build time
  color: string; // hex
  theme?: string; // projects only
  archived?: boolean;
  deleted?: boolean;
}
export interface ThemeInfo {
  name: string;
  alias: string; // equals name when the theme came from your config
  color: string;
  fromConfig: boolean;
}
export interface Entities {
  projects: Record<string, EntityInfo>;
  labels: Record<string, EntityInfo>; // keyed by label name
  sections: Record<string, EntityInfo>;
  themes: Record<string, ThemeInfo>;
}

/** A task mention. `text` is hidden in share-safe mode; `safe` is shown instead. */
export interface TaskRef {
  text: string;
  safe: string;
  projectId: string;
}

export interface Counted { id: string; count: number; share: number }
export interface WordCount { word: string; count: number }

export interface Coverage {
  firstDate: string | null;
  lastDate: string | null;
  daysCovered: number;
  daysInPeriod: number;
  percent: number; // 0-100
}

export type HealthStatus = 'ok' | 'partial' | 'unavailable';
export interface HealthItem {
  group: string;
  status: HealthStatus;
  message: string;
}

export interface Classics {
  completions: number; // every net completion, recurring occurrences included
  tasksFinished: number; // distinct non-recurring tasks completed
  recurringCompletions: number;
  created: number;
  completionRate: { created: number; completed: number; rate: number };
  subtasksCompleted: number;
  commentsWritten: number;
  uniqueProjects: number;
  uniqueLabels: number;
  activeDays: number;
  dailyAverage: number;
  topProjects: Counted[];
  topLabels: Counted[];
  topSections: Counted[];
  priority: { p1: number; p2: number; p3: number; p4: number };
  karma: { current: number; trend?: string } | null;
  topProject: {
    id: string;
    count: number;
    share: number;
    firstTask: { task: TaskRef; ts: string } | null;
    busiestMonth: { month: string; count: number } | null;
    topWords: WordCount[];
    biggestParent: { task: TaskRef; subtasks: number } | null;
  } | null;
  busiestDay: { date: string; count: number; tasks: TaskRef[] } | null;
  longestStreak: { days: number; start: string; end: string } | null;
  longestDrySpell: { days: number; start: string; end: string } | null;
  crusher: { topPercent: number; basis: string };
}

export interface Habits {
  byMonth: { month: string; count: number }[];
  completionHeatmap: number[][]; // [dow 0=Sun][hour]
  creationHeatmap: number[][];
  calendar: { date: string; count: number }[];
  persona: { id: 'early-bird' | 'night-owl' | 'deadline-sprinter' | 'steady'; title: string; blurb: string; scores: Record<string, number> };
  weekdayWeekend: { weekday: number; weekend: number; weekdayPerDay: number; weekendPerDay: number };
  averageHour: number | null; // mean completion clock hour (day starts 4am), e.g. 14.5
  timeToComplete: {
    count: number;
    medianHours: number | null;
    buckets: { label: string; count: number }[];
    fastestProject: { id: string; medianHours: number; n: number } | null;
    slowestProject: { id: string; medianHours: number; n: number } | null;
    longestLingering: { task: TaskRef; days: number; createdAt: string; completedAt: string } | null;
  };
  oldestOpen: { task: TaskRef; createdAt: string; ageDays: number } | null;
  dueTiming: {
    withDue: number;
    early: number;
    onDay: number;
    late: number;
    noDue: number;
    avgDaysLate: number | null;
    dueTodayDoneToday: number; // rate 0-1 of due-dated completions
    lastMinute: { count: number; rate: number };
  };
  deadlines: { met: number; missed: number; openPastDeadline: number } | null;
  reschedules: {
    total: number;
    pushedLater: number;
    pulledEarlier: number;
    tasksRescheduled: number;
    mostRescheduled: { task: TaskRef; count: number }[];
  };
  taskDebt: { month: string; created: number; finished: number; deleted: number; cumulative: number }[];
  inboxZero: { days: number; longestRun: number; approximate: true } | null;
  sameDay: { count: number; of: number; rate: number };
  planningBurst: { date: string; hour: number; count: number } | null;
  sundayPlanner: { sundayShare: number; baseline: number; score: number };
}

export interface Themes {
  share: { theme: string; count: number; share: number }[];
  byMonth: { month: string; counts: Record<string, number> }[];
  seasons: { month: string; topProject: string | null; topTheme: string | null; count: number }[];
  newProjectsInTop10: string[];
  wentQuiet: { id: string; lastActiveMonth: string; count: number }[];
  keywords: WordCount[];
  keywordsByTheme: Record<string, WordCount[]>;
  labelCombos: { labels: string[]; count: number }[];
  milestones: { task: TaskRef; ts: string; keyword: string }[];
}

export interface Routines {
  recurringTasks: number;
  recurringCompletions: number;
  mostCompleted: { taskId: string; task: TaskRef; count: number }[];
  adherence: { taskId: string; task: TaskRef; rule: string; expected: number; completed: number; rate: number; longestChain: number; chainUnit: string }[];
  unparsedRecurring: number;
  died: { taskId: string; task: TaskRef; lastCompleted: string; completions: number }[];
  repeatedTitles: { task: TaskRef; count: number }[];
}

export interface Bonus {
  joinedAt: string | null;
  accountAgeDays: number | null;
  totals: { activeProjects: number; archivedProjects: number; deletedProjects: number; labels: number; filters: number; reminders: number; attachments: number; comments: number };
  shared: { sharedProjects: number; assignedToOthers: number; assignedByOthers: number; collaborators: number };
}

export interface YearStats {
  key: string; // "2026" or "all"
  label: string;
  coverage: Coverage;
  health: HealthItem[];
  classics: Classics;
  habits: Habits;
  themes: Themes;
  routines: Routines;
  bonus: Bonus;
}

export interface YearSummary {
  key: string;
  label: string;
  completions: number;
  coverage: Coverage;
}

export interface IndexFile {
  generatedAt: string;
  source: string;
  timezone: string;
  years: YearSummary[]; // newest first, then "all"
  entities: Entities;
  themesConfigured: boolean;
  health: HealthItem[];
}

export interface SearchEntry {
  id: string;
  kind: 'project' | 'label' | 'task';
  text: string; // task text or entity id/name key
  projectId?: string;
  total: number;
  first: string | null; // first activity date
  last: string | null;
  monthly: Record<string, number>; // YYYY-MM → completions
}
export interface SearchFile {
  entries: SearchEntry[];
}
