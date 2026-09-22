# PROMPT — Build the "DCC" (Daily Compliance Checklist) module

> Paste everything below this line into a fresh Claude Code session in the OTHER project.

---

Build a complete **DCC — Daily Compliance Checklist** module in this codebase. DCC is a per-employee daily KPI checklist: every person has their own list of KPI items, each item has a schedule (daily / specific weekdays / weekly / monthly / adhoc), and every working day the person marks each due item **Done / Not done / NA / Pending**, optionally with a number and a note. Managers see their team's compliance, can sign off a person's day, and there is a company-wide ranking.

First inspect this repo and adapt to whatever stack it uses (framework, ORM, auth, design tokens, component conventions). The spec below is the *behaviour* to reproduce; the reference implementation is Next.js 15 App Router + TypeScript + Postgres (Drizzle) + server actions + Tailwind. Map every concept onto this project's existing patterns — reuse its auth/session helper, its DB layer, its toast, its avatar component, its card/shadow tokens. Do **not** introduce a second styling system or a second data-access style.

Ask me only if something genuinely can't be inferred from the repo; otherwise make the call and tell me the assumption.

---

## 1. Vocabulary

- **KPI item** — one checklist line owned by one employee (`title`, optional `code` like `A1`, optional `section` like "Weekly KPI", a `frequency` string, optional numeric `target` + `unit`).
- **Entry** — one fill of one item for one date: status, optional number, optional note.
- **Section** — a heading grouping items on the board ("A", "Weekly KPI", "Client work"…).
- **Client** — an *instance* of a section, so the same section can repeat per client (Section B for "Client X", again for "Client Y") without duplicating item definitions in the UI.
- **Subject / participant** — an external person (not an employee) tracked by a *participant-list KPI*. Example: "Follow up with each mentee" where the roster is Nikunj, Parimal, … Each participant gets their own Done/NA cell for the day.
- **Schedule kind** — `scheduled` | `weekly` | `monthly` | `adhoc` | `event`. **Only `scheduled` non-participant items count toward the daily due-set**, the compliance %, the streak and the gate. Everything else lives in its own collapsible tray and never blocks anything. This is the single most important rule in the module.
- **Review** — a manager's sign-off (`approved` | `needs_rework` + note) on one person's one day.

---

## 2. Data model

Five tables plus entries. Use this shape (rename to the repo's conventions if it has any; keep the columns and the constraints):

```sql
-- Per-person KPI definition. Managers/admins author; the owner fills.
CREATE TABLE dcc_kpi_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  section             text,                 -- "Weekly KPI" | "Client work" | …
  code                text,                 -- "A1".."B8"
  title               text NOT NULL,
  frequency           text,                 -- raw human string: "Daily", "Wed & Sat", "Every Sat", "Monthly", "Adhoc"
  weekdays            smallint,             -- bitmask, bit0=Mon … bit6=Sun (NULL/0 = always due)
  schedule_kind       text NOT NULL DEFAULT 'scheduled',
  is_participant_list boolean NOT NULL DEFAULT false,
  client_id           uuid REFERENCES dcc_clients(id) ON DELETE CASCADE,
  template_code       text,
  needs_review        boolean NOT NULL DEFAULT false,  -- frequency string was unparseable; a human should classify it
  target_number       numeric(14,2),
  unit                text,
  sort_order          integer,
  archived            boolean NOT NULL DEFAULT false,
  created_by_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dcc_kpi_items_owner_idx  ON dcc_kpi_items (owner_employee_id, sort_order);
CREATE INDEX dcc_kpi_items_client_idx ON dcc_kpi_items (client_id);

-- Section instancing: the same section repeated per client.
CREATE TABLE dcc_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  section text NOT NULL,
  name    text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dcc_clients_owner_section_name_uq ON dcc_clients (owner_employee_id, section, lower(name));

-- Participant roster (external people, NOT employees), deduped per owner by lower(name).
CREATE TABLE dcc_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text,                                -- optional tag: "mentee", "vendor" …
  sort_order integer NOT NULL DEFAULT 0,
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dcc_subjects_owner_name_uq ON dcc_subjects (owner_employee_id, lower(name));

-- Which subjects a participant-list KPI tracks (+ optional per-subject schedule override).
CREATE TABLE dcc_item_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES dcc_kpi_items(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES dcc_subjects(id)  ON DELETE CASCADE,
  schedule_kind text,
  weekdays      smallint,
  sort_order integer NOT NULL DEFAULT 0,
  archived   boolean NOT NULL DEFAULT false,
  UNIQUE (item_id, subject_id)
);

-- One fill per (item, date, subject). subject_id NULL = a simple KPI's own row.
CREATE TABLE dcc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES dcc_kpi_items(id) ON DELETE CASCADE,
  entry_date   date NOT NULL,
  status       text,                        -- 'Done' | 'Not done' | 'NA' | 'Pending'
  value_number numeric(14,2),
  note         text,
  filled_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  subject_id   uuid REFERENCES dcc_subjects(id) ON DELETE CASCADE,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- CRITICAL: the uniqueness must span the nullable subject axis, so use a
-- COALESCE-sentinel EXPRESSION index (a plain 2-col unique rejects participant rows).
CREATE UNIQUE INDEX dcc_entries_subject_uq ON dcc_entries
  (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX dcc_entries_date_idx    ON dcc_entries (entry_date);
CREATE INDEX dcc_entries_subject_idx ON dcc_entries (subject_id);

-- Manager sign-off for a person's day.
CREATE TABLE dcc_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  reviewer_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text,                              -- 'approved' | 'needs_rework'
  note   text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_employee_id, review_date)
);
```

Because the entries uniqueness is an expression index, most ORMs can't express it — write the upsert as raw SQL:

```sql
INSERT INTO dcc_entries (item_id, entry_date, status, value_number, note, filled_by_id, subject_id)
VALUES ($1,$2,$3,$4,$5,$6,$7)
ON CONFLICT (item_id, entry_date, COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET status=EXCLUDED.status, value_number=EXCLUDED.value_number,
              note=EXCLUDED.note, filled_by_id=EXCLUDED.filled_by_id, updated_at=now();
```

Deleting a fill = DELETE that exact `(item, date, subject)` row when status, value and note are all empty.

---

## 3. The scheduling engine (client-safe, no DB import — shared by UI, API and any importer)

Weekday bitmask: **bit0 = Monday … bit6 = Sunday**.

```ts
export const DCC_STATUSES = ["Done", "Not done", "NA", "Pending"] as const;
export type ScheduleKind = "scheduled" | "weekly" | "monthly" | "adhoc" | "event";
```

**`parseFrequencyToMask(freq)` → bitmask | null**
Tokenize day names, matching BOTH abbreviation and full name (`/\bmon(day)?s?\b/i`, `/\btue(s|sday)?s?\b/i`, `/\bwed(nesday)?s?\b/i`, `/\b(thu(rsday|rs|r)?|thr)s?\b/i`, `/\bfri(day)?s?\b/i`, `/\bsat(urday)?s?\b/i`, `/\bsun(day)?s?\b/i`). "Daily"/"every day" → `0b111111` (Mon–Sat). Nothing recognized → `null` (= always due).
*(Matching only abbreviations is a real bug I already hit: "Every Friday" fell through to null and became due every day.)*

**`parseFrequency(raw)` → `{ scheduleKind, weekdays, needsReview }`** — the single authority, applied in this exact order:

1. blank/empty → `adhoc`, `needsReview: true` (never blocks, never inflates the daily count)
2. matches `\badhoc\b` → `adhoc`
3. matches `as per … (call|scheduled|meeting)` / `as (and )?when` / `when it happens` → `event`
4. `monthly` / `every month` / `per month` → `monthly`, weekdays `0`
5. contains `\bor\b` **and** ≥2 day-bits → `weekly` with that mask (one slot, satisfiable on either day)
6. `weekly` / `every week` / `per week` → `weekly`, mask or `0` (any day)
7. `every <single weekday>` (exactly 1 bit, not "daily") → `weekly` with that bit
8. `daily` / `every day` → `scheduled`, `0b111111`
9. any explicit day-mask → `scheduled` with that mask
10. otherwise → `adhoc`, `needsReview: true`

**Due-ness helpers**

```ts
weekdayBit(date)                 // JS getDay(): Sun=0 → 6, else g-1
isDueOn(mask, date)              // null/0 mask = always due
scheduledDueOn(item, date)       // (item.scheduleKind ?? 'scheduled') === 'scheduled'
                                 // && !item.isParticipantList && isDueOn(item.weekdays, date)
slotKey(itemId, subjectId, date) // `${itemId}|${subjectId ?? ""}|${date}`
isoWeekKey(date)                 // "2026-W27", Thursday-anchored ISO-8601
yearMonthKey(date)               // "2026-07"
isoDate(date)                    // local YYYY-MM-DD, NEVER toISOString (UTC shift bug)
maskLabel(mask)                  // "Any" | "Daily" | "Mon · Wed · Sat"
dccStatusTone(status)            // {bg, fg, dot} — green Done / red Not done / amber Pending / grey NA
```

`scheduledDueOn` is the *only* predicate allowed to decide the daily due-set, the completion %, the streak, the ranking and any gate. Anywhere you're tempted to use `isDueOn` directly on the daily path, use `scheduledDueOn` instead.

---

## 4. Visibility & permissions

Compute a **scope** once per request from a single employee fetch — never per-row queries:

- super-admin → sees everyone
- otherwise → walk `employees.manager_id` downward from me (iterative stack, transitive reports), building `visibleIds` (always includes self); `isManager = visibleIds.size > 1`

Derived checks:

| helper | rule |
|---|---|
| `canView(ownerId)` | `visibleIds.has(ownerId)` |
| `canFill(ownerId)` | super-admin, or `ownerId === me.id` — you fill only your own |
| `canManageItems(ownerId)` | super-admin, or the owner is you or in your downline |
| `canReview(ownerId)` | super-admin, or (`ownerId !== me.id` and in your downline) — never review yourself |

Server-side: every write re-checks ownership from the DB (fetch the item's owner, compare) — never trust an id from the client. Rate-limit every write action. Validate every input with the repo's schema validator (zod or equivalent): uuid for ids, `/^\d{4}-\d{2}-\d{2}$/` for dates.

---

## 5. Screens

### 5.1 `/dcc` — the board (the main screen)

Server-loads, in parallel, for `ownerId` (default me; managers may pass `?emp=<id>` and it's honored only if in `visibleIds`): items, entries for the last ~48 days, the visible-people roster (managers only), reviews, clients, subjects, and item→subject links. Passes everything to one client component.

Layout, top to bottom:

1. **Four stat cards** — (a) an SVG progress ring with the day's compliance % + `done/due`; (b) *Filled* `filled/due` with a thin progress bar; (c) *Streak* with a flame icon; (d) *KPIs* — count due this day, caption `· N total`. Colour rule everywhere: **≥80 % green, ≥60 % amber, below red**.
2. **Toolbar** — person switcher (avatar + `<select>` of visible people, `(me)` suffix; navigates to `/dcc?emp=…`), a ‹ date › stepper (label "Today" or "Sat, 12 Jul"; next-day disabled beyond today; a "Back to Today" link when off today), then: link to Ranking, an optional **"Summarize My Day"** AI button, a **Show all (N) / Due Today Only** toggle, and **Add KPI** for managers.
3. **21-day trend strip** — one clickable bar per day, height scaled by that day's %, colour by the same thresholds, grey when nothing was due; the selected day gets an outline; clicking selects it.
4. **Manager review bar** — shown when the viewer can review (or a review exists): ✓ Approved / Needs Rework toggle buttons + a note field, the whole bar tinted by state. Read-only viewers just see the verdict text.
5. **A read-only banner** when viewing someone else's board.
6. **AI summary panel** when a summary has been generated (dismissible).
7. **Fill surface** — daily `scheduled` non-participant items grouped by `(section, client)`; each group is a card with a section heading (dot, section name, client-name chip when instanced, item count, an inline "Add" for managers). Empty state: a green check, "Nothing due today."

**Fill row** (one per item): code chip · title · frequency label · `target N unit` when set → segmented status buttons for the four statuses (clicking the active one clears it) · a number input when the item has a target/unit (commits on blur) · a note toggle opening a full-width note input (commits on blur) · a spinner while saving · an edit (pencil) button for managers. A Done row is tinted faint green with a green left rail.

**Participant-list card** (one per participant KPI due that day): collapsed header shows an icon, code, title and `N participants · X done · Y addressed · frequency`. Expanded: bulk **All Done / All NA / Clear**, then one row per participant with a Done/NA toggle pair, plus rename/remove for managers and an "Add participant…" input that creates-or-links by name.

**Trays** (collapsed by default, each with `done/total` in the header, hidden when empty): **This Week** (weekly), **This Month** (monthly), **When It Happens** (adhoc + event). Same fill rows inside. These never enter the daily count.

**KPI add/edit dialog** — rendered through a **portal to `document.body`** (an ancestor with a transform + overflow-hidden otherwise clips a fixed overlay). Fields: title\*, section (with a datalist of existing sections), code (auto-suggested: take the letter prefix used by that section's items and increment the max number, A6 → A7; stop auto-suggesting once the user types), frequency (free text — the parser handles it), target number, unit, client select, and a "Participant-list KPI" checkbox. Edit mode adds Delete (which **archives**, never hard-deletes). Reset the form every time the dialog opens or the previous values linger.

**Interaction model — non-negotiable:** every fill is *optimistic*. Patch a local map keyed `itemId|date` (simple) or `itemId|subjectId|date` (participant), mark that key busy, call the server action inside a transition, and on failure restore the previous value and fire an error toast. The whole board must feel instant and must never refetch the page on a keystroke.

Derived client-side:
- **day stats** — over items due that day: `done` = status Done, `filled` = any of status/value/note
- **streak** — walk back up to 60 days from today; on each day with ≥1 due item, every due item must be *filled*; break otherwise; days with nothing due are skipped, not counted
- **shown items** — due today (plus any with an existing entry that day) unless "Show all"

### 5.2 `/dcc/dashboard` — manager / admin roster

Managers only (a friendly "this is for managers and admins" card otherwise). Loads the visible people, their items, 28 days of entries and reviews.

- Four summary tiles: **Filled today %**, **Done today %**, **People on track**, **Need to fill**.
- **Team roster (today)** — a row per person: avatar, name (`(me)`), `N KPIs · M due today`, a flame + streak when >0, a small progress bar with `done/due`, a ✓ or ⚠ review badge, linking to `/dcc?emp=<id>`.
- **7-day leaders** — top 5 by 7-day done/due, medal-coloured rank number, % coloured by threshold.
- **Yet to complete today** — pills of people whose filled < due, linking to their board.

### 5.3 `/dcc/ranking` — company ranking

All active employees, 30-day window. Per person: `pct` = done/due over the window, `streak` = consecutive fully-*filled* days ending today, **`score = round(0.8 × pct + 0.2 × (min(streak,30)/30 × 100))`**. Skip anyone with no items or no due days. Sort by score, then pct, then streak. Render a gold/silver/bronze podium (rank 1 visually centered and scaled up) plus a numbered list from 4th down.

### 5.4 Optional gates (build them, ship them OFF behind env flags)

- **Fill gate** — a full-screen "Good morning, {name} — fill your DCC for {date}" wall that replaces the app until the day is filled. Target day = walk back from yesterday up to 7 days to the **first day the person actually punched in** (so absences, holidays and leave are skipped automatically); if that day has unfilled due items, gate on it. Never more than one day of backlog. The gate fills inline, with a sticky bottom bar showing "N left to fill" and a **Continue** button enabled only at 100 %; Continue does one `router.refresh()`. Entries saved from the gate pass a **`silent: true`** flag so each keystroke does *not* revalidate the page — a mid-fill re-render would re-run the gate and a transient hiccup would dismiss it early.
- **Manager review gate** — same shape: sign off each *direct* report's yesterday DCC (reports with no punch-in that day are exempt). Per-row Approve / Needs Rework, a **View** modal showing that person's items and answers for the day, and an **Approve All** bulk action. Load it with ~5 batched queries in parallel — never a per-report loop; an N+1 here made the page take seconds and exhausted the connection pool.
- Every gate is **day-scoped, kill-switchable by env, and FAIL-OPEN**: wrap each check in `.catch(() => null)` so a DB hiccup never locks anyone out of the app.
- Keep the gate chain in the layout and on the post-login landing page **in lock-step** — a gate that only lives in the layout can be slipped past on some routes.

### 5.5 Optional attendance coupling (only if this project has attendance)

Two independent, separately kill-switched rules. Build them only if asked; ship both OFF.

- **Punch-out block** — a person can't clock OUT until today's DCC is filled (`due.length === 0 || unfilled === 0`). Fail-open: any error lets the punch through.
- **"DCC not filled ⇒ ABSENT"** — a *pure, additive* post-processing layer that runs AFTER the day-grader, never inside it. Guard rails, because attendance is money-critical: it may only downgrade codes that mean physical presence on a regular working day (present / half-day / incomplete) to absent; it must never touch already-absent, leave, holiday, weekly-off or comp-off days; the loader ignores today and future dates (DCC is filled at end of day); and both the loader and the flag read are fail-open, so a hiccup can only ever leave attendance unchanged, never invent an absence. Keep the override a pure function of `(gradedResult, dccUnfilled, enabled)` so it's unit-testable beside the grader.

---

## 6. Server actions / endpoints

All of these: authenticate, rate-limit, validate, re-check ownership from the DB, return `{ok:true}` or `{ok:false, error}` (never throw to the UI), and revalidate the DCC path unless `silent`.

| action | purpose |
|---|---|
| `setDccEntry({itemId, date, status, value, note, subjectId?, silent?})` | upsert/clear one slot |
| `setParticipantEntries({itemId, date, status})` | set the same status for every active participant (null clears) |
| `createDccItem` / `updateDccItem` / `deleteDccItem` | KPI CRUD; both create and update run `parseFrequency` and persist `weekdays`, `scheduleKind`, `needsReview`; delete = archive |
| `addParticipant({itemId, name, kind?})` | upsert the subject by `(owner, lower(name))`, then link (re-linking un-archives) |
| `removeParticipant({itemId, subjectId})` | archive the link; keep history |
| `renameParticipant({subjectId, name, kind?})` | rename across all their KPIs |
| `createDccClient` / `updateDccClient` | section instancing |
| `setDccReview({ownerEmployeeId, date, status, note, silent?})` | upsert; empty status+note deletes the review |
| `getDccReviewDetail({ownerId, date})` | items due that day + their answers, for the review modal |
| `approveAllDccReviews({date})` | bulk-insert approvals for reviewable reports, `ON CONFLICT DO NOTHING`; deliberately does **not** revalidate |
| `summarizeDccDay({ownerId, date})` | build `- title: status (value) — note` lines from the day's filled entries and ask the LLM for a 2–3 sentence summary; return a clean error when no key is configured or nothing is filled |

Put the entry-write core (`writeDccEntry`, `writeParticipantEntries`) in its own module that takes an explicit `{id, email}` actor, so web actions and any mobile/JSON API share one implementation. That layer owns only the ownership check and the SQL; callers own auth, rate-limiting, validation and cache revalidation.

**Read helpers** (each retried with escalating timeouts if the repo has such a wrapper): `listOwnerItems`, `listOwnerEntries(ownerId, fromDate)`, `listDccPeople(visibleIds)`, `listItemsForOwners(ids)`, `listEntriesForOwners(ids, fromDate)`, `listReviewsForOwners(ids, fromDate)`, `listOwnerClients`, `listOwnerSubjects`, `listItemSubjectsForItems(itemIds)`. All roster reads are batched by id list — never one query per person.

**Optional JSON API** (if this project has a mobile client): `GET /api/dcc?date=` returning the day's grouped due-set, participant KPIs with rosters, and the three trays — derived with the *same* `scheduledDueOn` / `slotKey` helpers so web and mobile can't diverge — plus `POST /api/dcc/entry` and a participants endpoint.

**Optional cron** — an end-of-day (~19:30 local) authenticated job: for every active employee with due-today items not all filled, insert an in-app notification "Fill today's DCC — N KPIs still to fill" linking to `/dcc`. In-app only, no email.

---

## 7. Design

Follow this repo's existing tokens and component library. The reference module reads: green `#16a34a` / deep `#15803d` as the module accent, amber for the middle band, the app's red for failure; rounded cards (`22px` panels, `16px` stat cards) on a soft surface with inset-hairline + soft-drop shadows; a heavy display font at ~900 weight for numbers and headings, uppercase micro-labels with wide letter-spacing, tabular numerals for every figure; segmented controls with inset hairline borders; subtle staggered rise-in animation on cards. Fully responsive — the four-up stat grid collapses to two, and fill rows stack on mobile. Every icon-only control needs an `aria-label`; status buttons need `aria-pressed`.

---

## 8. Pitfalls to get right the first time

1. Only `scheduled`, non-participant items are "due". Weekly, monthly, adhoc, event and participant KPIs must never inflate the daily count, break a streak or block anything.
2. Unparseable frequency ⇒ `adhoc` + `needsReview`, never "due every day".
3. Local `isoDate`, never `toISOString().slice(0,10)` — the latter shifts the day for anyone east of UTC.
4. The entries unique index must include the COALESCE'd subject, and the upsert must target that same expression.
5. Optimistic UI with rollback on error; a fill must never trigger a full page revalidate mid-typing (that's what `silent` is for).
6. Batch every roster query; no per-person loops.
7. Fail-open on every gate and every scope load.
8. Archive, don't delete — history has to survive removing a KPI or a participant.
9. Render modals through a portal to `document.body`.
10. Reset dialog form state on open.

---

## 9. Build order

1. Migration + ORM schema (+ types).
2. `lib/dcc/util.ts` — the client-safe scheduling helpers, with **unit tests for `parseFrequency`** covering: "Daily", "Wed & Sat", "Every Sat", "Every Friday", "Mon or Thu", "Weekly", "Every Month", "Adhoc", "As per HH call scheduled", "", "asdf".
3. `lib/dcc/access.ts` (scope) and the read helpers.
4. The write core + server actions.
5. `/dcc` board.
6. `/dcc/dashboard` and `/dcc/ranking`.
7. Navigation entry (label "DCC", a gauge icon) wherever this app lists modules.
8. Optional: gates, cron reminder, JSON API, AI summary.

**Done means:** I can add a KPI with frequency "Wed & Sat", see it appear only on Wednesdays and Saturdays, mark it Done with a note, watch the ring, filled count and 21-day strip update instantly, see my streak climb, open a teammate's board read-only as their manager, approve their day, and find us both ranked on `/dcc/ranking`.

Start by telling me how you're mapping this onto the existing stack, then build it.
