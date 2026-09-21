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
| `0237`–`0238` | [`db/RUN-IN-SUPABASE-0237-0238.sql`](../../db/RUN-IN-SUPABASE-0237-0238.sql) | WCC/MCC columns (`month_day`, WMS Doer & Approver statuses, `done_at`), Event Checklist WMS Task alignment, JD Client field & `jd_doer_notes` table | **Not run.** Run before deploying 2026-09-18 changes |
| `0236` | [`db/migrations/0236_recruitment_jd_roles.sql`](../../db/migrations/0236_recruitment_jd_roles.sql) | Recruitment JDs keyed by their own `slug` instead of an interview grade, plus `recruitment_jd_sends` | **Not run.** Self-contained and idempotent |
| `0228`–`0233` | [`db/RUN-IN-SUPABASE-0228-0233.sql`](../../db/RUN-IN-SUPABASE-0228-0233.sql) | JD Category, DCC Calendar Events, DCC Masters & Links, Approver Statuses, Recruitment JDs & Sends, Person-Specific JDs | **Not run.** |

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

## 2026-09-18 — WCC / MCC, Event Checklist WMS Column Order, JD Client & Doer Notes

**What changed**
- **DCC evolved to WCC (Weekly) & MCC (Monthly)**: `/dcc/wcc` (or `/dcc`) for weekly compliances, `/dcc/mcc` for monthly compliances. Fills now store full WMS Doer Status (`dont_know`, `not_started`, `initiated`, `follow_up`, `need_info`, `done`), `done_at` server timestamp, WMS Approver Status, and Approver Notes. Compliances gain optional `month_day` (1-31).
- **Event Checklist aligned with WMS Tasks columns**: Re-ordered grid columns to match WMS Tasks (`S. No.`, `Client`, `Subject`, `Task`, `Doer`, `Initiator`, `Target Date`, `Frequency`, `Doer Status`, `Doer Notes`, `Actual Date`, `+/- Days`, `Approver Status`, `Approver Notes`). Subject uses the `subjects` roster. Added `client`, `initiator_id`, and `recurrence_rule` to checklist items, and `approver_status` / `approver_notes` to checks.
- **Job Description Client & Doer Notes**: Added `client` field to `jd_entries` (from `clients` catalog) and created per-person `jd_doer_notes` table for seat-holders to store notes without mutating shared position JDs.
- **JD Attachments & Column Drag Utility**: Added attachment upload actions and reusable UI components (`column-drag.tsx`, `use-auto-height.ts`).

**Why**
- Replaces legacy 4-state DCC buttons with standard WMS Doer and Approver status workflows, aligning all compliance, checklist, and task interfaces across Altus OS.

**SQL to run before deploying**
- `db/RUN-IN-SUPABASE-0237-0238.sql` (combines `0237_checklist_wms_columns_jd_client.sql` and `0238_wcc_mcc.sql`).

**How to verify**
- `npx vitest run tests/unit/compliance-wcc-mcc.test.ts tests/unit/compliance-columns.test.ts tests/unit/checklist-sort.test.ts tests/unit/jd-attachments.test.ts`

---

## 2026-09-17 — Recruitment JDs, and where they live

**What changed**
- **A Recruitment JD section**, for the JDs recruiters send *candidates* — separate
  from the internal Job Description module, which describes a seat somebody already
  holds. One template in `lib/operations/recruitment-jd.ts` (10 fact-box lines, 12
  body sections) drives the editor, the preview, the WhatsApp text and the email,
  so none of the four can drift from the others.
- **The ten JDs Rutvisha wrote, as eight roles** (`lib/operations/recruitment-jd-seed.ts`).
  Sales and Operations each arrived twice — a polished version and a longer
  recruiter-facing one — and each pair was merged rather than left as two JDs for
  one job.
- **Master vs recruiter copy.** The master is the original; recruiters edit their own
  copy and send that. A copy identical to the master stores `null`, so master edits
  keep flowing through until somebody genuinely diverges. *Reset to master* drops
  the copy; *Restore the original* puts the master back to the shipped text. The
  seed is inserted once per slug and never re-applied, so a deploy cannot silently
  undo an HR edit.
- **ATS keywords are marked `internal`** — editable and copyable for job boards,
  never included in a message to a candidate (`JD_SENT_FIELDS`).
- **Its own role list, not `interview_positions`** (`0236`). That table is the
  interview *grade* ladder — Executive, Senior Manager, First-Year Intern. Several
  of these JDs span two grades at once ("Senior Sales Manager / Sales Manager") and
  most grades will never have a JD, so a recruitment JD is now addressed by `slug`
  with an optional link back to a grade.
- **Moved to Operations → Masters** at the account holder's request, from the HR
  rail it shipped on that morning:
  `/hr/recruitment-jd` → `/operations/masters/recruitment-jd` (the old path
  redirects), `lib/hr/recruitment-jd*.ts` → `lib/operations/`,
  `components/hr/recruitment-jd/` → `components/operations/recruitment-jd/`.
  It is the third job-description master, beside Master JD and Person-specific JD.

**Why**
- It is a master — the JD we advertise a role with — and the room already keeps
  every other master in one section. Beside the other two job descriptions it also
  reads as the distinction it is: those two say what a seat does once somebody is
  in it, this one says what the seat is while we are still looking.
- The move widened the audience, so the access rule changed with it. **Reading is
  open to the Operations room**, like every other master — a JD we are advertising
  is not confidential, and the people asked to refer candidates are exactly the
  people who need to read it. **Editing and sending stay HR staff only**, enforced
  in `actions.ts`; `canEdit` only decides whether the controls are drawn. This is
  the same split the neighbouring Master JD already uses.
- `hr.recruitment-jd` gave up its permission node to `operations.masters` rather
  than keeping a second switch for one page in a section that already has one. The
  key had existed for one day and had never been granted, so nothing was revoked.
  `/hr/recruitment-jd` is listed on `operations.masters` beside the new path, for
  the reason Salary Slip's old path is: a redirect into a governed room must be
  governed by the same switch.

**SQL to run before deploying**
- `db/migrations/0236_recruitment_jd_roles.sql`. Until it is applied the section
  reads fine — all eight JDs, read-only, with a banner naming the migration — but
  saving and sending are refused.

**How to verify**
- `/operations/masters` lists **Recruitment JD** under Job Description; the rail's
  Masters section and the tab strip on every masters page carry it too.
- `/hr/recruitment-jd` redirects to it, and the HR rail no longer offers it.
- `npx vitest run --no-file-parallelism tests/unit/recruitment-jd-seed.test.ts tests/unit/recruitment-jd.test.ts tests/unit/operations-masters-nav.test.ts`

## 2026-09-15 — full day

Eight major features & updates landed today.

### 1 · Job Description Category Field & Person-Specific JDs
- **What changed**: Added `category` column to `jd_entries` (`0228`) and added `owner_employee_id` with XOR check constraint (`0233`). Created person view tab and bulk CSV uploader.
- **Why**: Allows job description items to be tagged by free-text categories (e.g. Vendors, Housekeeping) and assigned directly to a specific person in addition to position seats.
- **SQL**: `db/migrations/0228_jd_entries_category.sql`, `db/migrations/0233_jd_person_specific.sql`.
- **How to verify**: Open `/operations/job-description`, view Category filter/input, check Person View tab and Bulk Upload modal.

### 2 · DCC Masters (Position Templates & Live Link Sync)
- **What changed**: Created `dcc_master_items` & `dcc_master_links` (`0230`). Added `/dcc/masters` administration interface and automatic sync engine (`lib/dcc/master-sync.ts`).
- **Why**: Enables defining a master Daily Compliance checklist per designation/position that automatically populates and updates active employee KPIs while preserving historical entries.
- **SQL**: `db/migrations/0230_dcc_master_items.sql`.
- **How to verify**: Visit `/dcc/masters`, create or edit a position master item, verify sync across team members.

### 3 · DCC Dashboard, Detailed Breakdown & 10 PM Daily Automated Report
- **What changed**: Created `/dcc/dashboard` with completion statistics, department filters, entry lock status, and cron endpoint `/api/cron/dcc-daily-report` for daily email digests.
- **Why**: Gives management visibility into daily compliance across departments and sends nightly summary emails to leaders.
- **SQL**: Uses `0230` master tables and existing DCC entry tables.
- **How to verify**: Visit `/dcc/dashboard`, check metrics, and run unit tests `npx vitest run tests/unit/dcc-dashboard.test.ts`.

### 4 · DCC Google Calendar Sync & Connect Gate
- **What changed**: Created `dcc_calendar_events` (`0229`) and Google Calendar sync service (`lib/dcc/calendar-sync.ts`, `/api/cron/dcc-calendar-sync`). Added Calendar Connect Gate component.
- **Why**: Keeps each employee's daily compliance tasks visible directly as an all-day event in their Altus Google Calendar without duplicate events.
- **SQL**: `db/migrations/0229_dcc_calendar_events.sql`.
- **How to verify**: Check calendar connection status in `/dcc` or profile, and run `npx vitest run tests/unit/dcc-calendar-event.test.ts`.

### 5 · Approver / Initiator Status (Doer Status vs Approver Ruling)
- **What changed**: Added `on_hold` value to `approval_status` enum, and created `goal_approver_statuses` & `weekly_goal_approver_statuses` tables (`0231`). Updated WMS tasks, Goals, and Weekly Goals boards to present independent Doer Status and Approver/Initiator Status rulings.
- **Why**: Separates the doer's execution status (e.g. Not Started, Initiated, Done) from the approver/initiator's ruling (Pending, Approved, Not Approved, On Hold, Cancelled).
- **SQL**: `db/migrations/0231_approver_initiator_status.sql`.
- **How to verify**: Open `/tasks` or `/goals/weekly`, inspect status cells, and run `npx vitest run tests/unit/approver-status.test.ts`.

### 6 · Recruitment JDs (HR Candidate Job Descriptions & WhatsApp / Email Sends)
- **What changed**: Created `recruitment_jds` & `recruitment_jd_sends` (`0232`), added `/hr/recruitment-jd` management hub and recruiter share modal with WhatsApp deep link formatting and email delivery.
- **Why**: Allows HR recruiters to view master candidate job descriptions, customize recruiter copies, and send formatted job overviews directly to applicants.
- **SQL**: `db/migrations/0232_recruitment_jds.sql`.
- **How to verify**: Open `/hr/recruitment-jd`, test editing recruiter content, click WhatsApp/Email send, and run `npx vitest run tests/unit/recruitment-jd.test.ts`.

### 7 · Hand-Holding (HH) Week Calendar & Auto-Linking
- **What changed**: Created HH Week Calendar view component and server actions (`app/(app)/people-allocation/calendar-actions.ts`, `components/people-allocation/hh-week-calendar.tsx`, `lib/hh/auto-link.ts`).
- **Why**: Provides a week-by-week visual schedule for hand-holding allocations and automatically links team allocations to calendar events.
- **SQL**: None (uses existing allocation tables).
- **How to verify**: Open `/people-allocation`, switch to HH Week Calendar view, and run `npx vitest run tests/unit/hh-calendar.test.ts`.

### 8 · Operations & Event Masters Navigation
- **What changed**: Added masters administration routes for Operations (`/operations/masters`) and Events (`/events/masters`).
- **Why**: Provides central administration for category options and checklist master items.
- **SQL**: None.
- **How to verify**: Visit `/operations/masters` and `/events/masters`.

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
