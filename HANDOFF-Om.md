# HANDOFF — `Om` branch

**Updated:** 2026-09-11
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Om`
**Audience:** whoever picks this up, and whoever runs the SQL in Supabase.

Three streams of work landed today. **None of the SQL has been run yet** — the
code assumes tables and columns that do not exist in Supabase, so read §1 before
deploying anything.

---

## 1. Run this SQL in Supabase

### 1a. The safe batch — paste and go

Everything additive, in filename order, in one transaction:

**`db/RUN-IN-SUPABASE-0216-0224.sql`**

Supabase Dashboard → SQL Editor → New query → paste the file → Run. Or:

```bash
psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0216-0224.sql
```

No `DROP TABLE`, no `TRUNCATE`, no `DELETE` anywhere in it. Every statement is
idempotent, so a second run changes nothing. Two sections write rows — `0217`
(master data) and `0220` (backfill) — both flagged inline, both safe to re-run.

Generated verbatim from `db/migrations/*.sql`: all 254 SQL lines are
byte-identical to the repo, checked line by line rather than retyped.

### 1b. `0223` — destructive, run it on its own

**`db/migrations/0223_clear_registered_devices.sql`** is deliberately **NOT** in
the batch above. It runs `DELETE FROM mobile_devices`.

```bash
pnpm db:migrate -- --allow-destructive=0223_clear_registered_devices.sql
```

The runner refuses it unless you name the file — that guard is the point.

**What it costs:** device *history*. Revoked rows were kept forever so an admin
could read who revoked what and why. This deletes that, and it is not
recoverable. Back it up first if that matters:

```sql
CREATE TABLE mobile_devices_pre_0223 AS SELECT * FROM mobile_devices;
```

**What it does not cost:** consent records survive
(`device_consent_events.device_row_id` is `ON DELETE SET NULL`, and each row also
carries the device id as text).

**Why wipe at all:** `enroll()` has written a row on first sight of any browser
since the device gate shipped, and auto-adopt marked them `approved` with no
human involved. So "approved" currently means "this browser turned up once", not
"this person registered this machine" — plus the duplicates the device audit
documents. Carrying those forward marks everyone already-registered, which
defeats first-login registration entirely.

**Order:** §1a first (adds the columns), then decide about `0223` (clears the rows).

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
| `DEVICE_ACCESS_ENFORCEMENT=off` | No |
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
