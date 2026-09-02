# Worker Types & Flexible Attendance/Pay — Design Spec

- **Date:** 2026-08-06
- **Owner:** Hetesh (with Sir's direction)
- **Status:** Draft for review
- **Policy anchor:** Attendance Policy `HR-POL-006` (`lib/hr/policies/content/attendance-policy.ts`)

---

## 1. Problem & Goals

The attendance + salary engine today assumes **one worker archetype**: a full-time employee on a fixed ~9-hour office day, paid **monthly CTC ÷ days-in-month × payable-days** (day-based only — there is no hourly path anywhere). Three real worker groups don't fit:

1. **Afternoon / college workers** — arrive ~3 PM after college. They must **check in on arrival and out on leaving**, and must **not be graded "late"** for a 3 PM start. Paid day-based like full-timers, but against a **shorter daily-hours target**.
2. **Part-time** — paid **₹3,500/month prorated by hours**, against a **27 hrs/week** target. Needs a real **hourly pay path**.
3. **Project-based / remote** — paid a **fixed fee / retainer** (attendance does *not* change pay). They join a **Google Meet + share screen**; the company wants **automatic proof of working time** — join/leave hours **and** screen-share evidence. This flow is kept **completely separate** from the existing WFH-badge punch.

**Goal:** introduce a first-class **worker type** that drives (a) how attendance is graded and (b) how pay is computed — cleanly extending the current engine without disturbing existing full-time payroll.

### Non-goals
- Not changing existing full-time grading/pay behaviour (must stay byte-for-byte identical).
- Not replacing the existing WFH "Remote / On-Site" punch (`punchRemote`, `workMode` badge). The new remote-session flow is additive and separate.
- Not billing project workers on hours (they're fixed-fee) — Meet/capture is for **accountability only**.

---

## 2. Current System (grounding) & Gaps

| Area | Today | File | Gap for this work |
|---|---|---|---|
| Per-day grading | `computeDayCode` grades in/out vs a schedule: worked ≥ `fullDayMinutes`(9h) → `P`(1.0); < full → `H/D`(0.5); < `halfDayMinutes`(5h)/no punch → `A` | `lib/attendance/status.ts:35` | ignores per-employee shift; full/half hours are **org-wide only** |
| "Late" | check-in after single `lateAfter` cutoff (org `10:50`) | `status.ts:82` | 3 PM arrival graded late unless per-employee `attLateAfter` set; grader **never reads** `attOfficialStart` |
| Schedule resolution | per-employee `lateAfter`/`earlyBefore` override org; **full/half hours NOT overridable per employee** | `attendance-status.ts:150`, `lib/attendance/schedule.ts` | need per-employee required-daily-hours |
| Worker/pay type | **none** — "intern" inferred from designation text | `lib/salary/pt-policy.ts:22` | need real `worker_type` + pay-type |
| Salary compute | day-based: `perDay = monthlyCtc/daysInMonth; gross = perDay × (payableDays − lateDeduction)` | `lib/salary/compute.ts:34` | **no hourly, no fixed-fee** path |
| Worked hours | computed per-day (`workedMinutes`) + per Mon–Sat week (54h waiver) | `status.ts:81`, `lib/attendance/summary.ts:52` | foundation exists; no per-employee weekly target (e.g. 27h) |
| WFH | `workMode` badge on a normal punch; grades like office | `app/(app)/attendance/actions.ts:679` | keep separate; new session flow is distinct |

**Policy alignment:** `HR-POL-006` already states full-time = **9 hrs/day**, **part-time = 5 hrs**, half-day `< 9h`, absent `< 5h`, and the **54 hrs/week** waiver. This design makes those thresholds **per-worker-type / per-employee** instead of one global rule.

---

## 3. Worker Type Model

### 3.1 New field
Add `worker_type` to `employees` (text column, TS union is source of truth per house norm in `db/enums.ts`):

```
workerType: "full_time" | "afternoon_shift" | "part_time" | "project_remote"
```
Default `"full_time"` (back-compat: every existing employee stays full-time, zero behaviour change).

### 3.2 Derived semantics (not stored — resolved in code)
`worker_type` maps to a **pay type** and a **grading mode**:

| worker_type | grading mode | pay type | Notes |
|---|---|---|---|
| `full_time` | `day` (9h full / 5h half, late after 10:50) | `monthly_ctc` | **unchanged** — exactly today's behaviour |
| `afternoon_shift` | `day`, **shift-aware** (start ~15:00, per-employee required daily hours) | `monthly_ctc` | day-based pay like full-time; only the *schedule* differs |
| `part_time` | `hours` (accumulate worked hours vs weekly target) | `hourly` | ₹3,500/mo prorated by hours |
| `project_remote` | `session` (remote work sessions; presence only) | `fixed_fee` | fixed retainer; sessions logged for accountability |

Resolver: `lib/attendance/worker-type.ts` → `payTypeFor(workerType)`, `gradingModeFor(workerType)`. Keeps the branch logic in one place; grader & salary read from it.

> **Why `afternoon_shift` is its own value (not just "full_time + shift"):** it's a distinct, filterable category for admins/reports, but it deliberately shares full-time's pay + grading code — only its **default schedule** differs. The salary engine only ever branches on the **3 pay types**, keeping payroll simple.

---

## 4. Schedule / Shift Model (fixes existing grader gaps)

Per-employee schedule already partly exists (`employees.attOfficialStart/attLateAfter/attOfficialEnd/attEarlyBefore/weeklyOff`, `db/schema.ts:196`). Changes:

1. **Add per-employee required-hours overrides** to `employees`:
   - `attFullDayMinutes` (int, nullable) — overrides org `attFullDayHours×60`
   - `attHalfDayMinutes` (int, nullable) — overrides org `attHalfDayHours×60`
2. **Extend `AttendanceSchedule`** (`lib/attendance/schedule.ts`) with `fullDayMinutes` / `halfDayMinutes`, resolved per-employee → org default (mirrors how `lateAfter`/`earlyBefore` already fall back).
3. **Wire it into the grader:** `employeeSchedule()` (`attendance-status.ts:153`) passes the resolved full/half minutes so `computeDayCode` uses **per-employee** thresholds (today it only overrides late/early).

**Afternoon workers** default to: `worker_type = afternoon_shift`, `attLateAfter = 15:30` (late only after 3:30 PM), `attFullDayMinutes = 5h` (5 completed hours = full day; less = half), `attEarlyBefore` set to their leave window. Result: a 3 PM arrival is on-time, and 5 completed hours = a full paid day. All four values remain **per-employee editable** in admin. **No grader rule is special-cased for "afternoon"** — it's pure schedule config, so it's flexible for any shift.

---

## 5. Grading Changes by Mode

### 5.1 `day` mode (full_time, afternoon_shift)
Unchanged algorithm; now honours per-employee shift + hours (Section 4). Full-time defaults preserve today's exact numbers.

### 5.2 `hours` mode (part_time)
Attendance is measured in **worked hours vs a weekly target** (default **27 h/week**, configurable per employee via a new `weeklyTargetMinutes`).
- Each punch-day still records `workedMinutes` (reuse existing grader output) but **payable is hours-based, not day-value-based**.
- Monthly summary for part-timers surfaces: `totalWorkedMinutes`, `weeklyTargetMinutes`, per-week attainment %, and `targetHoursForMonth`.
- No "late" concept for part-timers (flexible hours) — late/early marks suppressed.

### 5.3 `session` mode (project_remote)
Attendance = **remote work sessions** (Phase 2). Presence/hours are recorded for accountability but **do not feed salary** (fixed-fee). Not graded P/HD/A.

---

## 6. Pay Paths

Extend `SalaryInput` / `computeSalary` (`lib/salary/compute.ts`) to branch on **pay type**. Existing `monthly_ctc` path is untouched.

### 6.1 `monthly_ctc` (full_time, afternoon_shift) — unchanged
`perDay = monthlyCtc / daysInMonth; gross = perDay × (payableDays − lateDeductionDays)`.

### 6.2 `hourly` (part_time) — NEW
Config on the salary profile (Section 8): `monthlyPayAtTarget` (₹3,500), `weeklyTargetHours` (default **27**).
```
weeksInMonth    = daysInMonth / 7                             # e.g. 31→4.43, 30→4.29, 28→4.0
monthlyTargetHours = weeklyTargetHours × weeksInMonth          # 27 × weeks-in-month (variable)
hourlyRate      = monthlyPayAtTarget / monthlyTargetHours     # e.g. ₹3500 / (27×31/7≈119.6) ≈ ₹29.3/h
actualHours     = monthlyWorkedMinutes / 60
gross           = min(hourlyRate × actualHours, monthlyPayAtTarget)   # CAPPED at ₹3,500
net             = gross − pt(if applicable) − tds − advances + pendingBalanceIn
```
- **Monthly target = `27 × (daysInMonth / 7)`** — the weekly target prorated across the month's actual days (smooth, no 4-vs-5-week cliff). This is the concrete reading of "27 h × weeks in that month."
- **CAPPED at ₹3,500** (`capAtTarget = true`): hitting/exceeding the target pays exactly ₹3,500; only fewer hours reduce it.
- Monthly worked minutes come from the **`hours` grader summary** (`totalWorkedMinutes`).
- PT/TDS: part-timers are PT-exempt by default (they earn < the PT threshold); configurable.

### 6.3 `fixed_fee` (project_remote) — NEW
Config: `monthlyFee` (retainer). `gross = monthlyFee`, unaffected by attendance/sessions. `net = monthlyFee − tds − advances + pendingBalanceIn`. Work sessions are logged and shown, but never reduce the fee.

### 6.4 Assembly
`assembleMonthInputs` (`lib/salary/generate.ts:38`) resolves each employee's pay type from `worker_type` and routes to the right compute path. `salary_runs` / `salary_breakup` gain a `pay_type` column so the payslip renders the right basis (days vs hours vs fee).

---

## 7. Phase 2 — Remote Work Sessions (project_remote)

> Built after Phase 1. Delivers Meet-based hours + our own screen-share proof.

### 7.1 Research verdict (Google Meet API, 2026 — cited)
- **Join/leave hours: 🟢 supported.** Real-time via **Google Workspace Events API** (`google.workspace.meet.participant.v2.joined` / `.left`) → **Cloud Pub/Sub** → our webhook; reconciled after the call via **Meet REST API** `conferenceRecords…participantSessions` (`startTime`/`endTime`). Requirements: **Google Workspace**, our app **owns** the Meet space (create via API), workers **sign in with a known Google account**, records retained **~30 days** (must ingest promptly), scope `meetings.space.created`. Non-owners get no join/leave events.
- **Screen-share detection: 🔴 NOT supported.** No field/event in the Meet REST or Events API. The only Google path (Meet **Media API**) is Developer-Preview, needs a **bot that joins the call** + every participant enrolled — not production-viable.

**Conclusion:** use Meet **only** for authoritative join/leave hours; get **screen-share proof from our own capture layer**.

### 7.2 Our capture layer (the actual proof-of-work)
A dedicated **"Work Session"** page (separate from WFH punch):
- Worker clicks **Start** → browser `getDisplayMedia()` prompts them to share their screen **into our app**.
- We record **start time**, sample a **periodic screenshot** (every N min, e.g. 5) to Supabase storage (reuse the `attendance/remote/...` evidence-upload pattern from `punchRemote`), and detect **track-stop** (they stopped sharing) → auto-end.
- Worker clicks **Stop** (or track ends / tab closes) → **end time**; session hours = end − start (minus gaps).

### 7.3 Data model
New table `work_sessions`:
```
id, employeeId, startedAt, endedAt (nullable while open),
source: "meet" | "capture",
meetSpaceId, meetConferenceRecordId, meetParticipantId (nullable, source=meet),
totalMinutes (derived/reconciled), screenshotCount,
status: "open" | "closed" | "reconciled",
createdAt, updatedAt
```
- `meet` rows are written/updated by the Pub/Sub webhook + nightly reconcile job.
- `capture` rows are written by the Work Session page.
- Screenshots: `work_session_shots(id, sessionId, path, takenAt)` → Supabase `documents`/attendance bucket.

### 7.4 Surfaces
- **Worker:** Work Session page (Start/Stop, live timer, "screen sharing ✓" indicator).
- **Manager/admin:** session list per person — hours, screenshot timeline, Meet-vs-capture reconciliation, flag gaps.
- **Salary:** project_remote pay is the fixed fee; sessions shown as accountability, not pay inputs.

### 7.5 Infra / env (Phase 2 only)
Google Workspace project, service/owning account, OAuth (`meetings.space.created`), a Pub/Sub topic + push subscription → `POST /api/meet/events` webhook (verify Google JWT), env: `GOOGLE_MEET_SA_*`, `MEET_PUBSUB_*`. Feature-flagged `PROJECT_REMOTE_OFF` and off until keys land (mirrors existing dormant-integration pattern, e.g. DigiLocker).

---

## 8. Data Model / Migration Summary

**Migration A (Phase 1):**
- `employees.worker_type` text default `'full_time'`.
- `employees.att_full_day_minutes` int null, `employees.att_half_day_minutes` int null.
- `employees.weekly_target_minutes` int null (part-time 27 h default applied in code).
- `salary_profiles`: add `pay_type` text (derivable, stored for clarity), `monthly_pay_at_target` numeric null, `monthly_target_hours` numeric null, `cap_at_target` boolean default false, `monthly_fee` numeric null. (`annual_ctc` stays for CTC types.)
- `salary_runs` + `salary_breakup`: add `pay_type` text default `'monthly_ctc'` + nullable `worked_hours`, `hourly_rate`, `fee` columns for payslip rendering.

**Migration B (Phase 2):** `work_sessions`, `work_session_shots` tables.

Apply via idempotent SQL + one-off `tsx` per repo norm (drizzle journal is stale — see project memory).

---

## 9. UI Surfaces

- **Admin › Edit Employee** (`components/admin/edit-employee-dialog.tsx`): add **Worker Type** selector; when non-full-time, reveal the relevant fields (shift start/end + required hours for afternoon; weekly target + ₹/target for part-time; monthly fee for project). Reuse existing schedule inputs.
- **Attendance views:** grading already flows from the schedule; part-timers show **hours vs weekly target** instead of day P/HD/A; project workers show **sessions**. Worker-type badge in rosters.
- **Salary page:** payslip shows the correct basis (days / hours / fee); worker-type column/filter.
- **Manager:** Phase-2 work-session review.

---

## 10. Edge Cases & Policy Alignment

- **Existing full-timers:** default `full_time` → identical grading + pay (regression-guard with the existing `salary-compute.test.ts`).
- **Afternoon crossing office cutoffs:** driven purely by their per-employee `lateAfter`/`earlyBefore`; no special-casing.
- **Part-time > target hours:** default earns proportionally (config `capAtTarget`).
- **Part-time weekly vs monthly:** pay is computed **monthly** (actual month hours vs monthly target) for payroll simplicity; weekly 27 h is the display/target unit.
- **Project fixed-fee with zero sessions:** still paid the fee (fixed) — but flagged in manager review.
- **Worker-type change mid-month:** pay uses the type effective at generation time; note in payslip. (Open item 12.2.)
- **54 h waiver:** applies to `day`-mode workers (full/afternoon); part-time/project excluded (different basis).
- **PT/TDS:** part-time PT-exempt by default; project fees TDS per profile.

---

## 11. Phasing

- **Phase 1 (this build):** `worker_type` field + resolver; per-employee shift/hours grading (fix grader); `hourly` (part-time) + `fixed_fee` (project) pay paths; admin UI to set them; salary assembly + payslip basis; migration A; tests. **Delivers afternoon + part-time fully, and project fixed-fee pay. Zero external dependencies.**
- **Phase 2 (later):** remote work sessions — Google Meet Events/Pub/Sub hours + our `getDisplayMedia` capture + manager review; migration B; behind `PROJECT_REMOTE_OFF`.

---

## 12. Decisions (resolved in review)

1. **Part-time cap** — ✅ **Capped at ₹3,500** (`capAtTarget = true`). Extra hours do not add.
2. **Worker-type change mid-month** — pay by type-at-generation (proposed default). *Minor — revisit if it ever happens.*
3. **Monthly target hours** — ✅ **27 × (daysInMonth / 7)** — weekly 27 h prorated across the month's days.
4. **Afternoon rule** — ✅ **late after 3:30 PM**, **5 h = full day** (half if less); per-employee editable.
5. **Project TDS / retainer** — captured per employee in the profile; no global default (set per person). *Minor.*
