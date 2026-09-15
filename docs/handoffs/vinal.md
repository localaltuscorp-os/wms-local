# Handoff — Vinal

Running notes, added **as the work happens** rather than written up at the end.
Branch `Vinal` → `localaltuscorp-os/wms-local`.

- **Newest entry first**, matching `HANDOFF.md`'s changelog.
- **Never edit [`HANDOFF.md`](../../HANDOFF.md)** — the owner folds this file into
  it after the work merges. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
- **Every entry needs its SQL section**, even when the answer is "None". Code
  reaching production ahead of its migrations is the most expensive failure this
  project has had: it took Daily Goals, attendance punch-in and sign-in down on
  8 and 9 September, and the diff looked harmless every time.

---

## ⚠️ SQL not yet run in Supabase

The standing list. Delete a row the moment it is applied and verified — a stale
"pending" here is as dangerous as a missing one.

| Migration | Paste sheet | Creates | Status |
|-----------|-------------|---------|--------|
| `0221` + `0222` | [`db/RUN-IN-SUPABASE-0221-0222.sql`](../../db/RUN-IN-SUPABASE-0221-0222.sql) | Event Checklist (4 tables) + Job Description (8 tables, 14 seeded ranks) | **Not run.** Both pages detect the missing tables and render a setup notice rather than a 500 |
| `0216`–`0220` | [`db/RUN-IN-SUPABASE-0216-0220.sql`](../../db/RUN-IN-SUPABASE-0216-0220.sql) | permissions, delegated access, manager history, attachments | **Not run** — inherited from the `Om` branch, not mine |

> `0221` was **amended in place**, not superseded. It had never been applied or
> committed, so reshaping it for the offset model cost nothing — and a migration
> history that creates a column then immediately alters it is noise in every
> future reader's way. The old single-file `RUN-IN-SUPABASE-0221.sql` is gone;
> use the combined sheet.

**Two traps, both found the hard way:**

1. The Supabase editor runs **only the selected text** if anything is selected —
   a partial selection reports success having done nothing. Press `Ctrl+A`
   before Run, then read the schema back to confirm.
2. Restoring a table from backup leaves its **id sequence behind the rows**. The
   next insert fails on a duplicate key in a column the app never sets. Re-sync
   the sequences after any restore.

---

## Template — copy this for a new day

```markdown
## YYYY-MM-DD — short summary

**What changed**
- One bullet per user-visible or structural change. Name the files.

**Why**
- The reason. Assume the reader has no context and was not in the room.

**SQL to run before deploying**
- The statements, or "None".

**How to verify**
- The command, URL or click-path that proves it works.
```

---

## 2026-09-11 — full day

Eight pieces of work. Ordered as they were done.

### 1 · Table scrollbars across WMS, Goals and Admin

**What changed** — `.table-scroll` added to `app/globals.css` (8px, `#cbd5e1`
thumb, `#94a3b8` on hover, `scrollbar-width: thin`), then applied to every table
and scroll container that lacked one — 24 files across `components/tasks`,
`components/admin`, `components/goals`, `components/dashboard`,
`components/weekly-goals`, `components/people-allocation`.

**Why** — Tables were clipping horizontally with no visible affordance, so
columns off the right edge were simply invisible. The utility codifies the
tuning already proven inline in `TableShell` rather than inventing a second look.

**SQL** — None.

### 2 · "Team Productivity" renamed to "Performance"

**What changed** — the hub module label.

**Why** — requested; the module reports on individuals as well as teams.

**SQL** — None.

### 3 · Dashboards segment by FUNCTION, not App/Non-App team

**What changed**

- New `lib/org/functions.ts` — the single definition of the eight business
  functions: Sales · Marketing · Operations · Hand-holding · HR · Admin ·
  Accounts · Apps/IT, plus **Others**.
- `components/dashboard/function-toggle.tsx` replaces `team-toggle.tsx`.
- **Deleted** `lib/teams/app-team.ts`, `lib/teams/department-buckets.ts`,
  `components/dashboard/team-toggle.tsx`.
- Every dashboard section that offered the old toggle now offers the new one.

**Why** — "App Team / Non-App Team" answered one question (is this a developer?)
and the board is read for a different one. The old split lumped Sales, HR,
Accounts and Operations into a single tab, which is precisely the comparison
anyone looking at an overdue board wants to make. **Teams = functions.**

Matching is **by pattern, not equality**, because department names are free text
from an admin-managed table: the Apps side alone exists as "Apps", "App Devp"
and "BSS App". A department matching none of the eight lands in `others` —
correct, but invisible, so if `others` ever grows large that is the list telling
you it has gone stale.

**SQL** — None.

### 4 · Jump-to-module shortcut sheet corrected

**What changed** — `lib/shortcuts-catalog.ts` now generates the letters from
`MODULE_ORDER` instead of listing them by hand.

**Why** — the docs sheet showed `1…9`; the app actually uses `Alt` +
`qwertyuiopas`, positionally. Generating it means the sheet cannot drift again.

**SQL** — None.

### 5 · Operations module

**What changed**

- New hub category absorbing **Hand-holding** and **Monthly Events Master**,
  plus new **Checklist** and **Guidelines** areas.
- `lib/operations/nav.ts` is the single source for the rail.
- Two-tier navigation modelled on the HR console: a fixed rail of four areas,
  with the current area's pages as a quick-access row
  (`components/operations/operations-quick-nav*.tsx`, mounted by the
  `/operations`, `/events` and `/people-allocation` layouts).
- `lib/workspaces.ts` gains the `operations` room; `lib/module-theme.ts` gains
  the module and its Cog glyph.

**Why** — Hand-holding and Monthly Events were two unrelated top-level entries
that are really one operational surface, and Checklist and Guidelines had
nowhere to live.

Both absorbed areas **keep their original routes** (`/people-allocation`,
`/events`) so every existing link and bookmark still resolves.

**SQL** — None.

### 6 · Hub card colours

**What changed** — WMS, Project and Operations were byte-identical red. Project
is now cyan, Operations gold (`#F3ECD8` fill / `#886920` ink, flat).
`tests/unit/hub-palette.test.ts` fails if any two cards ever collide again.

**Why** — the palette's whole job is "every module has a specific colour so you
know which module you are in", and it had quietly stopped doing it. The gold was
measured against the other nine cards in HSL so it sits inside the family's own
band (fill S42–58, flat rather than gradient) rather than being a bright
out-of-family yellow.

**SQL** — None.

### 7 · Operations → Event Checklist (migration 0221)

**What changed**

Rebuilt on an **offset model**. Four tables: templates → runs → items → checks.

- The grid carries all ten columns asked for: S. No. · Doer · Activity · Due
  Date Offset · Target Date · Backup Person · Done · Actual Date · Variance,
  with rows grouped into **Before / During / After** by the sign of the offset.
- `lib/operations/checklist-dates.ts` holds the arithmetic, pure and tested.
- Inline per-cell editing, keyboard quick-add, collapsible phase groups,
  "Save as Master Checklist", and create-from-template.

**Why** — every deadline is one number (the event date) plus an offset, so
moving the event moves the whole plan in one write, and a template can be
duplicated onto any event with every date recomputed.

Three decisions worth knowing, all deliberate:

- **`is_event` lives on the checklist, not on each row.** An offset is
  meaningless without a single shared anchor; a list mixing both kinds has rows
  whose target date cannot be computed at all.
- **The event date is read-only, taken from Monthly Events Master.** Offering a
  second freely-typed date invites a checklist dated 14/03 for an event held on
  the 12th with nothing to flag it. The run *copies* the date rather than
  joining, so moving an event in the calendar cannot silently rewrite variance
  figures on checklists people have already worked — it raises a "recalculate?"
  banner instead.
- **Four completion states kept** (Pending · Done · Need Help · Not Applicable),
  with Done as the checkbox. Dropping "Not Applicable" leaves only two dishonest
  options for work that never needed doing: tick Done and inflate the rate, or
  leave it Pending and look negligent.

**Known limitation** — `calendar_events` holds a single date, so a multi-day
event has no end date and offset 0 means "event day" only.

**SQL** — `db/RUN-IN-SUPABASE-0221-0222.sql`. **Not run yet.**

### 8 · HR → Job Description (migration 0222)

**What changed**

The JD Bank at `/hr/job-description`, wired into the HR console rail. Eight
tables: ranks (14 seeded), positions, entries, attachments, assignments,
delegations, push log, position holders.

- `lib/jd/ladder.ts` — the rank ladder and the vacancy/escalation rule.
- `lib/jd/recurrence.ts` — all ten frequencies.
- Form: Position (showing holder count), Department/Function (derived), Task,
  Frequency, Estimated Time, the three SOP document slots, Notes, the three
  target flags (DCC / WMS / Event Checklist), Assigned Person(s).

**Why** — a Job Description belongs to a **position**, never to a person. People
come and go; the work stays. A vacant seat escalates its tasks to the nearest
filled rank **within the same function**, skipping empty rungs, and never
silently drops one.

Three decisions worth knowing:

- **The rank ladder here is not the candidate list.** `interview_positions`
  (migration 0155) puts Consultant *above* Deputy Manager; this ladder puts it
  *below* Assistant Manager. They are deliberately not merged — that one
  describes seats we hire into, this one decides who covers a vacancy, and
  swapping them changes who gets the work.
- **Recurrence is structured, never a label string.** Four of the ten
  frequencies — Once in 15 Days, Once in 30 Days, Monthly on 2nd Saturday, First
  Monday of Month — are not sets of weekdays, so the DCC weekday-mask model
  cannot hold them. The JD owns the richer model and projects down when pushing.
- **Position = Function × Rank**, generated rather than typed, so two people
  cannot create "Ops · Exec" and "Operations · Executive" and end up with two
  seats escalation treats as unrelated.

**Not built yet** — drag-to-reorder, the Duplicate-with-preview modal, the
nightly auto-push, and Import-from-JD (shipped disabled with a tooltip; it needs
JD entries flagged for Event Checklist first).

**SQL** — `db/RUN-IN-SUPABASE-0221-0222.sql`. **Not run yet.**

### 9 · tiptap version split fixed (repo-wide, unrelated to the features)

**What changed** — `package.json` gains an `overrides` block pinning 38
`@tiptap/*` packages to `3.29.0`; `package-lock.json` regenerated to match.

**Why** — a clean `npm install` produces a **second** `@tiptap/core` (3.30.4)
nested under `@tiptap/starter-kit`, alongside the top-level 3.29.0 that
`package.json` pins. Two cores means two incompatible sets of editor types, and
`components/communications/rich-body-editor.tsx` stops type-checking with 11
errors — `toggleBold`, `undo`, `redo` "do not exist".

**This was latent, not new.** The committed lockfile has always pinned that
nested 3.30.4; the working `node_modules` on this machine simply predated it.
Anyone doing a fresh clone and install would have hit the same wall.

**SQL** — None.

---

## The mistake worth remembering

I first added `jd_position_id` as a **column on `employees`**. Drizzle expands
every declared column on a bare `.select()`, and `employees` is bare-selected in
hundreds of places **including the sign-in lookup** — so the whole app broke with
`column "jd_position_id" does not exist` until the migration ran.

The symptom is not a broken JD page. It is **nobody able to log in**, presenting
as *"Email or password didn't match"* — the 9 September outage exactly. Caught in
the dev-server log before committing.

Seat membership is now its own `jd_position_holders` table, read only by code
that already requires 0222. **Neither migration alters any existing table.**

**Rule this gives us:** never add a column to `employees` — or any table that is
bare-selected app-wide — in the same change as the feature that needs it. Put the
new data in its own table, or run the migration first.

---

## Verification for the whole day

```bash
npx tsc --noEmit -p tsconfig.json        # 0 errors
npm run build                            # compiles; 417 routes
npx vitest run --no-file-parallelism      # 2682 pass
```

- **Tests:** 2682 pass, 4 fail. All four failures are **pre-existing** — proven
  by running the same files in a clean worktree at `ea75ddec` with none of this
  work present: `task-stat-counts`, `done-on-time`, `global-search-provider`,
  `task-actions`.
- **Lint:** 10 errors repo-wide, **none in files touched here** — all in
  `insight-viz`, `status-donut`, `goal-board-card`,
  `management-assessment-screen`, `hr-stage-ghost`, `cycle-fields`,
  `filter-bar`, `work-sessions`.
- **Routes:** hub, dashboard, hr, hr/job-description, operations,
  operations/checklist, events, people-allocation, tasks, goals, admin — all 200,
  zero runtime errors in the dev log.
- **`db/schema.ts` vs HEAD:** 406 insertions, **0 deletions**. The `employees`
  table is byte-identical.

## Still open

- **Run the SQL.** Nothing in 7 or 8 works until the paste sheet is applied.
- `npm ci` does **not** work in this repo — the committed lockfile is out of sync
  with `package.json` for `@electric-sql/pglite` and `cross-env`. Use
  `npm install`. Pre-existing; worth fixing separately.
- `/dashboard` is intermittently slow — 90s cold, once 201s, usually 1–2s.
  **Pre-existing**, not caused by this work. See
  [`docs/PERFORMANCE_AUDIT_2026-06-29.md`](../PERFORMANCE_AUDIT_2026-06-29.md).
- Checklist assumptions made without the drawings: the person/month view the old
  checklist had has no place in the run model — either non-event runs become
  monthly runs, or that view is dropped. Needs a decision.
