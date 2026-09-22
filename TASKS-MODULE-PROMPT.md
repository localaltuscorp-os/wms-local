# PROMPT — Build the "Tasks" (WMS) module

> Paste everything below this line into a fresh Claude Code session in the OTHER project.

---

Build a complete **Tasks / WMS (Work Management System)** module in this codebase. A task is one piece of committed work: an **initiator** asks a **doer** to do something by a **due date**. The doer reports progress through a status lifecycle, a manager rules on the finished result, and everything that ever happened to the task is on an audit timeline. The module is the spine of the app — a list, a Kanban board, a detail page, bulk editing, import/export, and time tracking.

First inspect this repo and adapt to whatever stack it uses (framework, ORM, auth, design tokens, component conventions). The spec below is the *behaviour* to reproduce; the reference implementation is Next.js 15 App Router + TypeScript + Postgres (Drizzle) + server actions + Tailwind. Map every concept onto this project's existing patterns — reuse its auth/session helper, its DB layer, its toast, its avatar component, its card/shadow tokens. Do **not** introduce a second styling system or a second data-access style.

Ask me only if something genuinely can't be inferred from the repo; otherwise make the call and tell me the assumption.

---

## 1. Vocabulary

- **Task** — one committed unit of work. Has a title, a doer, an initiator, a priority, a due date, and a status.
- **Doer** — the person who does the work. Exactly one per task; reassigning moves it.
- **Initiator** — the person who asked for it. Distinct from the **creator** (who typed it in), because a manager often raises a task on someone else's behalf.
- **Doer Status** — the *worker's* progress report. This is what the primary status control writes. It is called "Doer Status" everywhere in the UI, never just "Status" — the column holds the worker's progress, not the manager's verdict.
- **Approval Status** — the *manager's* verdict on finished work. A **separate column**, deliberately independent of the doer's lifecycle.
- **Approval Level** — two-stage sign-off: `none` → `manager` (the doer's manager accepts) → `admin` (final sign-off, which only the founder can give).
- **Effective due date** — `COALESCE(revised_target_date, due_at)`. The single most important derived value in the module.
- **Fan-out** — creating one task against N doers produces N independent task rows, not one shared row.

---

## 2. Data model

### 2.1 The task

```sql
CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_no       integer NOT NULL DEFAULT nextval('tasks_task_no_seq'),  -- friendly "#1042"
  short_id      text,
  title         text NOT NULL,
  description   text,
  notes         text,                       -- initiator notes, team-visible
  subject       text,                       -- free text; `subjects` table is only the picker roster
  client        text,                       -- free text; `clients` table is only the picker roster
  tags          text[],

  doer_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  initiator_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_by_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
  transferred_from_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  priority      task_priority NOT NULL DEFAULT 'not_imp_not_urgent',
  status        task_status   NOT NULL DEFAULT 'not_started',

  -- Dates. `due_at` is IMMUTABLE after creation (the first committed date is
  -- permanent, for audit). Later changes land in revised_target_date.
  due_at              timestamptz NOT NULL,
  revised_target_date timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),  -- optimistic-lock token
  first_read_at       timestamptz,          -- set when anyone first opens the detail

  -- Manager verdict + two-stage sign-off
  approval_status  approval_status,          -- NULL = no verdict yet
  approval_level   approval_level NOT NULL DEFAULT 'none',
  manager_approved_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  manager_approved_at    timestamptz,
  manager_approval_note  text,
  admin_approved_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  admin_approved_at      timestamptz,
  admin_approval_note    text,

  -- Internal scheduling (a time block, distinct from the deadline)
  starts_at   timestamptz,
  ends_at     timestamptz,
  all_day     boolean NOT NULL DEFAULT false,
  recurrence  text,                          -- 'none'|'daily'|'weekly'|'monthly'|'yearly'
  recurrence_rule text,                      -- RRULE-lite: weekdays / monthly mode / end
  recurrence_parent_id      uuid,            -- NULL on the rule-holder, set on instances
  recurrence_occurrence_date text,
  estimated_minutes integer,

  archived      boolean NOT NULL DEFAULT false,
  abandoned_at  timestamptz,                 -- Recycle Bin
  abandoned_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Optional links out to other modules; all ON DELETE SET NULL
  project_node_id uuid REFERENCES project_nodes(id) ON DELETE SET NULL,
  origin_goal_id  uuid,

  -- Generated, never written by app code
  search_text text GENERATED ALWAYS AS (
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
    coalesce(client,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(notes,'')
  ) STORED
);
```

**Indexes that actually matter** — add all of them; each backs a real screen:

```sql
CREATE INDEX tasks_doer_created_idx      ON tasks (doer_id, created_at);
CREATE INDEX tasks_doer_status_idx       ON tasks (doer_id, status);   -- "this person's open work"
CREATE INDEX tasks_initiator_created_idx ON tasks (initiator_id, created_at);
CREATE INDEX tasks_status_created_idx    ON tasks (status, created_at);
CREATE INDEX tasks_archived_idx          ON tasks (archived, created_at);
CREATE INDEX tasks_due_at_idx            ON tasks (due_at);
CREATE INDEX tasks_approval_status_idx   ON tasks (approval_status);
CREATE INDEX tasks_project_node_idx      ON tasks (project_node_id);
-- Partial: "still open" is most of the table and never what these queries want.
CREATE INDEX tasks_completed_at_idx ON tasks (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX tasks_pending_created_idx ON tasks (created_at)
  WHERE status IN ('not_started','initiated','follow_up','need_info','on_hold','dont_know');
-- Indexed ILIKE + fuzzy search
CREATE INDEX tasks_search_trgm_idx ON tasks USING gin (search_text gin_trgm_ops);
```

### 2.2 Supporting tables

```sql
-- Immutable audit timeline. EVERY write appends one row.
CREATE TABLE task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id   uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  event_type text NOT NULL,          -- 'status_changed' | 'reassigned' | 'comment' | …
  from_value jsonb,
  to_value   jsonb,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_events_task_created_idx  ON task_events (task_id, created_at);
CREATE INDEX task_events_actor_created_idx ON task_events (actor_id, created_at);

-- Admin-editable status labels + colours. The UI must NEVER hardcode a label.
CREATE TABLE status_settings (
  status        task_status PRIMARY KEY,
  label         text NOT NULL,
  color_token   text NOT NULL,
  display_order integer NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
```

Also build, in this order of importance: `task_checklist_items`, `task_attachments`, and the time-tracking set (`task_time_events` raw start/stop, `task_work_sessions` resolved sessions, `task_time_rollup` a per-task cached total). Roll-up exists so a list of 500 rows does not aggregate raw events 500 times.

---

## 3. Statuses — the part most implementations get wrong

There are **three independent axes**. Collapsing any two of them is the classic mistake.

```ts
export const TASK_STATUSES = [
  "dont_know",    // "I haven't assessed this yet" — renders as "Not Read"
  "not_started", "initiated", "follow_up", "need_help", "on_hold", "need_info",
  "follow_up_1", "follow_up_2", "follow_up_3",
  "done",
  // Legacy terminal values. Keep them in the physical enum so imported rows
  // still render; never offer them in a picker.
  "approved", "not_approved", "cancelled", "transferred",
] as const;

/** What the status PICKER offers — the doer's lifecycle, nothing more. */
export const DOER_TASK_STATUSES =
  ["dont_know","not_started","initiated","follow_up","need_info","done"] as const;

/** Drives kanban columns, filter dropdowns and importers. `on_hold` must stay
 *  selectable here even though the picker omits it. */
export const USER_TASK_STATUSES =
  ["dont_know","not_started","initiated","follow_up","on_hold","need_info","done"] as const;

export const PENDING_STATUSES =
  ["dont_know","not_started","initiated","follow_up","on_hold","need_info"] as const;

export const DEPRECATED_TASK_STATUSES =
  ["follow_up_1","follow_up_2","follow_up_3","cancelled","transferred","need_help"] as const;

export const APPROVAL_STATUSES = ["approved","not_approved","cancelled","transferred"] as const;

export const PRIORITY_LABELS = {
  imp_urgent: "Critical", imp_not_urgent: "Important",
  not_imp_urgent: "Urgent", not_imp_not_urgent: "Normal",
};
```

Rules:

1. **`on_hold` is not in the doer's picker.** Putting a task on hold is a *manager's ruling*, not a worker's progress report. It appears in the bulk bar's "Manager Status" dropdown as "Mark Hold On".
2. **The approval verdicts were never doer statuses.** They live in `approval_status`.
3. **Deprecated statuses stay in the enum but leave every picker, filter dropdown and kanban column.** Filter them with `isDeprecatedStatus()` wherever a status list is built dynamically.
4. **Every label comes from `status_settings`**, with a hardcoded fallback map used only when the table has no row. Admins rename statuses; a hardcoded string in a component is a bug.

### 3.1 Transition matrix

A pure function, no DB, no I/O: `nextStatusesFor(current, role) → TaskStatus[]` where `role` is `"doer" | "initiator" | "creator" | "admin" | "stranger"`.

- **admin** — anything except a self-transition, **minus `approved` / `not_approved`**. Those go through the two-stage approval flow; leaving them reachable here would let any admin drag a card to Approved and skip the whole rule.
- **stranger / creator-only** — nothing.
- **from any pending status** — doer and initiator may move sideways within pending; **doer** may also mark `done`; **initiator** may `cancel` / `transfer`.
- **from `done`** — back to pending is the doer's or the initiator's to make; the verdict is the manager's.

The server consults it defensively on every write; the UI consults the same function to hide controls it would reject. Add a unit test per row of the matrix.

---

## 4. Rules that cut across every screen

**Effective due date.** Overdue is *always* computed from the revised date:

```ts
effectiveDueAtSql()  // COALESCE(tasks.revised_target_date, tasks.due_at)  — for queries
pickEffectiveDue(t)  // t.revisedTargetDate ?? t.dueAt                     — for loaded rows
```

`due_at` is immutable after creation. Every overdue badge, every Age calculation, every date column, and every sort must key off the COALESCE — never the raw `due_at`, or a rescheduled task keeps reading as overdue forever.

**Optimistic locking.** Every status write ships the `updated_at` the client last saw; the server compares at millisecond precision and refuses a stale write with a distinguishable `"stale"` error so the UI can say "someone else changed this first" and refresh, rather than showing a generic failure.

**Atomicity.** The task UPDATE and its `task_events` INSERT commit or roll back together. Notifications and calendar sync run *outside* the transaction, so a slow send never holds a row lock.

**Unread.** `first_read_at IS NULL` **AND** the status is pending. Both halves matter — a done task nobody opened is finished, not unread, and counting it makes the figure larger than the "Not Read" pill that links to it.

**Fan-out.** Creating with N doers makes N rows. Land on the task detail for N=1, on the filtered list for N>1.

---

## 5. Screens

### 5.1 `/tasks` — the list (the main screen)

A filter bar across the top, then a dense table.

**Filter bar** (every dimension is a URL param, so any filtered view is linkable): date range · employee · **View: Doer | Initiator** (which side of the task the employee filter means) · status · priority · subject · client · department · plus the cross-cuts `?unread=1`, `?overdue=true`, `?age_range=<slug>` and `?taskId=`. Cross-cuts *narrow within* the selected statuses rather than replacing them.

**Table columns** — `Action (timer) · ID No. · Client · Doer · Priority · Doer Status · Subject · Created · Due · Age`. `ID No.` and `Created` are **hidden by default**: the id is an internal handle nobody quotes and Created is the one date that never drives a decision. Both stay in the Columns menu — that is a default, not a removal. Persist column visibility in localStorage under a **versioned** key, and bump the version when you change defaults (an existing "show everything" blob would otherwise overwrite them forever).

**Inline editing** — Doer, Priority, Doer Status and Due are click-to-edit cells that write through immediately, each re-checking permission server-side. The status chip has uniform geometry (`min-w`, never a fixed width) because labels are admin-editable and a fixed width silently truncates a custom one.

**Group by** — none (default) · Client · Subject · Doer Status · Employee · Priority. Null values collapse into one explicit "—" bucket rather than vanishing.

**Bulk bar** — appears when ≥1 row is ticked. The control order is a contract, left to right:

```
[N] selected · Doer Status · Priority · Reassign · Subject · Client · Manager Status · Archive · Delete   (Clear, pinned right)
```

Doer-facing edits first, then the manager's ruling, then the two destructive actions. Subject and Client appear only when there are values to offer. Manager Status offers *Mark Hold On · Mark Approved · Mark Not Approved · Mark Done · Mark Cancelled* — note these write **two different columns** (`status` for hold/done, `approval_status` for the verdicts), which is exactly why they are grouped apart from Doer Status. Every bulk action reports `{updated, skipped}` and says how many were skipped for permission.

Also: search (indexed ILIKE over `search_text`), CSV / XLSX / PDF export of exactly what is on screen, and a fullscreen mode.

### 5.2 `/tasks/kanban` — the board

One column per live status plus a synthetic **Archived** column. Admin-only; doers work from the list.

- **Drag and drop** with `@dnd-kit` — cards between columns (a status change), and admins may drag **column headers** to reorder the board; that order persists to org settings.
- **Per-column card order** lives in localStorage (`columnId → ordered ids`), because the query orders by `created_at` and there is no per-task board position. Without it, the refresh that follows every drop re-sorts the column and the card snaps back down.
- **Undo** — after a drop, a toast stays actionable for ~10s and restores the card to its exact previous column *and slot*, neighbours included.
- Cards show: title · `#taskNo` · priority flag · due date with an **overdue** treatment · `Client · Subject` · doer avatar + name. Columns render ~10 cards then "Show N more".
- Cards are capped and virtualised enough that a 1000-task board stays responsive.

### 5.3 `/tasks/[id]` — the detail

Everything about one task on one screen: the fields (inline-editable per permission), the **audit timeline** from `task_events` in reverse-chronological order, comments (add / edit / delete, each an event), checklist items, attachments, the time-tracking panel with Estimated vs Actual, and the approval panel. Opening it stamps `first_read_at` if it is null. `/tasks/[id]/focus` is a stripped, single-task working view with the timer front and centre.

### 5.4 `/tasks/new` — the create form

The canonical route **and** a modal that opens from anywhere (a global "N" keypress, plus a window event so out-of-tree triggers reuse the one dialog instead of mounting a second copy — two copies means two modals and both open on one keypress).

Five numbered sections:

```
01 BASICS       — Client Name*, Subject*                         "Who this is for"
02 ASSIGNMENT   — Initiator*, Doer* (multi), Priority, Due Date*  "Owners, priority & deadline"
03 DETAILS      — Task Description* (+Dictate), Initiator Notes (+Dictate)   "The work itself"
04 ORGANIZE     — Tags, Project link, Schedule block              "Optional — tags, project & schedule"
05 ATTACHMENTS  — Attach Media (0/4), Add Links                   "Optional — media & reference links"
```

The **Schedule** block carries All-day, Start and End (date + time), and a Repeat picker, with a standing note that this is internal scheduling — the *deadline* is the Due Date above; this block describes when the work happens and how it repeats. Ctrl+Enter creates from anywhere in the form. Validated core fields go through the form library + schema resolver; auxiliary widgets (tags, schedule, media, links) stay in local state and fold into the payload at submit. Link URLs are appended to `notes` so they survive without a new column.

Also build `/tasks/import` (paste-from-Excel grid + file import, with duplicate and anomaly review before commit), `/tasks/duplicates` (a finder over similar titles), and `/tasks/time/*` (per-employee, per-task and manager time reports).

---

## 6. Server actions

All of them: authenticate, rate-limit, validate with the repo's schema validator, **re-check permission from the DB** (never trust an id or a role from the client), append a `task_events` row, return `{ok:true, …}` or `{ok:false, error}` — never throw to the UI — and revalidate the affected paths.

| Group | Actions |
|---|---|
| Lifecycle | `setTaskStatus` · `setTaskPriority` · `rescheduleTask` · `reassignDoer` · `editTaskFields` · `setTaskRevisedTargetDate` |
| Create | `createTask` (fans out over doers) · `bulkCreateTasks` · `quickAddClient` · `quickAddSubject` · `loadNewTaskOptions` |
| Bulk | `bulkSetStatus` · `bulkSetPriority` · `bulkReassignDoer` · `bulkSetSubject` · `bulkSetClient` · `bulkSetApprovalStatus` · `bulkArchive` · `bulkDelete` |
| Approval | `decideTaskApproval` (two-stage) · `approveTask` · `setTaskApprovalStatus` |
| Lifecycle edges | `archiveTask` · `unarchiveTask` · `deleteTask` · `reassignTask` · `nudgeTask` |
| Social | `addComment` · `editComment` · `deleteComment` |

Put the status-write core in its own module taking an explicit actor `{id, name}`, so web actions and any mobile/JSON API share one implementation. That layer owns the transition check, the optimistic lock and the SQL; callers own auth, rate-limiting and cache revalidation.

**Reads** — a light `BoardTask` shape for the board, a richer `TaskListRow` for the table, both accepting the same filter object so every surface narrows identically. Cache with a short revalidate window and tag-based invalidation. Remember that a cache hit returns `Date` fields as ISO strings — re-wrap them or the types lie.

Optional but valuable: a mobile JSON API (`/api/mobile/tasks`, `…/kanban`, `…/[id]`, `…/[id]/status`, `…/[id]/comment`) derived from the *same* filter and grouping helpers so web and mobile cannot diverge; a `task-reminders` cron; and Google Calendar sync with durable retry state (`calendar_attempts`, `calendar_next_attempt_at`, `calendar_last_error`) driven by a reconciliation loop.

---

## 7. Design

Follow this repo's existing tokens and component library. The reference module reads: a strong brand red (`#E10600`, deep `#A80400`) as the module accent; rounded "section" cards on a light canvas; a heavy display font at ~900 weight for page titles; uppercase micro-labels with wide letter-spacing; tabular numerals for every figure and date; pill-shaped chips for statuses, priorities and bulk controls. The bulk bar is a sticky, blurred, single-line strip with a brand accent rail down its left edge — it never wraps to a second row; it scrolls horizontally instead. Fully responsive; every icon-only control needs an `aria-label`, and toggles need `aria-pressed`.

---

## 8. Pitfalls to get right the first time

1. **Three axes, not one**: doer status, approval status and approval level are separate columns. Never collapse them.
2. **Overdue is always from the effective due date** (`COALESCE(revised, due)`), never the raw `due_at`.
3. `due_at` is **immutable** after creation; reschedules write `revised_target_date`.
4. **Never hardcode a status label or colour** — read `status_settings`, fall back to a constant map.
5. **Deprecated statuses stay in the enum, leave every picker.**
6. Status writes need the **optimistic lock**, and "stale" must be a distinguishable error.
7. The task UPDATE and its audit event are **one transaction**; notifications and calendar sync are outside it.
8. **Unread = never opened AND still pending** — both halves.
9. Kanban card order must be **remembered client-side**, or every drop snaps back after the refresh.
10. **One create dialog, many triggers** — dispatch an event; never mount a second copy.
11. Bulk actions must report **skipped** counts, not silently drop rows they could not touch.
12. Bump the **localStorage version key** whenever you change column defaults.
13. Archive, don't delete, by default — history has to survive.

---

## 9. Build order

1. Migration + ORM schema + the enum/constant module (`TASK_STATUSES`, the four picker subsets, `PRIORITY_LABELS`, `isDeprecatedStatus`).
2. `status-transitions.ts` — the pure matrix, **with unit tests per row**.
3. `effective-due.ts` — the COALESCE helpers, with tests.
4. Read helpers (`listTasks`, `listBoardTasks`) + the shared filter parser.
5. The status-write core + the lifecycle server actions + `task_events`.
6. `/tasks` list: table, inline cells, filter bar, columns menu, grouping.
7. The bulk bar + the bulk actions.
8. `/tasks/new` (form + modal) and `createTask`.
9. `/tasks/[id]` detail: timeline, comments, approval panel.
10. `/tasks/kanban`.
11. Import / export / duplicates.
12. Optional: time tracking, calendar sync, reminders cron, mobile API.

**Done means:** I can create a task for two doers at once and get two rows; see it on the list and the board; drag it between columns and undo that; have a stale write refused with a clear message; reschedule it and watch it stop reading as overdue while the original commitment is still on the audit timeline; tick five rows and reassign them in one action with a skipped-count in the toast; have my manager accept it and only the founder give final sign-off; and rename a status in settings and see the new label everywhere at once.

Start by telling me how you're mapping this onto the existing stack, then build it.
