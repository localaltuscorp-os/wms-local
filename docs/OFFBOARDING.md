# Offboarding

How someone leaves Altus OS, and why it works the way it does.

Introduced 2026-09-05, migration `0212_employee_offboarding.sql`.

---

## The one rule

> **Identity is deleted. The record is retained.**

Firebase holds the *identity* — destroy it and they can never sign in again.
Postgres holds the *record* — it stays, permanently, as a former employee.

Exactly two things are destroyed when someone is offboarded:

1. **The Firebase user.** Irreversible, by design.
2. **The avatar image** — storage objects and both columns. A face is the most
   identifying thing on the record and has no statutory retention basis.

Everything else is kept: tasks, audit events, attendance, payroll history, and
the employee row itself.

## Why the old delete had to go

`employee_events.actor_id`, `task_events.actor_id`, `settings_events.actor_id`,
`document_events.actor_id` and `outstanding_followups.actor_id` are all
`ON DELETE RESTRICT`. Postgres refuses to drop an employee while any of those
reference them.

The old `deleteEmployee` worked around that by deleting the audit trail first.
A single click destroyed **112 tasks and 522 audit events belonging to the
organisation** in order to remove one login — including tasks other employees
had raised, which those employees then lost.

The tasks are the company's. The audit trail is the company's. Only the login
belongs to the person leaving.

`deleteEmployee` still exists in `actions.ts` but is unreachable from the UI.
Treat it as deprecated; do not wire it to anything.

---

## The flow

`components/admin/archive-employee-dialog.tsx` — three steps, in this order
because the admin should describe the departure *before* being shown the
irreversible button.

**Step 1 — why they are leaving.** Exit reason (closed taxonomy), rehire
eligibility, DOJ (pre-filled, editable), resignation date, last working day,
notice period, successor, legal hold.

**Step 2 — handover and exit interview.** Checklist and optional interview.
Unticked boxes never block the archive; they are recorded as outstanding so the
gaps stay visible.

**Step 3 — review.** A plain-language panel of what is destroyed against what
is kept, a summary of step 1, then the typed-email confirmation.

Server side: `app/(admin)/admin/employees/offboarding-actions.ts`.

### Ordering that matters

Firebase deletion runs **after** the transaction commits, not inside it.
Firebase is not transactional — inside, a later rollback would leave the login
destroyed while the row still claimed the person was employed, which is
unrecoverable and silent. Running it after means the worst case is an orphaned
Firebase user, which is fixable by hand and is recorded in
`employee_exits.firebase_deleted` / `firebase_error`.

---

## Data model

### `employees`, new columns

| Column | Meaning |
|---|---|
| `employment_status` | `active` / `former` / `anonymised` |
| `last_working_day` | Date |
| `legal_hold` | Exempt from every retention timer |
| `legal_hold_reason` | Required when the hold is set |
| `anonymised_at` | Non-null ⇒ name/email are placeholders |

`employment_status` is a **second axis**, orthogonal to `is_active`:

- `is_active` — can they sign in right now
- `employment_status` — do they still work here

Both are needed. A suspended employee is inactive but current; a former employee
must stay former even if their login is re-enabled by mistake.

> ⚠️ **Use `isCurrentStaff`, not `isStaffAccount`, for any roster or picker.**
> Former employees keep their row now, so `isStaffAccount` alone will list
> people who have left. `isStaffAccount` is still correct for historical views
> that need to resolve an old actor's name.

### `employee_exits`

One row per departure. Separate from `employees` because it is written once,
read rarely, and the exit interview has different access rules from the rest of
the row.

Holds: reason + free text, rehire eligibility + note, DOJ / resignation / last
working day, notice fields, successor, reassignment counts, handover checklist,
exit interview, Firebase and avatar outcomes, who archived it and when.

### `data_retention_policies`

The retention schedule as data, not constants — the periods are set by law, and
an auditor asking "what is your retention policy" needs an answer that is not a
code review.

`purge_enabled` is **false** for every class except `work_session_shots`.
A retention table that starts deleting the moment it is created is a data-loss
incident wearing a policy costume.

---

## What moves, and what never moves

`lib/employees/offboarding.ts`.

**Moves to the successor:**

- `tasks.doer_id` on **non-terminal** tasks — a live obligation must land on
  somebody or it stops being anyone's job
- `employees.manager_id` for their direct reports — people cannot report to a
  former employee

**Cleared, not moved:**

- `employees.ooo_delegate_id` pointing at them. Delegation is a personal choice
  by the person who set it; repointing it at a stranger would route someone's
  out-of-office work to a person they never nominated.

**Never touched:**

- `tasks.initiator_id`, `tasks.created_by_id` — historical facts. Who asked for
  the work and who typed it in *happened*. Rewriting them forges the record.
- **Completed tasks.** A done task carries the name of whoever did it. Moving
  `doer_id` there would claim the successor did work they never did.
- **Goals.** A goal is a personal objective with a personal score. Handing it to
  someone else corrupts both their appraisal and the leaver's history.

With no successor named, nothing moves and the counts are recorded as
`unassignedTasks` / `orphanedReports` — an exit that stranded three live tasks
says so on the record rather than reporting a tidy zero.

---

## Retention, and the 60-day window

**The 60-day activity window is a VIEW, not a deletion.** It is a query filter
in `lib/queries/offboarding.ts` (`ACTIVITY_WINDOW_DAYS`) and exists nowhere
else. Nothing purges audit rows on exit.

Two reasons it must stay that way:

1. **Misconduct is routinely discovered months after someone leaves.** An
   exit-time purge of audit history is exactly the capability an insider would
   want. This company lost data to that pattern on 2026-09-04.
2. `audit_events` carries a 7-year basis in `data_retention_policies`. A 60-day
   delete would contradict the policy the same system publishes.

A super-admin can lift the window ("Show full history"). The rows are always
there.

### ⚠️ Attendance is not a 60-day record

Attendance is the evidentiary basis for wages paid, and in an Indian wage
dispute the burden of proof sits with the **employer**:

| Record | Period | Basis |
|---|---|---|
| Attendance / muster registers | 3 years | Maharashtra Shops & Establishments Act; Payment of Wages Act |
| PF & ESI contributions | 8 years | EPF & ESI regulations |
| Payroll / income tax | 6 years | Income Tax Act, from end of assessment year |
| Audit events | 7 years | Internal control / investigation |

Show 60 days in the UI. Keep the rows for the statutory period. India's DPDP
Act 2023 explicitly permits retention for legal compliance, so this does not
conflict with data-protection duties.

*Not legal advice — have counsel confirm the exact periods before arming any
purge.*

### Anonymisation

`/api/cron/retention-anonymise`, weekly, **disarmed**.

When retention finally expires, the row is **pseudonymised, not deleted** —
`Former Employee A3F9`, `anonymised+…@invalid.local`, contact fields nulled.
Deleting the row is impossible for the same `ON DELETE RESTRICT` reason the old
hard-delete ran into, and would knock holes in headcount history and every join
that resolves an actor name.

Three independent brakes, all of which must be released:

1. `data_retention_policies.purge_enabled` for `employee_pii` — **off**
2. `employees.legal_hold` — never touched, whatever the clock says
3. The retention period itself, measured from `archived_at`

> **Do not arm `employee_pii` without legal sign-off.**

### Legal hold

One boolean that exempts a person from every retention timer and from
anonymisation. Set it at exit, or later via `setLegalHold` (super-admin only —
*clearing* a hold re-arms every timer against that person).

Use it when someone leaves under investigation. Destroying data on a person you
are investigating is spoliation, and no automated timer may be allowed to do it.

---

## Where things live

| Path | What |
|---|---|
| `db/migrations/0212_employee_offboarding.sql` | Schema. Additive, idempotent. |
| `app/(admin)/admin/employees/offboarding-actions.ts` | `archiveEmployee`, `setLegalHold`, `getFormerActivity` |
| `lib/employees/offboarding.ts` | Reassignment, avatar purge, anonymised identity |
| `lib/validators/offboarding.ts` | Zod contract |
| `lib/queries/offboarding.ts` | Former-employee reads, activity window, exit register |
| `components/admin/archive-employee-dialog.tsx` | The 3-step wizard |
| `components/admin/previous-employees.tsx` | Previous Employees table + View more |
| `app/api/admin/exit-register/route.ts` | CSV export |
| `app/api/cron/retention-anonymise/route.ts` | Anonymisation cron |

## Gaps

- **The `former` avatar treatment is not wired up.** `Avatar` accepts the prop;
  ~50 components that render employee names do not pass it. See HANDOFF Known
  Issue 9.
- **Goals are not surfaced at exit.** They are deliberately not moved, but the
  admin is not shown how many are being left behind.
- **`delete_guard`** — an undocumented DB trigger from the September incident.
  The new flow never trips it, but its definition should be captured. See
  HANDOFF Known Issue 10.
