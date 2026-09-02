# Altus WMS Overhaul — Master Plan

> **Status:** Canonical product + engineering spec. Synthesizes three founder review recordings (rec1–rec3) against live-codebase reconnaissance. Every item is tagged and grounded as **EXISTS (extend)**, **MISSING (build)**, or **BUG (fix)** with the likely file. Produced 2026-06-19 via a 9-agent analysis workflow.

---

## 1. Executive Summary

Altus already has a deep WMS: Tasks, Kanban, Projects, Weekly Goals (with weight/score/review/fill-gate fully built), Attendance (biometric + geofence), Incentive, Outstanding, Salary, dynamic Forms, Google Calendar/Sheets sync, and a nightly backup. The founder's review is **not a greenfield build** — it is a **convergence pass**: wire the existing pieces into one accountability loop, fix a handful of operational bugs, and run a batch of data/config operations.

The single most important realization from the recon: **the heavy Weekly Goals engine the founder is asking for largely already exists** (weight, weighted-average score, accept%, management notes, status, archive/approve, fill-gate, manager hierarchy, performance dashboard, goal↔task virtual linkage). The real work is (a) the **Daily Checklist** layer (genuinely missing), (b) the **twice-weekly forced-reporting gate** (currently a per-login gate — must become Mon/Thu hard + skippable-reminder), (c) **incentive entry UX** (Ad-hoc/Regular/One-time/Routine dropdown + catalog popup), (d) **nav reorg**, and (e) a long tail of bugs + data ops.

**The biggest strategic decision is non-technical:** kill WhatsApp as the accountability layer and move all daily commitments into the app.

---

## 2. Product Vision — Kill WhatsApp, Build One Loop

> *"मेरे को व्हाट्सएप्प बंद करना है, क्योंकि व्हाट्सएप्प पे कुछ रिकॉर्ड नहीं हो रहा है और कोई अकाउंटेबिलिटी नहीं आ रहा है।"*

WhatsApp is where daily plans, commitments, and "done/not-done" currently live — **unrecorded and unaccountable**. The vision is one closed loop inside the app where nothing falls through:

```
                 ┌────────────────────────────────────────────────────┐
                 │  WEEKLY GOALS  (the person's own objectives)        │
                 │  • ≥5 activities, weights total 100                 │
                 │  • optionally "Add to Task" → Goal-related Task     │
                 └───────────────┬────────────────────────────────────┘
                                 │  Move to Daily Checklist
                                 ▼
   STAND-ALONE TASKS ──────►  DAILY CHECKLIST  ◄──── Goal-related Tasks
   (catch-all, feedback,        "today I will do X"
    pointers, assignments)      • Kanban "due today" view
                                 │  end-of-day update (done / not done)
                                 ▼
                       overdue rolls forward → "Move to Today"
                                 │
                                 ▼
            ┌────────────────────────────────────────────────┐
            │  TWICE-WEEKLY FORCED REPORTING (Mon + Thu gate) │
            │  • can't enter the app without filling          │
            │  • %Done + explanation + proof                  │
            └───────────────┬────────────────────────────────┘
                            ▼
              MANAGER REVIEW (Accept% + Status + Mgmt Notes + Approve/Archive)
                            ▼
              WEIGHTED SCORE = Σ(effective% × weight) / Σ(weight)
                            ▼
              PERFORMANCE RANKING → "Performer of the Week"
```

Email stays as the **company record** (BCC for everyone); WhatsApp becomes an **additional alert channel** (late arrivals etc.) — *not* the accountability system.

---

## 3. Core Concepts & Distinctions

These distinctions are the spine of the whole spec. Getting them right prevents the contradictions the founder kept tripping over.

| Concept | Definition (founder's words) | Lives in | Key property |
|---|---|---|---|
| **Weekly Goal** | *"गोल इस something specific I am working on"* — the person's own weekly objectives | `weekly_goals` | Has a **Weight**; scored; reviewed by manager |
| **Goal-related Task** | A Weekly Goal the doer pushed into Tasks via "Add to Task" / "Move to Daily Checklist" | `tasks` (origin=`goal_related`) | Auto-priority **Important** (never Critical); week-time-centric, flexible due date; %/done **synced** with parent goal |
| **Stand-alone Task** | *"something I can give to 40 people"* — catch-all assignments, feedback, small pointers; explicitly **NOT goals** | `tasks` (origin=`standalone`) | Normal task lifecycle; created directly in Tasks |
| **Daily Checklist** | *"रोज commitment — आज के दिन में मैं ये काम करूँगा"* — today's committed items, both goal-related and stand-alone | virtual view over `tasks` due today + `daily_checklist` | Kanban "due today"; nightly done/not-done update; overdue → "Move to Today" |

| Axis | **Weight** | **Priority** |
|---|---|---|
| Where | Weekly Goals only | Tasks only |
| Means | Goal's share of the weekly score; **all weights sum to 100** | Eisenhower urgency/importance |
| Relationship | *"Priority and Weight are different. प्रायोरिटी निकाल दे इधर से."* — **Priority removed from Goals entirely** | Goal-derived tasks default to **Important** |

| Axis | **% Done** | **Acceptance %** |
|---|---|---|
| Who sets it | The **doer** (self-reported progress) | The **manager** at review |
| Field | `weekly_goals.pct_done` | `weekly_goals.accept_pct` |
| Use | What the doer claims | What the manager credits |
| Scoring | `effective% = COALESCE(accept_pct, pct_done)` — **manager's number wins once entered** | |

---

## 4. Feature-by-Feature Breakdown

### 4A. The Big Build — Goals / Tasks / Daily Checklist / Scoring / Gate / Incentive / Nav

#### Weekly Goals

| # | Item | Tag | Status | Ground (file) |
|---|---|---|---|---|
| B1 | Weight field after Goal; total must = 100 | [FEATURE] | **EXISTS** (column `weight` int 1–1000) — needs the **=100 validation + live UI** | `db/schema.ts:1750`; `lib/validators/weekly-goal.ts` |
| B2 | Remove Priority from Goals UI | [DECISION] | **EXISTS but wrong** — `priority` column still on goals & shown | `components/weekly-goals/goal-card.tsx`, `goal-quick-add.tsx` |
| B3 | Goal grid mirrors Task column order (Client, Subject, Goal, Weight, Due/Target, Incentive, Notes, actions) | [FEATURE] | **PARTLY EXISTS** — card layout; reorder + add Duplicate/Edit/Delete row actions | `goal-card.tsx`, `weekly-goals-board.tsx` |
| B4 | Review fields: %Done, Explanation, Proof/Evidence, Status | [FEATURE] | **EXISTS** (pct_done, explanation, link_url, status) — confirm Proof vs Evidence one/two fields | `goal-review-panel.tsx` |
| B5 | Manager review block: Accept%, Status, Management Notes + Archive/Approve/Delete/Accept | [FEATURE] | **EXISTS** (accept_pct, review_notes, status, approve/archive actions) | `goal-review-panel.tsx`, `actions.ts` |
| B6 | "Add to Task" — opt-in push of a goal into Tasks | [FEATURE] | **MISSING as real task** — today goals appear as *virtual* rows (`wg:` prefix), not stored tasks. Need a real `tasks` row with `goal_id`, `origin='goal_related'` | `lib/weekly-goals/as-task-row.ts` (virtual only) |
| B7 | Sync Done/% from Goal → linked Task | [FEATURE] | **MISSING** — no FK linkage today | new: `lib/weekly-goals/link-task.ts` |
| B8 | Goal-derived task auto-priority = Important | [DECISION] | **MISSING** | `lib/tasks/create-task.ts` |
| B9 | Performance/ranking dashboard + Performer of the Week | [FEATURE] | **EXISTS** (4-spec leaderboard, weighted score, performerOf) | `components/weekly-goals/weekly-goals-dashboard.tsx`; `lib/queries/weekly-goals.ts` |
| B10 | Filters on Weekly Goals | [FEATURE] | **PARTLY EXISTS** (employee/week) — add full filter bar parity | `weekly-goals-board.tsx` |
| B11 | Fix weight/goals review UI | [BUG] | **EXISTS but flagged broken** | `goal-review-panel.tsx`, `goal-card.tsx` |

#### Daily Checklist (the genuinely new module)

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B12 | "Move to Daily Checklist" / "Move to Daily Plan" button on a goal → pushes into the user's tasks/checklist | [FEATURE] | **MISSING** | new: `daily_checklist` table + action |
| B13 | Daily Checklist Kanban view of tasks **due today** | [FEATURE] | **PARTLY EXISTS** — Kanban exists at `/tasks/kanban`; need a "due today" scoping | `app/(app)/tasks/kanban` |
| B14 | Daily overdue screen each morning ("pending up to yesterday") | [FEATURE] | **MISSING** (My Day exists at `/tasks/agenda` but not the morning overdue gate) | `app/(app)/tasks/agenda` |
| B15 | "Move to Today" — roll all overdue items forward (re-date to today) | [FEATURE] | **MISSING** | new action; respects due-date immutability → write `revised_target_date` |
| B16 | Nightly end-of-day done/not-done update | [FEATURE] | **MISSING** | new |
| B17 | Daily Checklist nav item beside Weekly Goals | [FEATURE] | **MISSING** route `/daily-checklist` | `components/layout/main-nav.tsx` |

> **Note on B15 (Move to Today):** due dates are immutable after creation (memory: due-date/overdue rule, `lib/tasks/effective-due.ts`). "Move to Today" must write `revised_target_date = today`, **not** mutate `due_at`. Overdue is always computed from `COALESCE(revised, due_at)`.

#### Tasks — Goal-related vs Stand-alone

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B18 | Task `origin` = `goal_related` \| `standalone`; label "Goal related" / "Stand alone" | [FEATURE] | **MISSING** column | `db/schema.ts` tasks; `lib/weekly-goals/as-task-row.ts` |

#### Forced-Reporting Gate

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B19 | Twice-weekly **hard gate** (Mon + Thu) — can't enter app until filled | [FEATURE] | **EXISTS as per-login gate** — must become **day-of-week conditional** | `lib/weekly-goals/gate.ts`; `app/(app)/layout.tsx`; gate page `app/(gate)/weekly-goals/fill/` |
| B20 | Other days: show Weekly page first, then **skippable** reminder | [FEATURE] | **MISSING** (today it's always-hard) | same |
| B21 | Block empty/garbage fills (non-blank, min length) | [VALIDATION] | **PARTLY** ("filled" = `pct_updated_at NOT NULL`) — add content check | `gate.ts`, fill form |
| B22 | Min 5 activities to submit; no department exemption | [VALIDATION] | **MISSING** | `lib/validators/weekly-goal.ts`, import + create |

#### Incentive

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B23 | Incentive entry dropdown: **Ad-hoc** vs **Regular**; Regular → **One-time** vs **Routine** | [FEATURE] | **MISSING** structured entry (today goals have flat `incentive` bool + `incentive_amount`) | `db/schema.ts:1750`; incentive module |
| B24 | Ad-hoc / One-time → manual amount; Routine → fetch from catalog table | [FEATURE] | **MISSING** | new `incentive_type` + catalog lookup |
| B25 | Show incentive catalog ("3.Incentive Chart") on the dashboard, nicely formatted | [FEATURE] | **PARTLY** — incentive dashboard exists (memory: incentive-dashboard-spec, live sheet read) | `app/(app)/incentive`, `lib/google/read-sheet.ts` |
| B26 | Button opens catalog in a popup | [FEATURE] | **MISSING** | incentive page |

#### Navigation

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B27 | Primary nav = Dashboard, My Day, Tasks, Kanban, Projects, Weekly Goals, **Daily Checklist** | [FEATURE] | **PARTLY** — current top has Attendance (must move); Daily Checklist missing | `components/layout/main-nav.tsx` |
| B28 | Move Employees/Attendance/etc. into secondary (Carbide India-style nested/drill nav) | [FEATURE] | **PARTLY** — groups (People/Finance/Ecosystem dropdowns) exist; Attendance still top-level | `main-nav.tsx`, `main-nav-group.tsx` |

#### Global UI rules

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| B29 | Popup sizing: 80% of screen (50% if little content) | [DECISION] | **MISSING** as a rule | shared Dialog component |
| B30 | Kill WhatsApp as accountability; migrate daily-planning into app (Hitesh trains) | [DECISION] | process + B12–B17 build | — |

---

### 4B. Operational Bugs

| # | Item | Tag | Status | Ground (file) |
|---|---|---|---|---|
| G1 | **Calendar sync not firing for imported tasks** — form-created tasks sync, CSV/XLSX imports don't | [BUG] | **CONFIRMED BUG** | `app/(app)/tasks/import-actions.ts` `commitTaskImport()` — missing `afterResponse(() => reconcileTaskEvent(id))` after line 161 |
| G2 | Sir's task (due 19 Jun) not in his calendar | [BUG] | Likely **G1 + not connected / non-terminal scope** | `lib/google/sync.ts reconcileTaskEvent`; verify Sir's `google_refresh_token` |
| G3 | Google Sheets task sync: "No active tasks to sync" (12 expected) | [BUG] | **EXPLAINED** — message means 0 eligible (terminal status or none assigned). Imported tasks land as `dont_know` but are never reconciled (=G1). Sheet-read path (`read-sheet.ts`) is salary-only, **not** wired to tasks | `import-actions.ts`, `lib/google/read-sheet.ts` |
| G4 | **Check-in fails in background; works only in foreground; auth gets stuck** | [BUG] | **CONFIRMED** — WebAuthn challenge TTL 300s expires during slow GPS+biometric handoff; credential-manager dead → no GPS-only fallback | `lib/webauthn/attendance.ts:39` (maxAge 300); `components/attendance/punch-card.tsx`; `lib/geo.ts:22` (150m margin) |
| G5 | Workaround: do check-in on website not app | [DECISION] | process workaround until G4 fixed | — |
| G6 | "Task owned = 0" while 46 done — wrong data source (should count tasks the person *assigned* to others) | [BUG] | **CONFIRMED** metric bug | dashboard/profile task-owned query |
| G7 | Form placeholder/header text overlapping field text — gray it out | [BUG] | **CONFIRMED** | `components/forms/module-page.tsx` |
| G8 | 10-minute timeout too short; idle/session window | [BUG/CONFIG] | **CONFIG** — see C-section | `org_settings.idle_timeout_minutes` (web only; native has none) |

---

### 4C. Data Operations & Config

| # | Item | Tag | Status | Ground |
|---|---|---|---|---|
| D1 | Set idle/logout timeout to **15 min** | [CONFIG] | `idle_timeout_minutes` default 10 → 15 | `org_settings`; `/admin/settings`; `components/auth/idle-timer-client.tsx` |
| D2 | Rename **"admin" department → "Operations"** | [CONFIG] | data op | `departments` table; `/admin/departments` (name change propagates to legacy `employees.department`) |
| D3 | Create **"Manager" designation** (job title, not dept); apply to Ruchita | [CONFIG] | `designations` table | `/admin/designations` |
| D4 | Populate **reporting hierarchy** (`manager_id`) for all (see §9 roster) | [CONFIG] | exists; populate | `/admin/employees` editEmployee `managerId` |
| D5 | Rename **"cash" entity → "IGV"** everywhere + migrate data; **EXCLUDE Outstanding** ("cash" means something else there) | [CONFIG/DATA] | seed + `UPDATE` | `db/enums.ts:390,412` (SEED_ENTITIES, SEED_PAYMENT_MODES); see §10 caveat |
| D6 | **Remove "cash" from attendance entities** (keep Khushbu, Anvi, Palak, Barav) | [CONFIG] | data op | attendance entity list |
| D7 | Build/populate **Entity Master** | [CONFIG] | rosters exist (`paying_entities`, `outstanding_entities`); populate | `db/schema.ts:49,1357`; admin roster pages |
| D8 | **Delete stale tasks**: "Volunteer management system"; Sanket's incentive task | [DATA] | hard delete | tasks |
| D9 | **Reassign/credit**: Nia Reddy → Dhruv (delegate, then mark done **and approve**); "Stellar HTML website" → Dhruv; "Security PPT" → Pruthvisha; Mishthika mktg+sales → Rohan | [DATA] | task delegation/credit | tasks actions |
| D10 | **Delete employees**: Devraj, Kiran (uncontactable; reassign/handle his 2 tasks first), Sanket (no incentives) | [DATA] | GDPR erasure path | `deleteEmployee()` in `admin/employees/actions.ts` |
| D11 | **Capitalize "Import File"** (F) | [QUICK WIN] | label | search "Import file" (weekly-goals/tasks import UI) |
| D12 | **BCC for everyone** on outgoing email (company record) | [CONFIG] | confirm + demo | `lib/email/resend.ts` |
| D13 | Add **late-arrival auto-alerts on WhatsApp** in addition to email | [FEATURE] | email exists (`notifyOnInPunch`); add WhatsApp channel | `lib/attendance` notify; `employees.whatsappPhone` |
| D14 | Add **"you will be marked absent"** warning copy in daily-planning/check-in | [FEATURE] | copy | attendance/daily-plan UI |
| D15 | Add **Parvez's overtime** | [DATA] | record/enable | attendance |
| D16 | **Done-tasks dashboard**: done-on-time vs late; use **`done` status, not approved/archived** | [FEATURE] | new dashboard | tasks queries; status enum |
| D17 | Recycle bin → **hard delete** (already so); recovery via nightly 02:00 backup | [DECISION] | **EXISTS** (PR #21 nightly backup 02:00 IST) | satisfied by current backup |

---

## 5. Consolidated Data Model

All money in `numeric(14,2)` rupees (per salary-system memory). Additive migrations only (journal is stale — apply via idempotent SQL + tsx, per memory).

### 5.1 `weekly_goals` (extend — most already present)
```
-- ALREADY EXISTS (migration 0066): weight, target_date, notes, status,
--   accept_pct, review_notes, archived, reviewed_by_id, reviewed_at, approved_at
-- CHANGES:
priority            -- REMOVE from UI (column may stay for back-compat; default unused)
incentive_type      text   -- NEW: 'adhoc' | 'regular_onetime' | 'regular_routine' | null
incentive_amount    -- EXISTS (int) → consider numeric(14,2); set by type
incentive_catalog_id uuid  -- NEW FK → incentive_catalog (only when regular_routine)
linked_task_id      bigint -- NEW FK → tasks.id (set when "Add to Task"); enables %/done sync
-- management_notes already covered by review_notes
-- acceptance_pct already = accept_pct
```
Validation: `Σ(weight) = 100` per employee/week; `count(active goals) ≥ 5`.

### 5.2 `tasks` (extend)
```
origin   text  NOT NULL DEFAULT 'standalone'  -- 'standalone' | 'goal_related'
goal_id  uuid  NULL FK → weekly_goals(id)     -- back-link for goal-related tasks
-- priority: goal_related tasks forced to 'important' on create
```

### 5.3 `daily_checklist` (NEW)
```
id            uuid PK
employee_id   uuid FK → employees
plan_date     date            -- the day this item is committed to
task_id       bigint NULL FK → tasks(id)         -- if it came from a task
goal_id       uuid   NULL FK → weekly_goals(id)  -- if it came from a goal
title         text
status        task_status enum
done          boolean default false
moved_from_date date NULL     -- set when rolled forward via "Move to Today"
created_at / updated_at
UNIQUE (employee_id, plan_date, COALESCE(task_id,goal_id))
```
> **LOCKED 2026-06-19:** build the **FULL table** (not the lightweight virtual view) — the user wants persisted **nightly history** of what each person committed + did each day. Each night's list is a snapshot row-set per employee/day.

> **GATE — LOCKED 2026-06-19:** **BOTH** the Weekly Goals fill AND the Daily Checklist are **compulsory** — *no one can enter the app until both are filled.* Daily Checklist = a **daily** hard gate (commit today's items every login); Weekly Goals = the Mon/Thu reporting hard gate. There is **no skip** on the compulsory paths. The "show first, then skip" reminder only applies to *non-mandatory* surfacing, not to the daily commit.

### 5.4 `gate_log` (NEW — auditable forced-reporting)
```
id          uuid PK
employee_id uuid FK
gate_date   date
gate_kind   text          -- 'monday' | 'thursday'
filled_at   timestamptz NULL
skipped     boolean       -- true on non-mandatory reminder days
content_ok  boolean       -- passed garbage check
```
Lets management spot-check fills ("अपन चेक तो करेंगे ना पीछे से").

### 5.5 `incentive_catalog` (NEW — the "3.Incentive Chart")
```
id          uuid PK
name        text
description text
amount      numeric(14,2)
eligibility text
is_routine  boolean        -- routine vs one-time default
is_active   boolean
sort_order  int
```
Source of truth for **Routine** incentive amounts; rendered as the catalog popup.

### 5.6 `org_settings` (config)
```
idle_timeout_minutes  10 → 15
-- (webauthn challenge TTL is in code, not here — see G4)
```

---

## 6. Consolidated Validation Rules

| Rule | Spec | Enforcement |
|---|---|---|
| **Weight total** | `Σ(weight) === 100` per employee/week; **cannot exceed 100** | Hard block on submit + live running total in UI (default: hard block; see §11) |
| **Min activities** | **≥ 5** weekly goals to save; fewer → blocked, won't save | Hard block; **no department exemption** (video editors included) |
| **Goal → Task priority** | Goal-derived task auto-set **Important** (never Critical) | `create-task.ts` on `origin='goal_related'` |
| **Forced gate** | **Mon + Thu** = hard block (can't enter app until filled); **other days** = show Weekly first then **skippable** | day-of-week branch in `gate.ts` + `layout.tsx` |
| **Garbage fills** | Non-blank + min length (e.g. ≥ N chars) per fill; garbage *allowed to be typed* but empty blocked from passing | content check in fill action + `gate_log.content_ok` |
| **Delete** | **Permanent hard delete** — no recycle bin; recovery only via nightly 02:00 backup | existing behavior |
| **Overdue popup** | Notify/highlight at **80%** and **50%** thresholds (popup sizing rule); "Move to Today" clears overdue forward | Daily Checklist morning screen |
| **Popup size** | 80% of screen; 50% if little content | shared Dialog |
| **Incentive amount** | Ad-hoc & One-time → manual; Routine → from catalog (read-only) | incentive entry form |
| **Done-on-time metric** | Computed from **`done`** status only — **not** `approved`, **not** `archived` | D16 query |

---

## 7. Reconciling Contradictions

| Topic | Conflicting statements | **Resolution** |
|---|---|---|
| **Gate days** | rec2: first "every Wednesday & Saturday" → corrected "every Monday & Thursday" | **FINAL: Monday + Thursday.** Monday closes out the prior week (the "Saturday's update" owed); Thursday is mid-week. |
| **KPI** | rec2: defines KPI = recurs weekly → then "अभी के लिए KPI बाहर निकाल दे" | **Park KPI.** Hide the KPI toggle in UI now; keep the `kpi` column for later. Not built this round. |
| **Priority on Goals** | rec1: remove Priority from Goals; but goal-derived **task** auto-Important | **No contradiction:** Goal UI has *no* priority; the spawned *task* defaults to Important. |
| **Skip vs hard block** | rec2: "can't get in without filling" vs "let them skip so it reminds them" | **Day-conditional:** Mon/Thu = hard block; all other days = reminder-first + skip. |
| **Devraj** | rec3: "finish Devraj/Siddhesh setup" → later "delete Devraj" | **Delete Devraj.** Only Siddhesh's setup (Accounts, → Ruchita) is completed. |
| **Kiran tasks** | rec3: "no tasks" → "Kiran has two" | **Handle his 2 tasks (reassign), then remove Kiran** (uncontactable). |
| **Cash entity** | Remove from attendance; rename to IGV everywhere; but **keep in Outstanding** | **Rename to IGV in attendance/entity contexts; do NOT touch Outstanding** rows where "cash" = payment mode (legitimate meaning). See §10. |
| **Recurring goals / carry-over** | implied by KPI weekly recurrence | **Parked** with KPI. `carried_from_id` carry-over plumbing exists but no auto-recurrence. |
| **App vs browser** | native app lags | **Browser-first** for this whole overhaul; app fixed later. |

---

## 8. Phased Roadmap

Ordered by dependency + value. Each phase is independently shippable.

### Phase 0 — Quick Wins + Bug Fixes (ship today/this week)
**Effort: S.** Highest value-to-effort.
- D11 capitalize "Import File"; D1 idle timeout → 15; D2 rename admin→Operations; D3 Manager designation; D5/D6 cash→IGV + remove from attendance; D7 entity master; D8/D9/D10 task & employee data ops; D15 Parvez overtime; D12 verify BCC.
- **Bugs:** G1 import calendar sync (one-line fix), G6 task-owned metric, G7 form text overlap.
- **G4 check-in:** bump WebAuthn challenge TTL (300s → e.g. 900s) + add per-day GPS-only fallback knob; ship website-check-in guidance (G5).

### Phase 1 — Forced-Reporting Gate + Validation (the accountability core)
**Effort: M.** Depends on nothing new; converts the existing gate.
- B19 Mon/Thu hard gate + B20 skippable reminder other days; B21 garbage check; B22 min-5 + no exemption; B1 weight=100 hard validation + live total; B2 remove Priority from Goals UI; B11 fix review UI; `gate_log` table.

### Phase 2 — Goal ↔ Task Linkage + Task Origin
**Effort: M.** Depends on Phase 1's clean Goals model.
- B18 task `origin`/`goal_id`; B6 "Add to Task" creating a real `goal_related` task; B7 two-way %/done sync; B8 auto-Important. Distinguish Goal-related vs Stand-alone in lists/Kanban.

### Phase 3 — Daily Checklist (the new module)
**Effort: L.** Depends on Phase 2 (goal/task linkage feeds it).
- B12 Move to Daily Checklist/Plan; B13 Kanban due-today; B14 morning overdue screen; B15 Move to Today (via `revised_target_date`); B16 nightly done/not-done; B17 nav item; 80%/50% popups (B29).

### Phase 4 — Incentive Entry + Catalog
**Effort: M.**
- B23/B24 Ad-hoc/Regular/One-time/Routine dropdown; `incentive_catalog` table; B25/B26 catalog popup on dashboard.

### Phase 5 — Navigation Reorg + Performance Polish
**Effort: M.**
- B27 primary nav (Daily Checklist in, Attendance out); B28 secondary nested/drill nav (Carbide-style); B9/B10 dashboard + filter polish; D16 done-tasks dashboard.

### Phase 6 — WhatsApp Migration + Alerts
**Effort: M.** Process-heavy (Hitesh training).
- D13 WhatsApp late-alerts (alongside email); D14 absent warning; B30 fully retire WhatsApp accountability once Daily Checklist is adopted.

> **Parallelizable:** Phase 0 ships immediately and independently. Phases 1→2→3 are a dependency chain. Phases 4, 5, 6 can run alongside 2–3.

---

## 9. Reporting Hierarchy Roster (RESOLVED 2026-06-19)

> **LOCKED:** There are exactly **4 managers — Jeevan, Rohan, Ruchita, Rutvisha.** The recordings' "Pruthvisha"/"Manasvi" were mis-transcriptions of **Rutvisha** (Rutvisha Mehta). Apply via `editEmployee` `managerId`.

| Employee | Reports to | Confidence |
|---|---|---|
| Parvez | **Rutvisha** | locked |
| Dattaram | **Rutvisha** | locked |
| Himanshu | **Rutvisha** ("Manasvi" = Rutvisha) | locked |
| Pratik | Jeevan | high |
| Purvi | Jeevan (was Manan) | high |
| Siddhi | Jeevan | high |
| Hardik | Rohan | high |
| Pratham | Rohan | high |
| Mishthika | Rohan (reassign mktg+sales tasks) | high |
| Prakash | Ruchita | high |
| Siddhesh | Ruchita (dept: Accounts) | high |
| Accountant (name?) | Ruchita | needs name |
| Tanay | Rohan? | low — *flag* |

**The 4 managers themselves** report to Sir/Manan. Set them up first, then cascade their downlines.

---

## 10. The Cash → IGV Operation (RESOLVED 2026-06-19)

> **LOCKED — user override:** rename **EVERY** "Cash" → "IGV" across all rosters (paying entities, outstanding entities, AND outstanding payment modes) + migrate data. The earlier rec3 carve-out ("keep it in Outstanding") is **overridden** by the user's later instruction: *"just rename everything cash to IGV."*

- Idempotent `UPDATE ... SET name='IGV' WHERE lower(name)='cash'` (or 'rokda') across `paying_entities`, `outstanding_entities`, `outstanding_payment_modes`, and any seed/enum default (`db/enums.ts:390,412`).
- Remove "cash" from the **attendance** entity picker (keep Khushbu, Anvi, Palak, Barav).
- ⚠️ *Minor heads-up retained for the record:* in Outstanding, "Cash" was a **payment mode** — "IGV" reads oddly as a payment method. User accepted this; proceeding with full rename.
- Run local-first, verify row counts, then ship.

---

## 11. Open Questions / Decisions Needed

1. **Score basis:** Confirm weekly score uses **effective% = COALESCE(accept_pct, pct_done)** (manager's number wins). *(Recon implements this — confirm it's intended.)*
2. **Weight=100:** Hard-block submission, or warn + auto-normalize? *(Default assumed: hard block.)*
3. **Min-5 scope:** Counts all active (non-archived) goals for the week? Does carry-over count?
4. **Who sets weights** — the manager (initiator) assigning, or the doer? *(rec2 implies manager assigns; confirm.)*
5. **Daily Checklist storage:** lightweight virtual view (recommended) vs full `daily_checklist` table (needed only for nightly done/not-done history)?
6. **"Add to Task" trigger:** opt-in per goal (toggle) vs always-on? *(Founder: "if you want you can… do it" — assumed opt-in.)*
7. **Goal-task sync direction:** one-way (goal→task) or two-way (task done closes goal)?
8. **Proof vs Evidence:** one attachment field or two? *(Recon has one `link_url`.)*
9. **Gate periods:** what exactly does Monday's fill cover (prior week close-out) vs Thursday's (mid-week)?
10. **Garbage detection:** programmatic (min length / non-blank) vs manual back-end review only?
11. **Secondary-nav style:** multi-level dropdown vs sidebar-with-sub-nav (Carbide India pattern — confirm interaction).
12. **Reminder cadence** on non-Mon/Thu days: every login, or once/day?
13. **Cash→IGV target table:** `outstanding_entities`, `paying_entities`, or an attendance-specific entity list? **Must confirm before the migration.**
14. **Hierarchy conflicts:** Parvez/Dattaram → Pruthvisha (rec3) vs Ruchita (rec1); third manager identity; "the Accountant" name; Tanay's manager.
15. **Incentive dropdown shape:** is One-time/Routine a second dropdown shown only when Regular is chosen? How do Ad-hoc and One-time (both manual amount) differ semantically?
16. **80%/50% popup:** width, height, or both? Mobile too?

---

## 12. Out of Scope / Parked

- **KPI feature** (weekly auto-recurrence) — explicitly parked ("अभी के लिए KPI बाहर निकाल दे"). Keep `kpi` column; hide toggle.
- **Recurring goals / auto carry-over** — parked with KPI. `carried_from_id` plumbing stays dormant.
- **Native mobile app** — deprioritized; **browser-first**. App lag fixed later (note: native has **no idle timeout** — future hardening item).
- **Salary module build** — only a **logic-on-paper** design sketch this round (founder has doubts; wants the compute logic written out before building). Engine already partly exists (memory: attendance-salary-system Phase C); produce the doc, don't extend code yet.
- **Recycle bin** — permanently removed; nightly backup is the recovery path (no per-table delete-history build).

---

## 13. Quick Wins (ship today — 1-line config/label fixes)

| Win | Where | Action |
|---|---|---|
| "Import file" → **"Import File"** | weekly-goals/tasks import UI | capitalize F |
| Idle timeout **10 → 15 min** | `/admin/settings` → `org_settings.idle_timeout_minutes` | set 15 |
| **"admin" dept → "Operations"** | `/admin/departments` | rename (auto-propagates) |
| **"Manager" designation** | `/admin/designations` | create + apply to Ruchita |
| **Delete** "Volunteer management system" task; Sanket's incentive task | tasks | hard delete |
| **Calendar-sync import bug** | `tasks/import-actions.ts` after line 161 | add `for (const id of createdIds) afterResponse(() => reconcileTaskEvent(id));` + 2 imports |
| **Form text overlap** | `components/forms/module-page.tsx` | gray the placeholder/header text |
| **Parvez overtime** | attendance | add record |
| **Verify BCC** on outgoing email | `lib/email/resend.ts` | confirm + demo |

---

### Appendix — Key file index
- Weekly Goals engine: `lib/weekly-goals/{effective,gate,hierarchy,as-task-row}.ts`, `app/(app)/weekly-goals/{page,dashboard/page,actions}.tsx`, `components/weekly-goals/*`, `lib/queries/weekly-goals.ts`, `lib/validators/weekly-goal.ts`, schema `db/schema.ts:1750`, migrations `0065/0066`.
- Tasks/calendar/sheets: `lib/tasks/create-task.ts`, `app/(app)/tasks/{actions,import-actions}.ts`, `lib/google/{calendar,sync,read-sheet}.ts`.
- Attendance: `app/(app)/attendance/actions.ts`, `lib/attendance/record-punch.ts`, `lib/webauthn/attendance.ts`, `lib/geo.ts`, `components/attendance/punch-card.tsx`, `org_settings`.
- Entities/Outstanding: `db/enums.ts:387–422`, `db/schema.ts:49,1357`, `/admin/outstanding-entities`, `/admin/outstanding-payment-modes`.
- Nav/Forms/Admin: `components/layout/main-nav*.tsx`, `lib/forms/{modules,server}.ts`, `components/forms/module-page.tsx`, `app/(admin)/admin/{employees,departments,designations}/{page,actions}.tsx`.
