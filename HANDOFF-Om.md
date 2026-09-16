# HANDOFF — `Om` branch

**Updated:** 2026-09-11
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Om`
**Audience:** whoever picks this up, and whoever runs the SQL in Supabase.

> **Latest (15 September 2026): the Incentive module was reworked.** Read
> [Incentive Module – Latest Changes](#incentive-module--latest-changes) at the
> end of this file, and run [`incentive-production.sql`](./incentive-production.sql)
> before deploying it. The sections directly below are the earlier device and
> migration work from 11 September, unchanged.

Three streams of work landed today. **None of the SQL has been run yet** — the
code assumes tables and columns that do not exist in Supabase, so read §1 before
deploying anything.

---

## 1. Run this SQL in Supabase

### 1a. One file, everything

**`db/RUN-IN-SUPABASE-0216-0224.sql`** — every pending migration, `0216`
through `0224`, in order.

Supabase Dashboard → SQL Editor → New query → paste the file → Run. Or:

```bash
psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0216-0224.sql
```

Generated verbatim from `db/migrations/*.sql`: all 254 additive SQL lines are
byte-identical to the repo, checked line by line rather than retyped.

It is in **two parts**, and the second one deletes data.

### 1b. Part 1 — additive (`0216`–`0222`, `0224`)

No `DROP TABLE`, no `TRUNCATE`, no `DELETE`. Every statement idempotent, so a
second run changes nothing. Two sections write rows — `0217` (master data) and
`0220` (backfill) — both flagged inline, both safe to re-run.

**If you do not want the device wipe, stop at the line marked `END OF PART 1`.**

### 1c. Part 2 — `0223`, which clears `mobile_devices`

This wipe is *intended*: it is the point of first-login registration. But it
destroys device history, so in this file it is made safe in two ways the raw
migration does not provide:

- it copies `mobile_devices` → `mobile_devices_pre_0223` **first, in the same
  transaction**, so the history stays recoverable; and
- it does **nothing at all** if that backup table already exists — so running
  the file twice cannot wipe the devices people have just registered.

**Why wipe at all:** `enroll()` has written a row on first sight of any browser
since the device gate shipped, and auto-adopt marked them `approved` with no
human involved. So "approved" currently means "this browser turned up once", not
"this person registered this machine" — plus the duplicates the device audit
documents. Carrying those forward marks the whole roster already-registered,
which defeats first-login registration entirely.

**Nobody is locked out by it.** Sign-in stopped refusing on device status, so the
next login enrols a fresh row into a now-empty slot. Consent records survive
(`device_consent_events.device_row_id` is `ON DELETE SET NULL`, and each row also
carries the device id as text).

To run `0223` through the migration runner instead of this file:

```bash
pnpm db:migrate -- --allow-destructive=0223_clear_registered_devices.sql
```

Note the raw migration is a bare `DELETE` with **no** backup and **no** re-run
guard — those exist only in the sheet.

### 1c. Do NOT use `npm run db:migrate` for this

The drizzle journal is stale at `0019`, so it would also apply two dozen
unrelated pending migrations. Use the file in §1a.

---

## 2. The migrations, by file

| # | File | What it does |
|---|------|--------------|
| 0216 | `db/migrations/0216_module_submission_attachments.sql` | `module_submission_attachments` — receipts become files the firm holds, not Drive links |
| 0217 | `db/migrations/0217_masters_payment_modes_and_products.sql` | Master data: IGV→IJV, 15 payment modes, 11 products, 7 options. **Review the values** |
| 0218 | `db/migrations/0218_delegated_access.sql` | `delegated_access_grants` + `_events`. No credential stored |
| 0219 | `db/migrations/0219_permission_matrix.sql` | `module_permissions` + `_events`. Defaults TRUE, grants nothing by itself |
| 0220 | `db/migrations/0220_manager_hierarchy_history.sql` | `employee_manager_history`, backfilled one row per employee |
| 0221 | `db/migrations/0221_holiday_note.sql` | Optional note on a holiday + who last changed it |
| 0222 | `db/migrations/0222_device_registration_consent.sql` | Registration columns on `mobile_devices` + `device_consent_events` |
| 0223 | `db/migrations/0223_clear_registered_devices.sql` | **DESTRUCTIVE** — clears `mobile_devices`. See §1b |
| 0224 | `db/migrations/0224_device_name_replaces_bios_serial.sql` | Renames the registration field to `device_name`. **Must run after 0222** |

---

## 3. First-login device registration

An employee signing in from an unregistered machine meets a **blocking modal**:
no close button, no Escape, no click-outside. It collects a **device name** and a
**consent tick**, then lets them through.

### Why device name and not BIOS serial

The first cut asked for the BIOS serial with `wmic bios get serialnumber` as the
primary instruction. **`wmic.exe` does not exist on Windows 11 build 26100+** —
verified absent on build 26200. The PowerShell fallback works, but it was printed
second and most people stop at the first line that fails. And even working, it is
a command: most of this roster is non-technical, so that is a support ticket per
employee.

The device name is visible with no command at all — Settings › System › About, or
Win+Pause, first row.

**What that trades away, honestly:** a BIOS serial is unique and unchangeable; a
device name is neither. Anyone can rename their PC, and corporately imaged
machines routinely share one. The unique index refuses the second person carrying
a duplicate, which is why the collision message names the remedy rather than just
saying no.

### Who sees it

| Situation | Modal? |
|---|---|
| First login, unregistered device | **Yes** |
| Device already registered (`registered_at` set) | No |
| Device-exempt actor (Manan, Rohan) | No |
| Already has an approved device of that kind on another machine | No — the gate handles it |
| Revoked device | No — a form cannot lift a revocation |
| `DEVICE_ACCESS_ENFORCEMENT` not `"on"` | No — **this is the default since 2026-09-15, so the modal is off everywhere** |
| Native Android app | No — keystore flow untouched |

iPhone/iPad/Safari land in the **phone** slot and are never asked for a name.

---

## 4. Sign-in no longer refuses on device status

This was the bug that made registration impossible. `adoptDeviceOnLogin` used to
answer `pending`/`revoked` **before the session cookie was minted**, so a new
employee was stopped at the login form and could never reach the modal that would
have registered them. Registered to get in, in to register.

All three refusal points are gone (the status check, and two in `enroll()`).

**The restriction moved, it did not disappear.** Every request still passes
`resolveDeviceContext` via `requireUser()`, so a pending or revoked device gets
the same refusal — now as `/device-blocked`, a page that names the reason and the
remedy, instead of a dead end on the sign-in screen. Admins still get the
"device pending" alert.

---

## 5. The approval bug (fixed)

`setDeviceStatus()` counted approved devices across **all kinds** and compared
that against a **per-kind** cap of 1. An employee holding an approved phone could
not have a pending laptop approved — the admin saw *"already has an approved
laptop"* while the laptop slot sat empty. The documented workaround (revoke the
phone, approve the laptop, re-register the phone) is exactly the revoke/approve
loop this was reported as.

The database was never wrong: `mobile_devices_employee_kind_approved_uq` and
`mobile_devices_cap_approved_trg` have been scoped to `(employee_id, kind)` since
0215. Only the count disagreed. One `eq(mobileDevices.kind, row.kind)` fixes it.

---

## 6. Exemptions

- **`device.exempt_from_restriction`** — Manan and (new today, from main) Rohan.
  Signs in from any machine, never meets the registration modal.
- **`daily_start.exempt`** — Manan. Now clears the **whole** post-login chain:
  plan, own-DCC, manager-assign, DCC-review **and the ECOS broadcast lock**. It
  was honoured by two gates and not the other four, which is not an exemption.
  Applied once in `app/(app)/layout.tsx` where the chain runs, rather than in
  four separate gate modules.

---

## 7. Consent audit

`device_consent_events`, append-only. Stores employee, device row id + text
device id, timestamp, version (`device-registration-v1`), type, actor.

Consent is checked **before** anything else is written, so a consent record can
never exist for a registration that did not happen. Bump the version string to
require re-consent — no schema change, no backfill.

**Not stored:** user agent, IP, screen metrics, fonts, timezone, or any other
fingerprint. A test asserts the row's exact key set, so adding one fails the build.

---

## 8. Files, for handing to a terminal Claude

```
db/RUN-IN-SUPABASE-0216-0224.sql            ← paste this into Supabase
db/migrations/0222_device_registration_consent.sql
db/migrations/0223_clear_registered_devices.sql   ← destructive, read first
db/migrations/0224_device_name_replaces_bios_serial.sql
lib/security/device-registration.ts          ← decides + writes the registration
lib/security/device-registration-rules.ts    ← pure validation, no DB
lib/security/device-registration-actions.ts  ← the server action
components/security/device-registration-modal.tsx
components/security/device-registration-gate.tsx
lib/security/device-access.ts                ← sign-in + the gate
lib/attendance/mobile-devices.ts             ← the per-kind cap fix
DEVICE_LOCK_AUDIT.md                         ← the read-only audit behind all of this
```

---

## 9. Tests

```bash
npx vitest run tests/unit/device-registration-rules.test.ts \
  tests/unit/device-registration-flow.test.ts \
  tests/unit/device-approval-per-kind.test.ts \
  tests/unit/device-exemption-login.test.ts \
  tests/unit/daily-start-exemption.test.ts \
  tests/unit/adhoc-holiday.test.ts
```

122 passing. The per-kind fix was verified by reverting it: 3 tests fail against
the broken code, so the test catches the bug rather than merely describing it.

**Pre-existing failures, not from this work:** `done-on-time`, `task-actions`,
`task-stat-counts`, `global-search-provider`, `bulk-entry-keeps-drafts`,
`daily-salary-report-render`. Confirmed by running them on a clean baseline with
none of this code present. `device-exemption-login` passes 17/17 alone and fails
only under parallel load — suite pollution.

---

## 10. Known limitations

1. **The device name is typed in by hand.** Nothing verifies the machine reports
   it. It stops honest double-registration, not a determined employee.
2. **Device names are not guaranteed unique.** Imaged fleets share them; anyone
   can rename their PC. The unique index refuses the second person, and the
   message tells them who to contact.
3. **No fingerprinting, no WebAuthn, no background agent.** Deliberately out of
   scope.
4. **Duplicate migration prefixes exist further back** — three `0212_`, two
   `0213_`, two `0214_`. Ordering is deterministic (alphabetical within a prefix)
   and none depend on each other, but worth renumbering before the next batch.

---
---

# Incentive Module – Latest Changes

**Date:** 15 September 2026 · **Branch:** `Om`
**Status:** built and tested on this computer. **Not yet saved to GitHub** and
**not yet applied to the production database.**

- Every change, one line each, in plain English: [`incentive-changes.md`](./incentive-changes.md) (57 changes)
- The production database update: [`incentive-production.sql`](./incentive-production.sql) — see
  [Production Database Update](#production-database-update) below

Everything here was checked against the actual system, not written from memory
of the conversation.

---

## 1. What was changed?

Five parts of the Incentive module were reworked:

1. **The New Incentive Request form** — stricter checks, new fields, a new request type, and splitting an incentive between people.
2. **Approval, rejection and resubmission** — Manan Vasa alone decides, with more outcomes, required reasons, and a full history.
3. **The Incentive Dashboard** — periods, status totals, % of CTC, grades, ranking and target warnings.
4. **Notifications and emails** — 13 kinds of notice and 12 emails.
5. **The Incentive Table** — every change is now permanently recorded.

**How incentive amounts are worked out and paid did not change.**

---

## 2. What does the user see now?

**Employees**
- A two-column request form that checks mobile numbers, emails, links and dates as you type, and lists anything still to fix.
- Every request asks for an Incentive Date; every type has a Notes box you can speak into.
- The option to split an incentive with up to 4 colleagues.
- On a Not Approved or Revise request: the reason, when it was decided, and a **Justify & Resubmit** button.
- A history on each request showing every version and decision.
- A dashboard of their own incentive figures, % of CTC, grade, rank and targets, with a warning when a target is missing.
- Notices in the Inbox, push notifications and emails about their requests and about incentives they are eligible for.

**Manan Vasa**
- A **"Needs your review"** list first on the Requests tab (Pending Approval, Due and Not Due).
- A decision panel on each request, with a confirmation step naming the new status.
- A notice and an email whenever someone resubmits.
- The whole company on the dashboard.

**Other admins**
- Every request, but **read-only** — they can no longer approve or reject.
- The whole company on the dashboard.

**Managers and team leads**
- Themselves plus everyone who reports to them, directly or further down, on the dashboard and the Targets tab.

**Accounts**
- No change to how they work. Paying an incentive now also tells the employee.

---

## 3. What new Incentive functionality was added?

- **Checks on the form:** 10-digit mobile numbers starting 6–9, real email addresses, links starting http:// or https://, real dates. Every check is repeated by the system when the request arrives, including from the mobile app, so it cannot be skipped.
- **"BSS Conversion" is now "Conversion"**, and it needs a **Product** picked from Admin → Products.
- **Leads / Referrals** — a new request type (participant name, workshop, batch number, optional link, notes).
- **Video Testimonial** — a new Client Happiness choice.
- **Client permission to publish** (Yes / No) — required for a Case Study or Video Testimonial.
- **Incentive Date** on every request.
- **Notes with voice typing** on every request type.
- **Split Incentive** — 2 to 5 people, the filer among them, current employees only, totalling exactly 100%, equal by default.
- **Employees can fill in their own missing target** for this month or next month from the dashboard (changing an existing target is still an admin job).

---

## 4. What approval / rejection behaviour changed?

- **Only Manan Vasa decides.** Before this, any admin could approve or reject.
- **Most incentives:** Approved · Not Approved · Due · Not Due · Reversed.
- **Published content** (Client Happiness for a LinkedIn Testimonial, Interview or Case Study): Publish · Revise · Not Approved. Publish counts as Approved.
- **A reason is required** for Not Approved and Reversed; **a note is required** for Revise.
- **Only sensible next steps are offered:** Approved can only be Reversed; Reversed is final; Due and Not Due can still be decided; Not Approved and Revise wait for the employee.
- **Justify & Resubmit:** the employee corrects their answers (not the type), writes a justification, and the request returns to Manan as Pending Approval.
- **History:** every version and every decision is kept with date, time, who and why, and it cannot be edited — not even directly in the database.
- **Status names:** Pending → **Pending Approval**, Rejected → **Not Approved**; new **Due, Not Due, Reversed, Revision Requested**.
- **Two people at once:** the second is asked to reload instead of overwriting.

---

## 5. What dashboard / reporting changed?

- A new **Incentive Dashboard** opens first on the Incentive page.
- **Periods:** Current Month, Specific Month, Last 3 Months, Last 6 Months, Year to Date (January onwards).
- **Six summary cards:** Not Approved, Approved, Due, Not Due, Paid, Unpaid — click one to see and search the records behind it.
- **Your performance:** incentive earned, % of CTC, grade, rank.
- **Employee Grade Report:** per person — earned, CTC for the period, % of CTC, grade, target against actual.
- **Grades:** A above 20% of CTC · B 10.01–20% · C 5.01–10% · D up to 5%.
- **Ranking:** by % of CTC; ties share a rank; shows movement since the previous period.
- **Target warning** when this month's or next month's target is missing.
- **Who sees what:** admins, the super admin and Manan see everyone; managers see their team; everyone else sees themselves. CTC is shown only to people who see everyone, and to each person for themselves.
- The **previous year overview** is kept, folded away, for people who see everyone.

---

## 6. What notifications / emails were added?

**Notices** (Inbox + push, under a new **Incentive** group — never Slack or WhatsApp):

| Who receives it | When |
|---|---|
| Eligible employees | A new incentive is added · an incentive is updated · an incentive is removed |
| Employees who lose eligibility | They are no longer eligible (with the date it takes effect) |
| The employee who filed | Approved · Published · Not Approved (with reason) · Revise (with note) · Due · Not Due · Reversed (with reason) |
| Manan Vasa | An employee resubmits (with their justification) |
| The paid employee | Accounts pays an incentive |

**Emails:** 12, one for each notice above except "Not Due", all in one shared design.
Reasons and justifications appear exactly as typed. The old approve / reject
email is no longer sent.

**Nobody gets the same notice twice**, and people who have left get nothing.
Clicking a notice opens the request, or the Incentive Table, directly.

---

## 7. What database changes were made?

In plain English (the SQL itself is in [`incentive-production.sql`](./incentive-production.sql)):

- **4 new tables:** every request version; every decision; every Incentive Table change; a "notice already sent" record.
- **4 new columns:** who shares a split request; which version a request is on; when it was last resubmitted; the employee code (shown on the dashboard).
- **4 rules changed on requests:** the old "only four request types" rule is removed; the status list becomes seven statuses; a split must have 2–5 people; the version number must be 1 or more.
- **Edit-locks** on the three history tables, so their rows can be added but never changed.
- **1 data update:** existing requests are given the start of their history.

Nothing is deleted.

---

## 8. What is still pending?

**Must be done before releasing this:**

1. **Run the production database update** — see [Production Database Update](#production-database-update). The new Incentive page does not work until it has run.
2. **Fix one test file, or the production build will stop.** `tests/unit/incentive-analytics.test.ts`, line 611: the sample ledger records in the "large dataset" test are missing `employeeId`, which the model now requires. Adding `employeeId: null` to that sample fixes it. The application code itself passes; this is the **only** error in a full type check, and the production build runs that same check over test files.
3. **Save the work to GitHub.** Nothing is committed. The same folder also holds other unfinished, unrelated work (Employee Master, Billing Master, schedule settings, device changes), so commit the Incentive files deliberately rather than everything at once.

**Partially completed / not done:**

4. **Partially completed: Split Incentive.** Saved, shown and used on the dashboard, but it does not divide payments — Accounts pays as before.
5. **Partially completed: Leads / Referrals.** Can be filed and reviewed, but has no automatic amount (the chart pays per batch), so an admin sets it.
6. **Not done: the Android app.** It cannot file, split or resubmit requests. It lists requests with the new status names, but the new statuses have no colours of their own there.
7. **Tidy-up:** the old approve / reject email code is still present but unused (`sendIncentiveDecisionEmail` in `lib/email/resend.ts`, and `emails/notifications/IncentiveDecision.tsx`).

---

## 9. Known issues and assumptions

- **Only Manan can decide.** There is no backup reviewer; if he is away, requests wait.
- **"Video Interview"** in the brief was taken to mean the existing **Interview** choice. **Video Testimonial** is reviewed like a normal incentive, not with Publish / Revise.
- **Exactly 20.00% of CTC is grade B**, not C. One example in the brief said C, but its own ranges say B, and the ranges were confirmed as the rule.
- **Interns vs sales** is worked out from the designation (Intern, Trainee or Apprentice = intern; everyone else = sales), because employees have no separate "sales" setting.
- **"Not Due" has no email** — it is shown in the app only.
- **The dashboard leaves out Manan Vasa, Dattaram Kap and Parvez Khan** by default — an existing Incentive setting.
- **Year to Date means January–December**, the Incentive module's own convention, not the April financial year.
- **Incentives paid per batch show "amount not set"** instead of a guessed amount.

---

## Production Database Update

**File:** [`incentive-production.sql`](./incentive-production.sql) (in the project's main folder)
**Database:** PostgreSQL (Supabase)

### What it changes, in plain English

It lets the database store the new Incentive features: splitting a request,
the seven statuses, the history of every version and decision, a record of every
Incentive Table change, a "notice already sent" record, and employee codes. It
also removes an old rule that would otherwise refuse every Leads / Referrals
request. Full list in [section 7](#7-what-database-changes-were-made).

**It deletes no data.** The only things it drops are old rules, each replaced
straight away by a wider one, and triggers it immediately recreates.

### ⚠️ Review before running

Have a developer read the file first. Every statement has a plain-English
comment above it, and every statement is copied exactly from the project's own
migration files (`0229`, `0230`, `0231`, plus one line each from `0064` and
`0225`).

### Order and dependencies

1. **Run it before the new Incentive code is deployed.** The old code keeps working after it runs; the new code fails without it.
2. **Inside the file, the order is already correct and matters:** the split column is added before the history is filled in, because the history copies it.
3. **It is independent of the device update** in [§1](#1-run-this-sql-in-supabase) of this handoff. Either can run first.
4. **It borrows one statement from the Employee Master work (`0225`):** an empty `employee_code` column, because the dashboard reads it. When `0225` itself is run later, it skips that line and adds the rest.
5. **The app also needs two existing employee columns** that this file does not add: `employment_status` (migration `0212`) and `account_type` (migration `0183`). The check at the end of the file reports whether they are there.

### Data migration

Runs automatically inside the file. Every existing request gets its first
history entry, copied from what it holds today. Every request that was already
approved or rejected also gets one decision entry, marked `legacy`, carrying the
reviewer and note already on record. Existing requests themselves are not
changed: they all stay on version 1 and unsplit.

### Manual steps

1. **Back up the database** (Supabase → Database → Backups).
2. **Review** the file.
3. **Run it:** Supabase Dashboard → SQL Editor → New query → paste the whole file → Run.
   Or: `psql "$DATABASE_URL" -f incentive-production.sql`
4. **Read the one-row result it shows at the end.** Columns `1_…` to `9_…` must all be `true`.
   If `app_needs_employment_status` or `app_needs_account_type` is `false`, apply migration
   `0212` or `0183` before deploying.
5. **Deploy the new Incentive code** — after fixing the test file in [section 8](#8-what-is-still-pending).

**Safe to run twice:** a second run changes nothing and adds no duplicate history.
**All or nothing:** it runs as one transaction, so if anything fails the database is left exactly as it was.
If the project's migration runner later lists `0229`–`0231` as pending, running them again is harmless.

### How it was checked

- **Copied, not retyped:** all 145 statement lines of `0229`–`0231` were compared line by line with the file — none missing.
- **Nothing destructive:** no `DROP TABLE`, `DROP COLUMN`, `DELETE` or `TRUNCATE`.
- **Actually run, 40 of 40 checks passed** — on a throwaway, in-memory PostgreSQL 18 copy (PGlite), never on production:
  - before: the old tables refused a Leads / Referrals request and the status "Due";
  - after: every existing request had its history, existing requests were unchanged, and a second run added nothing;
  - every new rule held — splits of 2–5 people only, resubmissions need a justification, three decisions need a reason, history cannot be edited, the same notice cannot be recorded twice;
  - a database missing its tables stopped with a plain message and was left untouched.
- **One limit on that test:** it ran on PostgreSQL 18, not on Supabase itself. The file only uses standard PostgreSQL features that migrations already applied to this project use too (triggers of the same kind appear in `0187` and `0205`).

### For developers — the Incentive files

**New:**
`app/(app)/incentive/analytics-actions.ts` ·
`components/incentive/analytics/incentive-analytics-dashboard.tsx` ·
`components/incentive/incentive-decision-panel.tsx` ·
`components/incentive/incentive-history.tsx` ·
`components/incentive/incentive-status-pill.tsx` ·
`emails/notifications/IncentiveNotice.tsx` ·
`lib/auth/incentive-permissions.ts` ·
`lib/incentive/prepare-request.ts` · `lib/incentive/split.ts` ·
`lib/incentive/workflow.ts` · `lib/incentive/workflow-server.ts` ·
`lib/incentive/analytics/{grading,model,periods,scope}.ts` ·
`lib/incentive/notifications/{content,eligibility,kinds,service}.ts` ·
`lib/queries/incentive-analytics.ts` ·
`db/migrations/0229_incentive_request_split.sql` ·
`db/migrations/0230_incentive_approval_workflow.sql` ·
`db/migrations/0231_incentive_notifications.sql` ·
`scripts/verify-incentive-{workflow,analytics,notifications}.ts` ·
`tests/unit/incentive-{request-form,approval-workflow,analytics,notifications}.test.ts`

**Changed:**
`app/(app)/incentive/{actions,catalog-actions,status-actions,page}.ts(x)` ·
`app/(app)/salary/incentive-payout/actions.ts` ·
`app/api/mobile/incentive/route.ts` ·
`app/(app)/inbox/notification-row.tsx` ·
`components/incentive/{incentive-form-dialog,incentive-list,incentive-tabs,incentive-catalog-dialog}.tsx` ·
`components/admin/settings-tab-notifications.tsx` ·
`lib/incentive-fields.ts` · `lib/incentive-amount.ts` · `lib/queries/incentive.ts` ·
`lib/notifications/{dispatch,retry,categories}.ts` · `lib/profile/notification-prefs.ts` ·
`lib/web-push/payload.ts` · `lib/email/resend.ts` · `lib/slack/templates.ts` · `lib/whatsapp/templates.ts` ·
`db/enums.ts` · `db/schema.ts` *(shared — it also holds the unrelated Employee / Billing Master changes)*

**Tests:** 273 tests across the 6 incentive test files pass.
