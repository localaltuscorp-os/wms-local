# PROMPT — Build the "Project" (Project Plan) module

> Paste everything below this line into a fresh Claude Code session in the OTHER project.

---

Build a complete **Project Plan** module in this codebase. A plan is one self-referential tree, six levels deep — **Project → Milestone → Result → Action → Sub-Action → Sub-Sub-Action** — where the top three levels are *containers* that hold structure and the bottom three are *executable* rows that are literally tasks in the task module. The same tree is shown four ways: an indented hierarchy table, a flat register per level, a Kanban board, and a whole-plan tree view. Reference numbers, durations and progress percentages are **derived on every render, never stored**.

First inspect this repo and adapt to whatever stack it uses (framework, ORM, auth, design tokens, component conventions). The spec below is the *behaviour* to reproduce; the reference implementation is Next.js 15 App Router + TypeScript + Postgres (Drizzle) + server actions + Tailwind. Map every concept onto this project's existing patterns — reuse its auth/session helper, its DB layer, its toast, its employee picker, its task detail drawer, its card/shadow tokens. Do **not** introduce a second styling system or a second data-access style.

**This module sits on top of an existing task module.** It assumes a `tasks` table with `title, status, priority, doer_id, initiator_id, due_at, starts_at, ends_at, estimated_minutes, client, subject, notes, tags, archived, updated_at`, an `employees` table with `is_admin` and a reporting hierarchy (`getDownlineIds(id)`), a shared task-create core, a status-write action with optimistic locking, and a task detail drawer. Reuse all of it. If this repo has no task module, say so before you start — half this spec is about *not* duplicating one.

Ask me only if something genuinely can't be inferred from the repo; otherwise make the call and tell me the assumption.

---

## 1. Vocabulary

- **Node** — one row of the plan tree, at any of the six levels. Lives in `project_nodes`, related to its parent by `parent_id` and nothing else.
- **Container** — Project / Milestone / Result. Holds structure and plan metadata. A milestone is not something anyone "does".
- **Executable** — Action / Sub-Action / Sub-Sub-Action. The rows that carry real work.
- **Linked task** — the ONE `tasks` row an executable node (and a Result) points at via `tasks.project_node_id`. It is the same record the task list shows and the calendar sync writes. There is never a second copy.
- **Ref** — the short display label derived from a row's position among its siblings: `P1`, `M2`, `RA`, `A1`, `SA3.1`, `SSA3.1.1`. Never stored.
- **Full ref** — the traceability path, every ancestor concatenated: `P3M3RDA5SA1`. Unique across the plan, quotable in an email, and never a table column.
- **Register** — a flat, columnar view of one level: every milestone in the plan on its own line, carrying the project it belongs to. A *projection* of the tree, not a second query.
- **Rollup** — the completion of a row's direct children one level down, as a decimal count: `3.5/10`.
- **Working status** — the doer's progress report (six values).
- **Restricted verdict** — the owner/admin ruling *about* the work (approve / hold / cancel / archive). Layered on top of the working status, never replacing it.
- **Not scheduled** — an executable row that has no linked task yet, because it is missing an owner or a target date.

---

## 2. Data model

### 2.1 The node

```sql
CREATE TABLE project_nodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- 'project'|'milestone'|'result'|'action'|'sub_action'|'sub_sub_action'
  -- PLAIN TEXT with no check constraint, deliberately: a real enum needs a lock
  -- plus a follow-up migration every time a level is added. The app-side zod
  -- enum is what validates writes.
  kind          text NOT NULL,
  parent_id     uuid REFERENCES project_nodes(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 100,
  is_archived   boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  description   text,
  notes         text,                    -- Initiator Notes, CONTAINER rows only
  target_date   timestamptz,
  owner_id      uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Plan / schedule. On a row with a linked task these are mirrored ONTO that
  -- task on every write, so the task stays the single execution record.
  category         text,
  purpose          text,
  duration_minutes integer,              -- WHOLE MINUTES ("2h 30m" → 150),
                                         -- same unit as tasks.estimated_minutes
  starts_at        timestamptz,
  ends_at          timestamptz,

  -- Status. `status` describes CONTAINER rows: an executable row's status of
  -- record stays on its linked task, and a second column here would be a copy
  -- free to disagree with it.
  status           text,                 -- working flow
  approval_status  text,                 -- restricted verdict, either kind of row
  progress_percent integer,              -- 0-100 override; NULL = derive it

  -- Intake fields. These exist because a CONTAINER row has no task to carry
  -- them, and the create form collects them for every level. On an executable
  -- row the equivalents live on the task (title/subject/priority/initiator/tags).
  client_name  text,
  subject      text,
  priority     text,
  initiator_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  tags         text[],
  links        text[]                    -- reference links; see §9 pitfall 7
);
```

**Guard the two vocabularies at the database as well as in zod** — a bad write from a script or a psql session must fail here, not leave a row the app cannot render. Add them `NOT VALID` so they apply to every new and updated row without scanning the table:

```sql
ALTER TABLE project_nodes ADD CONSTRAINT project_nodes_status_check CHECK (
  status IS NULL OR status IN
  ('dont_know','not_started','initiated','follow_up','need_info','done')) NOT VALID;
ALTER TABLE project_nodes ADD CONSTRAINT project_nodes_approval_status_check CHECK (
  approval_status IS NULL OR approval_status IN
  ('not_approved','approved','on_hold','cancelled')) NOT VALID;
ALTER TABLE project_nodes ADD CONSTRAINT project_nodes_progress_percent_check CHECK (
  progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100) NOT VALID;
```

**Indexes** — each backs a real screen:

```sql
CREATE INDEX project_nodes_parent_idx      ON project_nodes (parent_id);
CREATE INDEX project_nodes_kind_idx        ON project_nodes (kind, is_archived);
-- The tree always loads a whole plan and orders siblings by (parent, sort_order).
CREATE INDEX project_nodes_parent_sort_idx ON project_nodes (parent_id, sort_order);
-- The Projects list filters to kind='project' and orders by sort_order.
CREATE INDEX project_nodes_kind_sort_idx   ON project_nodes (kind, is_archived, sort_order);

ALTER TABLE tasks ADD COLUMN project_node_id uuid
  REFERENCES project_nodes(id) ON DELETE SET NULL;
CREATE INDEX tasks_project_node_idx ON tasks (project_node_id);
```

**What is deliberately NOT a column** — say so in the migration comment so nobody adds it later:

| Field | Why it isn't stored |
|---|---|
| Project No / Ref | Derived from sibling position. A stored label drifts from the tree the first time a row is deleted. |
| Duration (days) | Derived from `starts_at → ends_at`. Storing it lets it disagree with its own two endpoints. |
| Progress % | Derived from the work underneath, *except* where a person recorded a partial — that is `progress_percent`. |
| `archived` as a status string | It is `is_archived`, which already has a column, an index and a filter on every read. A parallel string could disagree with it. |

### 2.2 Supporting tables

```sql
-- Attachments on a CONTAINER row. A new table, NOT task_attachments: those hang
-- off tasks.id, and a Milestone HAS NO TASK. Pointing container files at the
-- task table would mean inventing a placeholder task per milestone, which then
-- leaks into the task list and onto people's calendars as work nobody is meant
-- to do. Same shape, same bucket, same signed-URL path — a new table, not a new
-- storage system. Executable rows keep using task attachments in the drawer;
-- the two never describe the same file.
CREATE TABLE project_node_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id        uuid NOT NULL REFERENCES project_nodes(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  mime           text,
  size_bytes     integer,
  -- SET NULL, not CASCADE: an employee leaving must not delete the evidence
  -- they attached to a live milestone.
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_node_attachments_node_idx
  ON project_node_attachments (node_id, created_at);

-- Optional: team members on a node, alongside owner_id.
CREATE TABLE project_members (
  project_node_id uuid NOT NULL REFERENCES project_nodes(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_node_id, employee_id)
);
```

If this project uses RLS: any authenticated user may `SELECT` / `INSERT` / `UPDATE` `project_nodes`; **`REVOKE DELETE`**. The module archives and never hard-deletes, so history and any task references survive.

### 2.3 Read every late-added column group defensively

Selecting an undefined column does not return null in Postgres — it raises **42703** and the *entire* screen 500s. So each column group added by a later migration is fetched in its **own round-trip inside a try/catch**:

- `loadPlanMeta()` → `status, approval_status, progress_percent`
- `loadPlanExtras()` → `priority, links`
- `attachmentCounts()` → catches **42P01** (undefined table)

A database missing a migration then loses those *fields*, not the screen. Writes mirror it: the container insert retries without the intake group on 42703 and logs a warning. Never put these columns in an unguarded `.select()` or a bare `.returning()`.

---

## 3. The level model and the numbering engine

Put this in a **client-safe** module (no `server-only`, no DB import). The browser derives every ref as rows are added, moved and deleted; the server re-uses the identical predicates to validate a parent/child pair. One copy of the rules, so the screen and the writes cannot disagree.

```ts
export const PLAN_KINDS = ["project","milestone","result","action","sub_action","sub_sub_action"] as const;

KIND_DEPTH  = { project:0, milestone:1, result:2, action:3, sub_action:4, sub_sub_action:5 }
KIND_LABEL  = { project:"Project", milestone:"Milestone", result:"Result",
                action:"Action", sub_action:"Sub-Action", sub_sub_action:"Sub-Sub-Action" }
CHILD_KIND  = { project:"milestone", milestone:"result", result:"action",
                action:"sub_action", sub_action:"sub_sub_action", sub_sub_action:null }
PARENT_KIND = { project:null, milestone:"project", result:"milestone",
                action:"result", sub_action:"action", sub_sub_action:"sub_action" }
```

### 3.1 Three predicates that are deliberately NOT the same set

```ts
EXECUTABLE_KINDS = ["action","sub_action","sub_sub_action"]           // isExecutable()
TASK_KINDS       = ["result", ...EXECUTABLE_KINDS]                    // hasTask()
SCHEDULED_KINDS  = ["result","action","sub_action","sub_sub_action"]  // hasSchedule()
```

- **`hasTask(kind)`** — does this row get a `tasks` record? Result *and* the three executables. A Result was asked to show up in the task list: people put an owner and a target date on one and expect to find it there.
- **`isExecutable(kind)`** — does this row report its status, priority and notes *from that task* rather than from the plan row? The three executables only. A Result keeps its **derived** progress ("0 out of 3 actions"), because that number is only trustworthy while it is derived rather than self-reported. Widening `isExecutable` instead of adding `hasTask` would have moved all four at once and made a container's progress compete with its own children.
- **`hasSchedule(kind)`** — does this row carry a start, an end and a duration of its own? Everything except Project and Milestone. **Those two are dated by the work underneath them**: a project runs from its first action to its last, and a stored pair of dates on the container disagrees with that the moment anything below it moves. One table, three surfaces — the create dialog hides its Schedule block, the register drops Start/End/Duration, the edit dialog drops the same fields.

### 3.2 Reference numbering — derived, never stored

Two refs, and the difference matters.

**`refFor(kind, index1, parentRef)`** — the short label the screen shows, from the row's 1-based position **among its siblings of the same kind**:

| Level | Format | Examples |
|---|---|---|
| Project | `P{n}` | P1, P2, P3 |
| Milestone | `M{n}` | M1, M2, M3 |
| Result | `R{letters}` | RA, RB … RZ, RAA (spreadsheet-style, 1-based) |
| Action | `A{n}` | A1, A2 |
| Sub-Action | `SA{parent ordinals}.{n}` | SA3.1, SA3.2 |
| Sub-Sub-Action | `SSA{parent ordinals}.{n}` | SSA3.1.1 |

The deep levels **append to the parent's ref** rather than recomputing a path — strip the letter prefix off `"A3"` to get `3`, then `.1`. A renumber high in the tree flows all the way down for free. Falls back to a bare ordinal when there is no parent ref (a row whose ancestor was archived out from under it).

**`fullRefFor(kind, index1, parentFullRef)`** — `P3M3RDA5SA1`. Built the same way, by appending this row's segment to the parent's. Show it in a detail panel, a row tooltip and the CSV export — **never as a column**: it gets long fast and a column of those strings is unreadable.

Neither ref is a relationship. Both are display artefacts of `parent_id` + sibling order. **Nothing may ever parse a ref to find a parent.**

Also ship `toLetters(n)` (1→A, 26→Z, 27→AA, 28→AB) and `toRoman(n)`, both guarding `n < 1` so a bad index cannot hang.

### 3.3 Duration, dates and level typography (same module)

- `parseDuration`: `"2h 30m"` / `"2 h 30 m"` / `"2:30"` / `"90"` / `"1.5h"` → whole minutes. Blank **and unreadable** both return `null` — a bad string must clear the field, never silently store a wrong number. `formatDuration`: 150 → `"2h 30m"`, 45 → `"45m"`, 120 → `"2h"`.
- `toYmd` builds `YYYY-MM-DD` from **local** getters (`toISOString` shifts the day east of UTC). `toHm` → `"HH:MM"`. `combineDateTime(ymd, hm)` → local `Date`, null with no date.
- `formatPlanDate` → `"12-Jun-2026"`, and it must read a bare `YYYY-MM-DD` as a **local** day: `new Date("2026-06-12")` is UTC midnight and renders as the 11th west of Greenwich.
- `durationDays(start, end)` — whole days **inclusive of both ends** (same-day = 1 day, not 0), compared on local calendar days, so 18:00 → 09:00 two days later is 3 days and not "2.6 rounded". Null unless both ends are known.
- `LEVEL_STYLE` — how each level is *set*, in one table imported by every surface that draws a plan row, so the hierarchy reads identically on the table, the kanban card and the pickers:

| Level | Size | Weight | Style | Case |
|---|---|---|---|---|
| Project | 14 | 700 | italic | UPPERCASE |
| Milestone | 14 | 700 | normal | UPPERCASE |
| Result | 12 | 400 | italic | normal |
| Action | 12 | 400 | normal | normal |
| Sub-Action | 11 | 400 | italic | normal |
| Sub-Sub-Action | 10 | 400 | italic | normal |

The **steps** between levels are the design; the absolute sizes are not. Move the whole column together if it moves. Caps is a CSS `text-transform`, never a rewrite — the stored name keeps the case the author typed, so search, the edit box and the export still show "AICL WMS" as written rather than a shouted copy of it.

---

## 4. Status — two flows, and the module's ONE permission

```ts
PLAN_WORKING_STATUSES    = ["dont_know","not_started","initiated","follow_up","need_info","done"]
PLAN_RESTRICTED_STATUSES = ["not_approved","approved","on_hold","cancelled","archived"]
```

The working six are deliberately **the same six the task module's doer-status picker offers** (`dont_know` displays as **"Not Read"**), so a project and the actions under it are never described in two different languages. Labels: Not Read · Not Started · Initiated · Follow Up · Need Info · Done · Not Approved · Approved · On Hold · Cancelled · Archived. Chip tones: `#94A3B8 #64748B #0891B2 #F59E0B #7C3AED #16A34A` then `#DC2626 #15803D #B45309 #78716C #57534E`. Default for an untouched row: `not_started`.

`archived` appears in the restricted list because it is one of the verdicts a person picks — but it is **stored as `is_archived`**, not as a seventh string.

### 4.1 Who may set what

```ts
interface PlanActor { id: string; isAdmin: boolean; isOwner: boolean; isDoer: boolean; isSupervisor: boolean }
canSetPlanStatus(actor, next): { ok: true } | { ok: false; reason: string }
```

- **Working status** — a progress report, so: admin, the project owner, the doer, or the doer/owner's supervisor.
- **Restricted verdict** — an authority decision, so: **admin or the project owner only**. Not the doer who did the work, and not their supervisor. A doer marking their own work "approved" has to be impossible **in the API**, not merely absent from the dropdown.
- Return a **reason**, not a bare `false`, so the action can say why instead of a flat "Forbidden".

Split the module in two: `canSetPlanStatus` is pure and client-safe (the picker renders what it allows); `actorFor(me, node)` is `server-only` and DB-backed — it looks up the linked task's doer and does **one** `getDownlineIds(me.id)` lookup then set membership, not a walk up the tree per row. The client sends an id and nothing else; it is never asked who it is, so it cannot claim to be the owner. The server rebuilds the actor on every write and never trusts what the browser rendered.

`effectivePlanStatus(status, approval, isArchived)` — a restricted verdict outranks a working status **for display**: archived, then approval, then status, then the default. A cancelled project is cancelled whatever its last progress report said.

### 4.2 Where a status write lands

| Row | Working status → | Restricted verdict → |
|---|---|---|
| Executable (action / sub / sub-sub) | the **linked task**, through the task module's own `setTaskStatus` — including its optimistic-lock check, its audit event and its notifications. The node gets **no copy**. | `project_nodes.approval_status` |
| Container (project / milestone / result) | `project_nodes.status` | `project_nodes.approval_status` |
| `archived`, either kind | — | `is_archived = true`, cascading (see §7) |

The verdict is **layered on top of** the progress report, never overwriting it — so "approved" does not erase the fact that the work was at Follow Up when it was approved.

---

## 5. Progress — the partial rule

Client-safe pure functions over the tree the caller already has, so the table recomputes as rows are edited without a round-trip and the server produces identical numbers for an export. **Nothing invents a number**: there is no default "50%" anywhere, and a project with nothing under it reports 0 of 0 rather than a flattering guess.

`nodeFraction(node)` → 0–1, in this exact order of preference:

1. A recorded `progressPercent` **wins**. Someone looked at the milestone and said "this is 40% there"; a derived number must not silently overrule a human judgement.
2. Otherwise `done ÷ total` over the **executable leaves** beneath it — the number that keeps itself honest as tasks are ticked off.
3. A bare executable row is simply 1 or 0 from its task status.
4. A container with neither is **0**. Not "unknown", not excluded — an empty milestone has genuinely delivered nothing.

`executableLeaves(node)` returns every executable descendant, including the node itself when it is one. **A sub-divided action is measured by its children, not counted twice** — the parent is skipped as a leaf when it has executable children. Containers are never a denominator, or a milestone would gain progress just by being subdivided.

`childCompletion(parent, kind)` → `{ completed, total, fraction }` where each direct child of `kind` contributes **its own fraction**. One function, not three near-copies: a project counts milestones, a milestone counts results, a result counts actions — only the kind changes.

**Completion is a sum of fractions, not a count of finished ones:**

```
10 milestones, one half done       →  3.5 / 10
 8 milestones, one a quarter done  →  2.25 / 8
 4 milestones, three-quarters done →  1.75 / 4
 7 milestones, one 40% done        →  4.4 / 7
```

`completed` is a **decimal and must never be rounded on the way through**. Rounding happens once, at display: `formatCompleted` trims to at most **2** decimals with no trailing zeros — 3.5 stays 3.5, 2.25 stays 2.25, 3 does not become "3.00". Two decimals is not arbitrary: cutting to one would round 2.25 to 2.3, which is exactly the bug. `formatCompletion` → `"3.5/10"`; `toPercent` → a whole percent, display only.

`projectFraction(project)` is milestone completion, falling back to the project's own executable rows when it has no milestones, so a small project run as a flat list of actions still reports something true. `describeProgress(project)` → `"40% | 3.5/10 | 3.5 out of 10 milestones are completed"`.

Only `done` counts as finished. An approved or cancelled row is a verdict, not progress.

---

## 6. Screens

Routes — every one of them reads the **same** `listPlanTree()`. No screen owns a copy of anything.

```
/project-plan                register (default) · ?view=tree · ?view=kanban
/project-plan/milestones     same three
/project-plan/results        same three
/project-plan/actions        same three
/project-plan/sub-actions    same three
/project-plan/kanban         the same page, opened on the board
/project-plan/views          Project Views — the whole plan as one tree
```

Sidebar order: **Project Views · Projects · Milestones · Results · Actions · Sub-Actions · Kanban.** Project Views is first because it is the only item that answers "what is in this plan?" without a click. Mark Projects `exact` or every child route lights it up too.

The level lives **in the URL, not in component state**. That is what lets the sidebar, the segmented level pill and the browser Back button agree, and it makes "the results view" a link someone can send. **Five sidebar items, one page component** parameterised by `level` — five page files would be five places to add the next column to.

### 6.1 The read query

`listPlanTree()`: two batched queries plus the two guarded metadata reads. **No per-row lookups.**

- Nodes: all non-archived, left-joined to the owner's name, `ORDER BY sort_order, name`. Ordering is applied **once in SQL** and preserved as rows are threaded into the tree, so the derived refs are stable across reloads.
- Tasks: every non-archived task with a non-null `project_node_id`, left-joined to the doer and to the timer rollup, **oldest first** — if a node somehow carries more than one task, the first is deterministically *the* row's task and the rest are left alone rather than fighting over it.
- Thread by `parent_id`. **A node whose parent is archived is dropped, not promoted to a root** — otherwise an Action appears at the top level next to the Projects.

Serialise to the client with `targetDate` as a plain local `YYYY-MM-DD` and the instants as ISO. The whole subtree travels with each row so the client recomputes progress from the same pure functions the server would use.

Plus `attachmentCounts()` — ONE grouped `COUNT` for the whole plan. **Counts only, never the files**: a signed URL costs a round-trip each, so a page of sixty milestones spends one query on that column, not sixty. And `descendantIds(rootId)` — one `WITH RECURSIVE` CTE (the delete/duplicate blast radius), parameterised, not interpolated.

### 6.2 `/project-plan?view=tree` — the hierarchy table

One compact enterprise table carrying all six levels, with the row indent and expand caret travelling **with the Ref column** so dragging it moves the hierarchy's visual spine rather than stranding the indent.

Columns, in default order — all draggable; the three marked fixed cannot be **hidden**, because a table with no name, no controls and no reference is a dead end:

`Ref (124, fixed)` · `Controls (156, fixed)` · `Result / Action (flex, fixed)` · `Owner (176)` · `Status (188)` · `Progress (136)` · `Doer (180)` · `Priority (148)` · `Target date (156)` · `Start date (150)` · `End date (150)` · `Due date (150)` · `Days (84)` · `From (144)` · `To (144)` · `WMS (148)` · `Description (280)`

Hidden by default, one click away in the Columns menu: `from, to, description, wms`. Everything the plan is *for* — Ref, Name, Status, Start, End, Days, Progress, milestone completion — is visible without opening a menu.

Columns that must **not** exist, and why:

- **No "Doer Status".** The Status column already *is* the row's status at every level; a second chip showed the same value twice in two vocabularies.
- **No Timer.** An executable row is a task — its timer is one click away in the drawer and on the task list, both driving the same session ledger. A plan is read far more often than a stopwatch is pressed.
- **No Duration (effort).** `Days` already answers "how long does this run" from the two dates beside it. The estimate stays on the row and in the edit dialog: this drops a column, not a field.

`Due date` is **read-only** and read from whichever record owns it — the linked task on an executable row, the row's own target date on a container. The two agree while the plan drives the task and part only when someone moves a due date in the task list without touching the plan. **Seeing that is the point of the column.**

**Initial collapse:** Projects and Milestones open, everything from Result down closed (`KIND_DEPTH >= 2`). That is the guard against the worst case — a project with hundreds of actions and thousands of sub-sub-actions — because rendering the whole tree on first paint puts every one of those rows in the DOM before anyone asked for one. Compute it **once** in a `useState` initialiser: after that the set is the user's, so a refresh from an edit can never re-close what they opened, and a newly added row (absent from the set) is visible immediately.

**Header chips**, clickable as filters: Total · Projects · Milestones · Results · Actions · In WMS · Not scheduled. Counted over the **whole tree, not the rendered rows** — results start collapsed, so counting rendered rows reports "0 Actions" on a plan full of them.

Also on this screen: search that **keeps a row when it matches or anything beneath it does** (a filter that hides the parents of a hit removes its context); a project filter; sort by Plan order / Name A–Z / Target date (undated rows **last** — they are the ones without a commitment yet, and burying them under the dated work is the wrong way round) / Owner; a full-screen takeover (a fixed overlay, not the native Fullscreen API, closed on Esc); a Columns menu with drag-reorder and tick boxes; a row detail dialog; a row edit dialog; a **bulk edit** dialog over ticked rows; per-row add-child / duplicate / move up / move down / delete; and **CSV export of exactly what is on screen** — same filter, search, sort and columns, prefixed with `Full Ref, Level, Path`, RFC-4180 quoted, UTF-8 BOM, `Project-Plan-YYYY-MM-DD.csv`.

Only **one tree write at a time**: keep `pending` true through the `router.refresh()` at the end of every write, because that is the window the row controls have to stay shut for.

Reuse the task table's own inline doer / priority / status cells rather than restyling copies, so a chip looks and behaves identically in both places and an edit here writes through the same actions.

### 6.3 The registers — the default view on every level route

A **flattening of the same tree**: every row of one kind on its own line, carrying the whole chain of parents above it. Not a second query and not a denormalised copy — which is what stops a row reporting one status here and another on the board.

Put the flattening rule in its own module so it can be unit-tested without rendering React. One recursive descent parameterised by level, not five near-copies:

```ts
LEVEL_KIND     = { projects:"project", milestones:"milestone", results:"result",
                   actions:"action", "sub-actions":"sub_action" }
// always ONE level down: a milestone is measured by its results, a result by its actions
ROLLUP_KIND    = { projects:"milestone", milestones:"result", results:"action",
                   actions:"sub_action", "sub-actions":"sub_sub_action" }
ANCESTOR_KINDS = { projects:[], milestones:["project"],
                   results:["project","milestone"],
                   actions:["project","milestone","result"],
                   "sub-actions":["project","milestone","result","action"] }
```

`buildRegisterRows(tree, level)` walks **one pass, top-down** (a row's ref depends on its parent's), emitting `{ node, ancestors[], ownRef, fullRef, rollup }`. Numbering **restarts within each parent** — the first milestone of P2 is M1, not M4 — which is what makes "P2 · M1" a reference a person can actually use. Rows whose parent chain is the wrong shape are **skipped, never guessed at**: a Result sitting directly under a Project has no milestone to name, and inventing one puts a false relationship on screen. The walk only descends the exact chain, so such a row is simply never reached.

Columns: tick · a `{Level} No` + `{Level} Name` pair **per ancestor** · own `{Level} No` · `{Level} Name` · `{Level} Description` · `{Level} Status` · `Start Date / End Date / Duration` **(scheduled levels only** — otherwise three columns of dashes) · `{Level} Completion` on a container **or** `WMS Task` on an executable · `{Rollup} Completion` · `Attachments` · `Links` · `Initiator Notes`.

The whole identity block (tick + ancestors + own No + own Name) is **frozen to the left edge**. A sticky cell is positioned against the scroll box, not against the cell before it, so the freeze offsets are cumulative sums of fixed widths declared at module scope (`{ tick:40, ref:92, name:190, ownName:230 }`) and pinned on the cell three ways. Let one identity column size to its content and every column after it lands in the wrong place.

**No Client / Subject / Doer / Due / Age columns on the executable registers.** They were there, mirroring the task list on the reasoning that an Action *is* a task — but in practice a plan row is mostly not scheduled yet, so the block read as six columns of dashes across the width of the screen. The record is one click away in the WMS Task column, which opens the same drawer with all six fields and more.

Search matches the row's name, description and ref **and every ancestor by name and by ref** — "AICL" is how people look for a milestone whose own name they don't remember, and so is "M2". Plus a project filter (hidden on the Projects register, where the rows *are* the projects), sortable headers, a "Hierarchy view" link, and the shared create + Bulk Upload buttons.

### 6.4 `/project-plan/kanban` — the board

**The same page**, opened on the board — not a second screen with its own data. Sharing the page means sharing the tree, the search, the project filter and the level pill: switch to List and you are looking at exactly the rows you were just looking at as cards.

Columns: **"Not scheduled"** first (executable rows that are not tasks yet — the signal that they still need an owner and a date), then the task module's own status columns with its own labels.

- Executable card → drag calls the task module's `setTaskStatus`, so **it moves on the task board too**.
- Container card → drag calls `setPlanNodeStatus`, after the same permission check the table's picker runs.
- A card whose row carries a restricted verdict shows the verdict as a badge and **refuses to be dragged**: the verdict outranks a progress report, so moving it between working columns would write a status nobody would then see.

Containers belong on this board as much as actions do — a board that could only show the executable third of the plan leaves a Milestone someone marked Follow Up with nowhere to appear.

### 6.5 `/project-plan/views` — Project Views

The whole plan as ONE indented tree, all five levels in one column of lines:

```
▾ P1  AICL WMS
  ▾ M1  Attendance
    ▾ RA  Biometric feed
      ▸ A1  Vendor demo
      ▾ A2  Install readers
          SA2.1  Site survey
▸ P2  Payroll
```

Why a tree rather than a pane-per-level drill-down: panes could only ever show one branch — to compare two milestones you had to click back up and lose your place, and the *shape* of a project (how deep it runs, where the work actually is) was never on screen at once. Expansion is cheap because the whole subtree is already in memory.

`flattenPlanTree(tree, expanded, { rootId, query })` returns a **flat** list of the lines currently visible — `{ node, kind, depth, ref, fullRef, ancestorIds, childCount, expanded, isLast }`. Flat, not nested, so the row component needs no recursion and a project renders through the same code as a sub-sub-action. A node is walked into only when its id is in `expanded`, so a thousand-row plan costs whatever is open and no more. Sibling ordinals are counted **per kind**, so a stray row of another kind cannot push M2 to M3. A search keeps matching rows **plus every ancestor that leads to one** (a match hanging off nothing is unreachable) and force-opens those branches. `expandableIds(tree)` powers Expand all.

Also implement the id-based drill-down resolver for deep links — `resolveViewPath(tree, { projectId, milestoneId, resultId, actionId })` → `{ levels, crumbs, selection, focus }`:

- **The path is ids, not labels.** Each id is resolved by looking it up **among the children of the level above**; refs are computed on the way down for display only, and nothing is ever found by matching one. That is also what makes refs safe to renumber — deleting M1 changes every label below it and breaks no link.
- **A stale id is dropped, not guessed.** If the URL names a milestone that is not under the named project — an old bookmark, a deleted row, a moved branch — the path **truncates at the last level that genuinely lines up** and everything deeper goes with it, rather than showing rows from somewhere else under a breadcrumb that lies. Compare the resolved selection against what came in to decide whether to rewrite the URL.
- `selectAt(current, kind, id)` clears every level below, and re-selecting the row that is already open **collapses** it.
- Serialise as `?project=&m=&r=&a=`, with an absent level as an **absent key**, not an empty string.

Which fields a level may show lives in one auditable table, so the pane and any future export cannot disagree:

```ts
LEVEL_FIELDS = {
  project:        { clockTimes:false, hoursDuration:false, targetDate:true, wmsTask:false },
  milestone:      { clockTimes:false, hoursDuration:false, targetDate:true, wmsTask:false },
  result:         { clockTimes:false, hoursDuration:false, targetDate:true, wmsTask:false },
  action:         { clockTimes:true,  hoursDuration:true,  targetDate:true, wmsTask:true  },
  sub_action:     { clockTimes:true,  hoursDuration:true,  targetDate:true, wmsTask:true  },
  sub_sub_action: { clockTimes:true,  hoursDuration:true,  targetDate:true, wmsTask:true  },
}
```

A Result gets the task-ish controls **except** start time, end time and an hours duration: it is a container, so a clock time on it would be plan metadata that no calendar, timer or task list would ever honour. A Result is scheduled by the date it is due and measured by the actions underneath it.

Which columns the grid to the right of the name actually has is decided by the rows **currently visible**. A level with no business carrying a field leaves its cell empty rather than shifting its neighbours; a field no visible level carries loses its column entirely.

### 6.6 The create flow

**Five create boxes** — Project · Milestone · Result · Action · Sub-Action — plus **Bulk Upload**, in ONE component used by both the register toolbar and the board's search row. Two copies would drift the first time a level was added.

Single-key shortcuts, shown as keycaps in the corner of each box: **P · M · R · T · S**. **T for Action, not A** — A is Select-All in every list on earth and S is Save; T (for Task, which is what an Action becomes) leaves Action on one key without teaching people that a bare A does something surprising. Suppress every shortcut while a field has focus, while any modal is open (`[data-state="open"]`), and with any modifier held — otherwise typing "Project review" into the search box opens five dialogs.

**No sixth box for Sub-Sub-Action**: it is a sub-division of one particular sub-action, added from that row where the parent is already unambiguous. **No permission gate on create** — creating a row is not a verdict about anyone's work.

**One dialog, two destinations.** Every button opens the *same real task form* the app-wide "+" opens (client, subject, initiator, priority, due date, description, notes, tags, links, attachments) — one gesture should not open two different dialogs depending on which button was pressed. Where the two paths part is only the destination:

- `hasTask(kind)` → `beforeSubmit` creates the plan row, then the form creates **the** task hanging off it. One record shared by the plan, the task list and the calendar.
- `project` / `milestone` → a `createOverride` writes a `project_nodes` row and **no task**, with the Schedule block hidden. This is exactly why the intake columns exist: a form that collects six fields and throws them away is worse than one that never asked.

**`ParentPickers` — "where does this go?"** A cascading chain: a Sub-Action asks Project → Milestone → Result → Action; a Milestone asks only for a Project. Each select is fed from the one above, so an impossible pairing cannot be assembled at all and the server's parent-kind check never has to reject anything. Choosing an ancestor invalidates every level below it. ONE copy, shared by the create dialog and the bulk upload.

**The last-accessed branch.** "Bulk upload goes inside the project which was last opened — same with results and actions and sub-actions."

- Store a **chain, not six independent ids**. A remembered milestone that no longer sits under the remembered project is worse than no memory at all — it files work in the wrong place and looks deliberate doing it.
- A write carries the whole path from the project down to the row that was touched, and drops the levels **below** it: opening a different milestone makes the action you had open under the old one a stale answer.
- A read **re-derives the path from the live tree** rather than trusting storage. Walk the stored chain from its **deepest link upwards** and return the path of the first id that still exists — so deleting a sub-action falls back to its action, and deleting the whole project falls back to nothing rather than to a context full of ids that resolve to no row. Names come back fresh; deleted rows fall out.
- **localStorage, per browser, not per account.** This is a convenience about where you were a moment ago, not a preference worth a column and a round-trip; a cleared one costs a dropdown click. Wrap every read and write in try/catch (private window, full quota, hand-edited value) and fire a window event after each write so two surfaces on one screen agree.
- `seedAncestors(kind, ctx)` pre-fills the pickers, **stopping at the first level the context cannot supply** — a chain with a hole in it is not a chain, and a milestone id with no project above it sits in a select whose options were never loaded.
- Every seeded select shows a **"last opened" chip** saying where the value came from, and stays editable. It is a default, not a lock.

### 6.7 Bulk upload

Fifty actions under one result, in one gesture: paste a column out of a document, paste a block out of Excel, or hand it the `.xlsx`. Keep the reading and checking in a client-safe module (worth a unit test) and the dialog separate (not worth one).

- **Max 300 rows.** The dialog refuses to preview more and the action refuses to accept more, so a ten-thousand-line paste fails at the paste box with a sentence rather than at the database with a timeout.
- **Six columns only** — Name, Owner, Target Date, Start Date, End Date, Description — each with aliases (`due`, `deadline`, `assignee`, `responsible`, `from`, `to`, `remarks`, `scope`…) matched on a lower-cased, punctuation-free key. Start/End are offered only on scheduled levels. Bulk upload is for **structure**; priority, client, tags, links and attachments are per-row judgements someone makes with the row in front of them, and a spreadsheet column of them is a column nobody fills.
- **Header detection scans the first 10 rows for two recognised columns** — one is a coincidence ("Name" is a common first cell), two is a header — then falls back to a single hit, because a filled-in template usually has a title and a blank line above the grid and people paste from halfway down a sheet.
- **Owner matching:** exact normalised name → email → unique prefix ("Manan" finds Manan Vasa when he is the only Manan). **Ambiguity never guesses** — two Manans leave the cell empty and the row says so, because the wrong doer on forty imported actions is forty notifications to the wrong person.
- **Only the name is required** (≤160 chars). Blocking errors: missing name, over-long name, End before Start. Non-blocking warnings: an unmatched owner name, and "No task yet — needs an owner and a target date" on a task level.
- **Duplicates** are flagged against what already sits under the parent (`existing`) and against earlier rows in the same file (`file`).
- **Re-evaluate the whole set after every inline edit** — "this name is repeated" only means anything in the company of the rows around it, and editing a name has to be able to clear the flag on the row it was clashing with. Recompute `include` **only for rows that just became invalid**; a clean row keeps whatever the user ticked, or typing in one name box silently re-ticks forty rows somebody had just unticked.
- **Every row is shown before anything is written**: names editable in place, owners and target dates pickable per row, duplicates flagged, anything unreadable unticked and saying why.
- The destination pickers open **pre-filled from the last-accessed branch**, so bulk-uploading actions while a result is open needs no destination chosen at all — which is the whole request.
- Offer a downloadable template with exactly the columns that level has somewhere to put.
- Accept `DD-MMM-YYYY`, `YYYY-MM-DD`, real Excel date serials and the common regional forms.

### 6.8 The attachments and links cells

The two sit side by side in every register and must have **the same shape and the same behaviour** — two cells that look identical and answer to different gestures would be worse than either choice on its own.

Show a **count and nothing else** until opened. **A row with something is red** (icon and count in the module's red on a wash), so a column of sixty rows says at a glance which ones carry anything. **Opens on hover** — point at the cell and the list appears, with each item and a delete on every one of them, no click needed to find out what is in there. Clicking opens it **and pins** it so the panel does not evaporate while you are reaching for a filename; pin automatically while the OS file picker is up, which is otherwise exactly when the pointer wanders off and takes the panel (and the upload) with it. Decide which way to open against a `PANEL_MAX_H` of ~320, erring slightly large: guessing too big merely drops a panel that would have fitted above, guessing too small opens one off the top of the window.

The only difference is where the list comes from: an attachment costs a signed URL per file and is fetched on open; links are a few lines of text that already rode down with the row, so there is nothing to fetch. Adopt fresh server values **during render** (compare against the last props you saw) so neither cell sticks on a stale local list after a revalidate.

Attachments: private bucket, **20 MB** cap, upload deny-list, signed URLs minted per read with a **10-minute TTL** (a copied URL must go stale), best-effort object removal before the row is dropped, and every mutation resolving the caller **on the server** — a client that posts a `nodeId` it has nothing to do with proves nothing by the id alone.

### 6.9 The progress cell

Every number is computed from the subtree the row is handed. What each level shows:

- **Project** — the headline: `40%` over `3.5/10`.
- **Milestone** — its own percent, **editable by the owner or an admin**. That input is what *makes* the 3.5 above. Clearing it is a first-class action: blank the box and progress goes back to being derived, which is the honest default.
- **Result** — derived from the actions beneath it, read-only. There is nothing to judge; the actions either are done or are not.
- **Executable** — **no percent at all.** An action's progress *is* its status, and a second number beside the chip could only disagree with it.

Every level also prints what is directly under it, **named after that level**, read off `CHILD_KIND` rather than written out four times: "0 out of 3 milestones" / "…results" / "…actions" / "…sub-actions". Same `childCompletion` the registers' rollup uses, so it can legitimately read "1.5 out of 3". Suppress that line on surfaces that already have a rollup column, or a one-line cell overflows into the very column that was already saying it.

---

## 7. Server actions

All zod-validated, all rate-limited, all revalidating both project surfaces. There is **exactly one permission rule in this module and it is status**: create, rename, re-date, move, duplicate, delete and attach are open to **any signed-in employee**, by explicit product decision. Do not add an ownership gate.

**`syncNodeTask(nodeId, actor)` — the only path in the codebase that touches a plan row's task.**

- Returns early unless `hasTask(kind)`.
- **Creation is lazy**: the row becomes a real task the moment it has **both** an owner and a target date — the two columns `tasks` cannot be inserted without. Until then it is plan-only and reads **"Not scheduled"**. This is what keeps the task list and everyone's calendar free of half-typed placeholder rows.
- Existing task → update `title, doer_id, due_at, starts_at, ends_at, estimated_minutes` in place and reconcile the calendar event after the response.
- No task yet, now schedulable → create it through the **shared task-create core**, so the short id, the audit event, the notifications and the calendar sync are byte-identical to a task created anywhere else in the app. Default priority `imp_not_urgent`.
- Became unschedulable because a field was momentarily cleared → **leave the existing task exactly as it is** rather than tearing it down.
- **Never throws.** The hierarchy edit is already committed by the time this runs; a calendar or task hiccup must not roll it back. Log and move on.

| Action | Behaviour |
|---|---|
| `createPlanNode({kind, parentId, name?})` | The bare `+` on a row. Validates `PARENT_KIND` both ways. `sort_order = COALESCE(MAX(sort_order),0)+10` among its siblings — **gaps of 10** leave room for a future drag-drop to slot a row between two others without renumbering. A task-level row seeds `owner_id = me` and `target_date = today` and syncs, so the work is never invisible; both are editable cells the moment the row lands, so a wrong guess costs one click. Containers get neither. |
| `createPlanNodeForTask(...)` | The dialog's task path. Refuses a non-`hasTask` kind. **Deliberately does NOT call `syncNodeTask`** — the caller is about to create the task itself with the full field set, and letting both run is how you get two tasks for one row. |
| `createPlanContainer(...)` | The dialog's container path. Refuses a `hasTask` kind. Writes the node and **no task**. Retries the insert without the intake group on 42703. |
| `bulkCreatePlanNodes({kind, parentId, rows})` | Up to 300. **Not a loop over the single-row creates**: the parent check, the roster lookup and the `MAX(sort_order)` read are facts about the *destination*, so they happen once — fifty rows cost one validation, one ordering query and one INSERT. Then every task-level row goes through `syncNodeTask`, with a blank owner filled by the importer and a blank date by today, so **no imported row quietly fails to become a task**. Plan rows commit first, so one row's task failure leaves 50 rows and 49 tasks, not a half-written import and an error page. |
| `updatePlanNode(...)` | Inline editing. `""` **clears to NULL** — a stored blank would still fail every `description &&` check on the read side while the column claimed otherwise. **Refuse `priority` and `notes` on an executable row** with a real sentence ("An action takes its priority from its task — set it there"). Store `targetDate` at **noon local**, not midnight, or it lands on the previous day for anyone west of the storage zone once it round-trips. Reject `endsAt < startsAt`. Verify a supplied owner still exists. Then sync. On 42703 involving `priority`/`links`, retry without them rather than losing the whole edit. |
| `setPlanNodeStatus({id, status})` | Accepts any string; `canSetPlanStatus` decides, **here, before the write**. Routes the value as per §4.2. Turn 42703 into a sentence a person clicking a dropdown can act on. |
| `setPlanNodeProgress({id, percent\|null})` | Only ever an override; `null` returns to derivation. Owner or admin — declaring a milestone 75% done when three of its ten actions are finished is a ruling, not a report. |
| `deletePlanNode(id)` | **Archive, never delete.** Archives the row, every descendant (via the CTE) and the tasks those rows are — which also tears down their calendar events. Pair it with `planDeleteImpact(id)` → `{nodes, tasks}` so the confirm dialog can say exactly what is about to disappear. |
| `duplicatePlanNode(id)` | Copies the row and its whole subtree in as a **new sibling directly after it**, plan fields included — the point is to save re-typing. Each copy then goes through `syncNodeTask`, so duplicating a *scheduled* branch really does put the copies in the task list and duplicating a *draft* branch does not. Same bar a hand-typed row has to clear. |
| `movePlanNode({id, direction})` | **Renumber the sibling run to 10/20/30… in its current visible order FIRST.** `sort_order` defaults to 100, so every row created before this screen existed shares that one value; swapping two rows that both hold 100 writes 100 twice and silently does nothing — which users report as "the arrows are broken". Renumbering is a no-op on runs that are already spaced. Then swap. Reordering never changes parentage. At either end it is a **no-op, not an error**. |
| Attachment actions | `listPlanAttachments` / `uploadPlanAttachment` / `deletePlanAttachment`, each resolving the caller server-side first. |

---

## 8. Design

Follow the host app's tokens; do not invent a palette. The reference uses one accent red (`#E10600`, deep `#A80400`, soft `#F8C8C7`) for the module's chrome, the create boxes, selection and the "this row carries something" state on the attachment and link cells.

Density over decoration: this is a planning table people read all day. Sticky headers, hairline borders, a max content width around 1600px, tabular numerals in the numeric columns, and the level typography table from §3.3 doing the work of showing hierarchy — weight and size, plus indent, not colour blocks.

---

## 9. Pitfalls to get right the first time

1. **Never store a ref, a day count or a derived percent.** The moment one is stored it starts drifting from the tree it describes.
2. **Never parse a ref to find a parent.** `parent_id` is the only relationship; refs are output.
3. **One task per row, created lazily, never duplicated.** The two create paths each deliberately skip the sync the other performs — get this wrong and every row created from the dialog has two tasks.
4. **`hasTask` ≠ `isExecutable`.** A Result has a task *and* derived progress. Collapsing them makes a container's progress a self-report competing with its own children.
5. **Never round partial completion on the way through.** Round once, at display, to two decimals — one decimal turns 2.25 into 2.3.
6. **A restricted verdict never overwrites the working status.** Two columns, one layered over the other for display.
7. **Links are a column, not a marker in the notes prose.** Rendering a Links cell from free text means parsing on every row, and a note containing "Links:" sprouts links nobody added. Validate `^https?://` **server-side** — an `href` the register renders must never carry `javascript:`.
8. **Guard every late-added column group in its own try/catch round-trip.** 42703 is not a null; it is a 500 on the whole screen.
9. **Renumber before you swap** in the move action, or the arrows do nothing on legacy rows.
10. **Count chips over the whole tree**, not the rendered rows, or a collapsed plan reports zero of everything.
11. **Compute the initial collapse once**, in a state initialiser — recomputing on every render re-closes what the user just opened.
12. **Archive, don't delete.** Revoke DELETE at the database so nobody can change their mind by accident.
13. **The status dropdown is a courtesy, not a control.** The server re-checks every value and would refuse a hand-rolled POST even if the picker did not exist.
14. **Freeze offsets are cumulative sums of fixed widths.** Let one identity column size to its content and every column after it lands wrong.

---

## 10. Build order

1. Migration + ORM schema + the client-safe level module (`PLAN_KINDS`, the three predicates, `refFor` / `fullRefFor`, duration and date helpers, `LEVEL_STYLE`) — **with unit tests per rule**.
2. `status.ts` (two flows, labels, tones, `canSetPlanStatus`, `effectivePlanStatus`) and `progress.ts` (the partial rule), both with tests against the worked examples in §5.
3. `listPlanTree()` + the guarded metadata reads + the server→client row serialiser.
4. The server actions, `syncNodeTask` first.
5. The hierarchy board: flatten, columns, inline cells, chips, search, sort, Columns menu, export, detail / edit / bulk-edit dialogs.
6. `register.ts` + the four registers, including the frozen identity block.
7. `views.ts` (`flattenPlanTree`, `resolveViewPath`, `LEVEL_FIELDS`) + Project Views.
8. Kanban.
9. The create dialog, `ParentPickers`, and the last-accessed-branch memory.
10. Bulk upload.
11. Attachments and links cells.

**Done means:** I can create a project, a milestone under it and three actions under a result; watch them number themselves P1 / M1 / RA / A1–A3 and **renumber when I delete A2**; give one action an owner and a date and see it appear in the task list and on the calendar as **one** record; tick it done and watch the milestone read 1/3 without anyone typing a number; record that milestone at 50% and watch the project read **3.5/10**; be refused when I try to approve my own work and allowed when the project owner does it; drag a card on the plan kanban and find it moved on the task board too; paste fifty rows out of Excel into the result I last opened without choosing a destination; export exactly what is on screen; and archive the project and find its milestones, results, actions **and their tasks** gone from every screen at once — with nothing hard-deleted.

Start by telling me how you're mapping this onto the existing stack — especially which existing task module, auth helper and detail drawer you are reusing — then build it.
