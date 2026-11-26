# My Done List

A private, local year-in-review of everything you finished in Todoist. It's built entirely from your personal-data export, with no network calls and no account connection.

- **Story mode**: about 25 full-screen animated slides per year, from total completions and streaks to your persona, routines, and a summary card.
- **Explore mode**: a dashboard with every stat and chart, sortable top-50 lists, search, a theme filter, a year-over-year compare view, and a data-health panel.
- **Share-safe mode**: hides task text and swaps project, label, and section names for neutral aliases, so you can screenshot without leaking anything.

Not affiliated with Doist or Spotify.

---

## Privacy first

Your task data is personal. This repo is set up so it can't be committed by accident:

| What | Where | Committed? |
|---|---|---|
| Your Todoist export | `data/raw/` | **Never** (gitignored + hook) |
| Generated stats JSON | `src/generated/` | **Never** (gitignored + hook) |
| Your themes config (real project names) | `config/themes.local.json` | **Never** (gitignored + hook) |
| API token (optional, future) | `.env` | **Never** (gitignored + hook) |
| Synthetic demo export | `fixtures/` | Yes, all fake ("Moon Base Renovation") |

### Pre-commit safety hook

Turn it on once per clone:

```sh
git config core.hooksPath .githooks
```

`.githooks/pre-commit` blocks a commit if any staged file:

1. is under `data/raw/`, `data/cache/`, `src/generated/`, `public/data/`, or is `config/*.local.json`, `.env` / `.env.*` (except `.env.example`), or any `*.zip`;
2. looks like a Todoist export outside `fixtures/`: it's named like an export file (`items_0000.json`, `activities_0003.json`, `user.json`, …) or contains several export field names (`event_type`, `parent_project_id`, `complete_count`, …);
3. contains a 40-character hex string (the Todoist API token format) or a `Bearer` token (lockfiles excepted).

---

## Setup

Requires Node 20+.

```sh
npm install
git config core.hooksPath .githooks
```

### 1. Get your Todoist export

Todoist's personal-data export comes from Todoist support, not from the app's backup feature:

1. Contact Todoist support (Help Center → Contact us) and ask for a **full export of your personal data**.
2. They'll send a ZIP of JSON files. It can take a few days.

### 2. Put it in `data/raw/`

Unzip it into `data/raw/` (or drop the `.zip` itself in there, and the build reads ZIPs directly). Nested folders are fine. You should end up with files like:

```
data/raw/activities_0000.json … activities_00NN.json   # the event log (the important one)
data/raw/items_0000.json …                              # tasks
data/raw/projects_0000.json  notes_0000.json  labels_0000.json  filters_0000.json
data/raw/reminders_0000.json  user.json  karma.json  goals.json
```

`authorizations_*` and `locations_*` files are never read.

Then check that nothing shows up as untracked:

```sh
git status   # should be clean
```

### 3. Group projects into themes (recommended)

The export has no project hierarchy, so "life themes" come from a config file:

```sh
npm run init:themes
```

This writes `config/themes.local.json` (gitignored), listing every project, most-completed first:

```json
{
  "projectThemes": {
    "Moon Base Renovation": "Space Program",
    "Cactus Care": "Garden",
    "Llama Grooming Co": ""
  },
  "milestoneKeywords": ["submit", "apply", "interview", "rehearsal"]
}
```

- Set each project to a theme name (e.g. School, Job Search, Clubs, Life). Leave `""` to keep a project as its own theme.
- You can also use `"themes": { "Space Program": ["Moon Base Renovation", "..."] }`. Project ids work too.
- `milestoneKeywords` drives the Milestone spotlight: finished tasks whose title matches one of these words.

See `config/themes.example.json` for the shape.

### 4. Build the stats and run

```sh
npm run build:data   # reads data/raw/, writes src/generated/*.json (~20s for a large export)
npm run dev          # open the printed localhost URL
```

Re-run `npm run build:data` whenever you change the export or your themes config.

**Just want a demo?** `npm run build:fixtures` builds stats from the fake export in `fixtures/`.

---

## Using it

- **Landing**: pick a year (or All time). You'll see how much of the year your data covers, plus notes on anything the export can't support.
- **Story mode**: click/tap the right side or press `→` / `space` to go forward, the left side or `←` to go back. Hold to pause, `P` to pause/play, `Esc` to exit. Auto-advance speed is configurable (4–12s or manual). Deep link to a slide: `#/story/2026/5`.
- **Explore mode**: section nav at the top, a theme filter, a `Table` toggle on every chart (exact values, screen-reader friendly), and click-to-sort top-50 tables. Deep link to a section: `#/explore/2026/routines`.
- **Share-safe mode**: header button or press `S`. It's remembered between visits and off by default. When it's on:
  - task text is replaced with "a task in Space Program 2";
  - projects, labels, and sections become aliases ("Project B", "Label C", "Section 4", or theme-based like "School 2"). Themes you named in config stay as-is; fallback themes named after a project get aliased too;
  - keyword clouds, milestone titles, busiest-day task lists, and task search are hidden (counts only);
  - all numbers, charts, and timing stats stay the same;
  - a green bar shows under the header, and the summary card shows a "Share-safe on" badge.

Respects `prefers-reduced-motion`, works with keyboard only, and every chart has a text equivalent.

---

## Commands

| Command | What it does |
|---|---|
| `npm run build:data` | Build stats from `data/raw/` → `src/generated/` (`--source`, `--out`, `--themes` to override) |
| `npm run build:fixtures` | Build stats from the synthetic export in `fixtures/` |
| `npm run init:themes` | Write a starter `config/themes.local.json` (`--force` to overwrite) |
| `npm run dev` | Start the app |
| `npm run build` / `npm run preview` | Production build / serve it locally |
| `npm test` | Vitest suites (run on synthetic fixtures only) |
| `npm run typecheck` | TypeScript check |
| `npm run make:fixtures` | Regenerate the synthetic export (deterministic) |

---

## How the data works

```
data/raw/ (folder or ZIP)
   └─ ExportAdapter ── normalized Task / Project / Section / Label / Comment / Event / Completion
         └─ aggregate ── src/generated/index.json, year-YYYY.json, year-all.json, search.json
               └─ React app (reads precomputed JSON only)
```

- **Source-agnostic.** Adapters implement `SourceAdapter` (`src/pipeline/types.ts`). A future read-only API adapter can plug in without touching the aggregation code.
- **Timezone.** Every time-of-day and day-boundary stat uses `America/New_York`. Date-only due dates stay plain dates. The event log stores all-day dues as end-of-day UTC instants, and those are decoded back to the intended calendar date.
- **Completions** come from the event log. `uncompleted` events cancel the completion before them, and when the task record disagrees with the log, the log wins. Recurring tasks log one completion per occurrence, and **every occurrence counts** toward the headline total.
- **Priority** is normalized so `p1` = highest (the export uses the API's inverted 4 = P1).
- **Deleted tasks and archived/deleted projects** aren't in the task or project files, but their history is rebuilt from the event log and included.
- **Year** means completion year for completion stats, creation year for creation stats, and event year for reschedules.
- **Data health.** Stats the export can't support are switched off and explained rather than shown as zero: durations (almost never present), karma history, shared-project stats on solo accounts, adherence for recurring tasks whose rule didn't survive, and an approximate inbox-zero reconstruction.

---

## Later (optional): read-only Todoist API supplement

Not built yet. If it's ever needed, it would read `TODOIST_API_TOKEN` from `.env` (see `.env.example`; get the token from Todoist → Settings → Integrations → Developer), make GET requests only, cache every response in `data/cache/`, and merge through a second adapter. The app works fully without it.
