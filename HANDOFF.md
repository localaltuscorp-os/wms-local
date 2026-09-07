# Handoff

**Read this first.** It is the living state of the project: what works, what is
broken, what changed and why.

- Setup instructions → [`SETUP.md`](./SETUP.md)
- Replicating this system for a new client → [`docs/WMS_BLUEPRINT.md`](./docs/WMS_BLUEPRINT.md)

> **Every developer and intern must append to the changelog below before their
> work is considered done.** A PR without a changelog entry is incomplete. See
> [How to update this file](#how-to-update-this-file).

---

## Current state — 2026-09-05

**🟠 Incident contained, NOT resolved.** `DATABASE_URL` and the Firebase service
account are dead, Firebase Auth is rebuilt, no rows deleted since 2026-09-04
04:27, and Supabase is migrated to new API keys as of 2026-09-05.

**✅ The leaked Supabase keys are DEAD as of 2026-09-05.** Legacy JWT-based API
keys were disabled after the migration. Verified by direct test against
production: the leaked `anon` and `service_role` keys both return **401**, as
does a `service_role` read of the `employees` table. Production healthy
throughout (`/login` 200).

The Legacy HS256 (Shared Secret) key was then **revoked**, making this permanent
— the leaked keys cannot be re-enabled. Production verified healthy after the
revoke (`/login` 200, `/api/health` 200, leaked `service_role` 401).

**Still open:**

1. 🔴 **The exposed `.env.production` is still on this machine** — incident item
   6 previously recorded it as deleted; that was wrong. It is the origin of the
   whole incident, and its Supabase values are now dead but its **other** six
   secrets are still live (item 5). Back up the values, then delete.

Several other secrets from the same file remain unrotated (item 5). Read the
section below the table before doing anything else.

| | |
|---|---|
| **Production** | https://wms.mananvasa.com — live, serving authenticated traffic |
| **Repo** | `Altus-corp/Altus-OS`, app at repo root, branch `main` |
| **Hosting** | Vercel, team `altus-corp1`, project `altus-os`, region `bom1` |
| **Database** | Supabase Postgres `mwaijzxuyicysvimzspx`, `ap-south-1` (Mumbai) |
| **Auth** | Firebase `altuscorp-e7140` — **28 users**, rebuilt 2026-09-04 evening from `employees.firebase_uid`. 19 active / 9 deactivated. Everyone except Rohan has **no password set** and must use Forgot Password. |
| **Email** | Resend, `mananvasa.com` verified |
| **Scale** | 216 pages · 145 API routes · 240 tables · 212 migrations · 35 crons |

### Deploys are CLI-only right now

`git push` does **not** auto-deploy. Vercel Hobby rejects commits whose author
isn't the linked GitHub account, and that link still points at a departed
developer's account. Deploy from a git-less copy — see `SETUP.md` §7.

**Confirmed working 2026-09-04:** copy the tree excluding `.git` (keep `.vercel/`),
then `vercel deploy --prod --yes` from the copy. `vercel redeploy <url>` also works
and is faster when only env vars changed — but it re-runs EXISTING source, so it
will **not** pick up code edits. Note `vercel ls --prod` lists blocked deployments
too; a `Blocked`/`UNKNOWN` one cannot be redeployed (400). Pick a `● Ready` row.

**Git push was hanging** because `credential.helper` was Git Credential Manager,
which opens a GUI dialog no script can answer. Fixed by scoping github.com to `gh`:
`git config --global credential."https://github.com".helper '!gh auth git-credential'`

---

### ▶ START HERE — resuming after 2026-09-04 evening

Production is live and healthy, all 28 Firebase accounts exist, 19 employees are
active, and both actively-abused credentials are dead. Nothing is mid-flight.

**Two secrets you will need are deliberately NOT in this repo.** On a fresh
machine, get them before running any admin script:

1. **Firebase service-account key** for `altus-os-service-key@altuscorp-e7140`.
   Generate a fresh JSON: Google Cloud Console → IAM & Admin → Service Accounts →
   `altus-os-service-key` → Keys → Add key → JSON. **Do not use
   `firebase-adminsdk-fbsvc`** — that account is dead at Google's end and returns
   `invalid_grant: account not found` for every key it ever had.
2. **The database password.** `vercel env pull` returns the literal string
   `[SENSITIVE]` for Secret-type vars, so **`DATABASE_URL` cannot be read back out
   of Vercel**. If it is not in a password manager, the only way to obtain a usable
   one is to reset it again (Supabase → Settings → Database), re-push `DATABASE_URL`
   to production *and* preview, and redeploy — about 10 minutes of downtime.
   **Save it somewhere durable before you need it.**

Sanity-check a new key before trusting it — this is the test that caught a dead
credential after two wasted deploy cycles:

```js
// signs a JWT with the key and asks Google for a token; then proves it can
// actually administer Firebase Auth in this project
POST https://oauth2.googleapis.com/token       // grant_type=jwt-bearer
POST https://identitytoolkit.googleapis.com/v1/projects/<pid>/accounts:query
```

`200` on both = good. `invalid_grant` = the service account is gone.
`INSUFFICIENT_PERMISSION` on the second = the key is fine but the account is
missing a role (it needs **Firebase Authentication Admin** *and* **Service Account
Token Creator** — without the latter, password resets work but sign-in fails with
`INVALID_CUSTOM_TOKEN`).

**Next tasks, highest value first:**

1. **Finish the Supabase key migration** (item 3 below). New keys are live in
   production as of 2026-09-05; what remains is disabling the legacy keys and
   revoking the Legacy HS256 secret. ⚠️ `anon`/`service_role` **cannot be
   rotated** — read item 3 before touching anything on that page.
2. **Decide on Rashmi Tripathi** — active employee whose entire `employees` row was
   deleted during the incident. Recoverable from
   `Altus Backup/AltusOS WMS Backup/database/tables/employees.json`
   (id `b60094c4-513f-48ff-84e6-8fb5de54d615`). Restoring her also unblocks the last
   `employee_departments` row. **Decide active vs inactive first.**
3. **Rotate the remaining secrets** (item 5 below).
4. **Diff `salary_runs` / `salary_profiles`** against the 1-Sep backup field-by-field
   (item 7). Row counts cannot detect these — they were *modified*, not deleted.
5. **Known Issue #1** (`0212_mobile_devices_lifecycle.sql`) — still the
   disaster-recovery gap; the migration chain still cannot rebuild from empty.

---

## 🟠 INCIDENT — original resume list (written 2026-09-04 ~04:00 UTC, now partly done)

> Items 1, 2, 4 and 6 are done — see **▶ START HERE** above for what is actually
> next. This section is kept verbatim for the record; the text below it describes
> the situation as it stood at 04:00 UTC, when the credentials were still live.

**Someone has direct access to `DATABASE_URL` and `FIREBASE_PRIVATE_KEY` and is
using them right now, bypassing the app entirely.** Not a session/cookie issue —
confirmed by writing straight to Postgres and calling the Firebase Admin API
with no app login at all. Full detail in the 2026-09-03/04 changelog entry
below. **Do not consider this resolved until both of the two steps just below
are done and confirmed.**

### Do these two first, before anything else on this list

> **✅ BOTH DONE 2026-09-04 evening.** Kept below for the record — see the top
> changelog entry. Step 1's password was reset (and the `DATABASE_URL` rebuilt and
> verified). Step 2 went further than planned: the old service account
> `firebase-adminsdk-fbsvc` is now **dead at Google's end** (`account not found`),
> all four leaked keys are deleted, and a replacement account
> `altus-os-service-key@altuscorp-e7140` carries the Firebase Admin role.
> **Items 3-10 below remain OPEN.** The `SUPABASE_SERVICE_ROLE_KEY` (item 3) and
> the other secrets (item 5) are still the originals from the exposed file.

1. **Reset the Supabase database password** for project `mwaijzxuyicysvimzspx`:
   `https://supabase.com/dashboard/project/mwaijzxuyicysvimzspx/settings/database`
   → *Reset Database Password*. Kills the leaked `DATABASE_URL` immediately.
   **The app will go down until the new password is pushed to Vercel
   (`DATABASE_URL` env var, prod + preview) and redeployed — that's expected,
   accept the downtime.**
2. **Revoke the leaked Firebase service-account key** (not just rotate — the
   old key must be *deleted*, a new one alongside it is not enough):
   `https://console.firebase.google.com/project/altuscorp-e7140/settings/serviceaccounts/adminsdk`
   → generate a new private key → then in Google Cloud Console, IAM & Admin →
   Service Accounts → find the key ID currently in `.env.production` → delete
   it. Push the new `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` to Vercel
   and redeploy.

Once both are done: verify by re-running the Firebase Auth export
(`lib/firebase/admin.ts` pattern, see changelog) and confirming no new
`employee_events` rows appear with an unexplained actor after the rotation
timestamp.

### Then, still outstanding

3. **Supabase keys — MIGRATED 2026-09-05, two steps left.**

   ⚠️ **The instruction this item used to carry was impossible.** Supabase has
   **removed** the ability to rotate the legacy JWT secret, so `anon` and
   `service_role` can never be reissued — they are JWTs minted once at project
   creation with a ~10-year expiry. Rotating a JWT *signing key* only changes
   what Auth signs NEW tokens with; `anon`/`service_role` stay valid and
   byte-identical. Verified 2026-09-04: the `anon` key in the dashboard matched
   the one in the leaked `.env.production` exactly. The dashboard's own hint
   ("If leaked, generate a new JWT secret") is stale copy for a removed flow.

   **What was done instead** — migrated to the new API keys
   (Settings → API Keys → "Publishable and secret API keys"):
   `sb_publishable_…` replaces `anon`, `sb_secret_…` replaces `service_role`.
   Both drop into the SAME env var names with **no code change** — they are
   passed positionally into `createClient()` in
   `lib/supabase/{server,browser,admin}.ts`. Pushed to Vercel (prod + preview)
   and deployed as `altus-dvg2f47dg`. Confirmed the `sb_publishable_` key ships
   in the client bundle and the old leaked anon key is absent from it.

   **Still to do:**
   a. Verify the server-side path — log in, then open a document or avatar
      (that is the only flow that exercises `sb_secret_` via Storage).
   b. Then **Disable JWT-based API keys** (API Keys → legacy tab).
   c. Then **revoke the "Legacy HS256 (Shared Secret)" key** on the JWT Keys
      page. **This is the step that finally kills the leaked credential.**
      Until it happens, the leaked `service_role` key still works.

   The current signing key was already ECC (P-256), rotated ~3 months earlier,
   so no signing-key work was needed. Do not rotate signing keys for this — it
   achieves nothing here.
4. ~~**Reactivate the wrongly-locked employees.**~~ **PARTLY DONE 2026-09-04
   evening.** Full offline audit in
   [`docs/INCIDENT_2026-09-04_REACTIVATION_AUDIT.md`](./docs/INCIDENT_2026-09-04_REACTIVATION_AUDIT.md)
   — the discriminator is that every unauthorized deactivation has `note = NULL`,
   while legitimate ones carry a note. **9 reactivated**: Jeevan Bharambe, Dattaram
   Kap, Krish Maheshwari, Mitul Mehta, Namrata Nevgi, Rutvisha Mehta, Shreya Randhe,
   plus Manan Vasa and Om Jadhav at the account holder's explicit instruction.
   **Still deactivated, incident-related, awaiting a decision**: Danyal Sayyed,
   Ruchita Ambre, Suresh Yadav, Parvez Khan, Nandini Maurya. **Correctly deactivated,
   leave alone**: both Hetesh Vichare accounts, Siddhi Lakade, Pratham Medhekar.
5. **Rotate every other secret in `.env.production`**: `CRON_SECRET`,
   `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`,
   `WHISPER_API_KEY`, `OPENROUTER_API_KEY`. Same file, same exposure — no
   reason to assume these are clean just because they haven't been abused yet.
6. 🔴 **Delete `.env.production` and `.env.production.bak` — STILL NOT DONE.**

   **The previous all-clear on this item was wrong.** It claimed both files had
   been searched for and did not exist. On 2026-09-05 both were found sitting in
   `C:\Users\Welcome\Downloads\ALTUS OS\` — the same folder the tooling runs
   from — containing all 27 secrets in plaintext:

   ```
   .env.production       (Sep 2 23:42)
   .env.production.bak   (Sep 2 19:21)
   ```

   A third file, `altus-corp-dashboard\.env.local`, is the same category of
   exposure and also still present. It carries a Firebase service-account key
   for `emulator@vpinnacle-dev.iam.gserviceaccount.com` (dev project, not
   production — see Known Issue #5) which should be revoked.

   **This is the single most important open item.** It is the origin of the
   entire incident, and it survived this long because the doc said it was closed.

   **Before deleting:** copy every value into a password manager first.
   `vercel env pull` returns `[SENSITIVE]` for Secret-type vars, so it is **not**
   a way to recover a value you have lost, and some of these values may exist
   nowhere else.
7. **Manually review today's salary changes.** `salary_runs` (2 rows) and
   `salary_profiles` (1 row) were modified during the incident window; neither
   table logs who touched them. Have someone who knows the numbers check them
   by eye before trusting payroll output from this period.
8. **Protect `main`.** Attempted 2026-09-03 — **blocked by GitHub**: private
   repo + personal (non-org) account + Free plan = no branch protection
   available at any price point except upgrading. **Needs GitHub Pro
   ($4/mo)** on the `Altus-corp` account before this can be configured at all.
   Collaborator list was checked and confirmed clean (`Altus-corp` is the only
   collaborator) — this item is about surviving *that one* account being
   compromised, which is exactly what just happened.
9. **Revoke `MananVasa-support` GitHub access** (if not already gone — the old
   backup mirror shows this account with 174+ commits historically; current
   `Altus-corp/Altus-OS` collaborator list no longer shows it, but Deploy
   keys, Webhooks and installed GitHub Apps were not re-checked and can
   survive a person's removal).
10. **Reconnect Vercel's GitHub** to `Altus-corp` so deploys stop depending on
    a commit-author identity that isn't a Vercel collaborator (currently
    requires the git-less-copy workaround in `SETUP.md` §7 every time).

---

## 🟠 Known issues

### 1. The migration chain cannot rebuild the database — **disaster-recovery gap**

A fresh `pnpm db:migrate` fails three times (workarounds in `SETUP.md` §4).
The worst is **0206**: it reads `mobile_devices.status` and `revoked_at`, but
`0063` creates the table without them and **no migration ever adds them**.
`db/schema.ts` declares four columns that exist only because someone added them
by hand in production.

**Impact:** if the Supabase project were lost or corrupted, or you stood up
staging, it would fail at 0206. **Fix:** write `0212_mobile_devices_lifecycle.sql`
adding `status`, `approved_by_id`, `approved_at`, `revoked_at`.

### 2. `splitStandalone()` is broken

`scripts/apply-all-migrations.ts` strips comments *before* regex-matching:

```js
const code = line.replace(/--.*$/, "").trim();
if (/^alter\s+type\b.*\badd\s+value\b/i.test(code)) {
```

`0024` deliberately comments out its `ALTER TYPE ... ADD VALUE` expecting the
applier to catch it, but a commented line reduces to `""` and can never match.
**Fix:** test against the raw line.

### 3. Schema drift beyond `mobile_devices`

`employees` has **no `status` column** despite code implying deactivation logic.
Audit `db/schema.ts` against the live database before trusting either.

### 4. 35 crons on a Hobby plan (limit: 2)

`vercel.json` declares 34. Deploys aren't rejected, but **do not assume any cron
runs** until verified in the Vercel dashboard.

### 5. Config that only exists in one place

- `.firebaserc` says `vpinnacle-dev`; production is `altuscorp-e7140`.
- Supabase ref `mwaijzxuyicysvimzspx` is hardcoded in
  `android-app/app/build.gradle.kts` — must change when the project rotates.
- `docs/local-deploy/env.local.template` is titled "Carbide India" and carries
  another project's Firebase config. Harmless (public values) but misleading.
- `docs/local-deploy/windows-install.md` §0.3 tells you to download Postgres
  from EnterpriseDB, which now returns `403`.

### 6. 37 stale branches on the remote

Left from the previous history. Delete when convenient.

### 7. `account_type = 'system'` cannot be deactivated

`isLoginLive()` in `lib/auth/current.ts` returns `true` for a system account
**regardless of `is_active`** — deliberate, so the ~120 roster queries filtering on
`is_active = true` hide it automatically. The side effect is that setting
`is_active = false` on such an account does **nothing**: it still logs in.

No system account exists today — the only one, `System Service
<system.service.altus@gmail.com>`, was deleted during the incident (it was also a
hardcoded super-admin until 2026-09-04). Verified 2026-09-04: the only
`account_type`s present are `employee` and `candidate`, and **no inactive account
can log in**.

**If you ever create a system account again**, know that deactivating it is not a
containment option. Delete it or disable it in Firebase instead.

### 8. Firebase Dynamic Links shutdown — does NOT affect this app

The console warns that email-link auth for mobile and Cordova OAuth break when
Dynamic Links shuts down. Checked 2026-09-04 across `.ts`/`.tsx`/`.kt`/`.gradle`
including `android-app`: no `signInWithEmailLink`, `sendSignInLinkToEmail` or any
Dynamic Links usage. Sign-in is email+password and resets use
`generatePasswordResetLink`, which returns a plain `https://wms.mananvasa.com/...`
URL. **Safe to ignore** — unless someone later adds magic-link sign-in to the
Android app.

### 9. Former-employee marking is a primitive, not a sweep

`components/ui/avatar.tsx` accepts a `former` prop (flat slate fill, reduced
opacity, "former employee" in the tooltip and `aria-label`), but **nothing
passes it yet**. Roughly 50 components render an employee name and none of them
have been updated.

The risk this was meant to guard — assigning work to someone who has left — is
already closed a different way: `isCurrentStaff` (`lib/queries/employees.ts`)
excludes former employees from every roster and picker, so they cannot be
selected. What remains is cosmetic: a former employee's name on a historical
task still renders exactly like a current colleague's.

Deferred deliberately rather than bundled into the 0212 deploy — it is a
50-file mechanical change and deserves its own review.

### 10. `delete_guard` is undocumented and lives only on the database

A trigger named `delete_guard` blocks bulk `DELETE`s and raises a message
carrying `app=`, `addr=`, `user=` and the offending query. It is **not in this
repo** — no migration, no code, no prior mention in this file. It was installed
directly on the Postgres instance, almost certainly during the 2026-09-04
incident response, and its definition has never been read back.

It fired on 2026-09-05 blocking a `DELETE` of 224 `employee_events` rows during
an attempted employee delete, which is what prompted the offboarding work. The
new flow never bulk-deletes, so it should stay quiet.

**Two things to do:** dump `pg_get_functiondef` for it and commit the definition
so it survives a database rebuild, and consider formalising it as a proper
append-only rule on the audit tables (blocking `UPDATE` and `DELETE` outright)
rather than a hand-rolled bulk-delete heuristic.

Related: the app connects as the Postgres **superuser** (`user=postgres` in the
guard's own message). A least-privilege application role would make guards like
this unnecessary for the app path and genuinely effective against everything
else.

### 11. Rashmi Tripathi is still not restored

Unchanged from the 2026-09-04 entry, and now explicitly confirmed outstanding as
of 2026-09-05. She is a **current employee, not a leaver** — restore her
`is_active = true` and `employment_status = 'active'`; do **not** put her
through the offboarding flow. Her row is recoverable from the 1-Sep Google Sheet
backup, and the blocked `employee_departments` → Operations row goes in behind
it.

---

## Changelog

### 2026-09-05 — Offboarding replaces hard-delete; Supabase egress fixes

**What changed**

*Offboarding (migration 0212) — the main change.*
- **`deleteEmployee` is deprecated and unreachable from the UI.** The row menu
  now reads "Offboard employee" and opens a three-step wizard
  (`components/admin/archive-employee-dialog.tsx`).
- New action `archiveEmployee` in
  `app/(admin)/admin/employees/offboarding-actions.ts`. It destroys exactly two
  things — the Firebase user and the avatar — and retains everything else.
- New tables: `employee_exits` (one row per departure: reason, rehire
  eligibility, notice period, successor, handover checklist, exit interview)
  and `data_retention_policies` (retention schedule as data, seeded with Indian
  statutory periods).
- New `employees` columns: `employment_status`, `last_working_day`,
  `legal_hold`, `legal_hold_reason`, `anonymised_at`.
- Work re-homing in `lib/employees/offboarding.ts`: open tasks (`doer_id`) and
  direct reports (`manager_id`) move to a named successor; OOO delegations
  pointing at the leaver are cleared. `initiator_id` / `created_by_id` and
  completed tasks are never touched.
- "Previous employees" section on `/admin/employees`
  (`components/admin/previous-employees.tsx`) with a View-more panel: DOJ, last
  working day, tenure, reason, rehire eligibility, notice, successor, and a
  60-day activity log with a super-admin "show full history".
- New `isCurrentStaff` filter in `lib/queries/employees.ts`. **Every roster and
  picker must use this, not `isStaffAccount`** — a former employee keeps their
  row now, so `isStaffAccount` alone would list people who have left.
- Exit register CSV at `/api/admin/exit-register` (admin-gated,
  formula-injection safe).
- Anonymisation cron at `/api/cron/retention-anonymise`, weekly, **disarmed**.
- `Avatar` gained a `former` prop (flat slate + "former employee" in the
  tooltip/aria-label). **Not yet wired through the ~50 components that render
  employee names** — see Known Issues.

*Supabase egress (separate, earlier the same day).*
- `app/api/avatar/[id]/route.ts` — signed-URL TTL 10 min → 1 hour, and the
  redirect is now cacheable for 30 min (`private, max-age=1800`). It previously
  answered `max-age=0, must-revalidate` while minting a new `?token=` per
  request, so every revalidation was a guaranteed cache miss and a full
  re-download.
- `components/profile/identity/avatar-and-name.tsx` — client-side
  `downscaleForAvatar()`: centre-crop, 256px, WebP q0.85 (~15–25 KB instead of
  up to 2 MB). EXIF-aware, falls back to the original on any failure.
- `app/api/profile/avatar/route.ts` — upload cap 2 MB → 1 MB as a backstop.

**Why**

- `actor_id` is `ON DELETE RESTRICT` across `employee_events`, `task_events`,
  `settings_events`, `document_events` and `outstanding_followups`. Postgres
  therefore refused to drop an employee while the company's own audit trail
  referenced them, and `deleteEmployee` worked around that by **deleting the
  audit trail first**. One click destroyed 112 tasks and 522 audit events
  belonging to the organisation in order to remove one login. The record is the
  company's; only the identity belongs to the person.
- Audit history is deliberately **not** purged on exit. Misconduct is routinely
  discovered months after a departure — as this company learned on 2026-09-04 —
  so an exit-time purge is precisely the capability an insider would want. The
  60-day limit is a query filter in `lib/queries/offboarding.ts`, never a delete.
- Attendance is retained for the statutory period, not 60 days. It is the
  evidentiary basis for wages paid, and the burden of proof in an Indian wage
  dispute sits with the employer (Maharashtra S&E Act / Payment of Wages Act,
  3 years; PF/ESI 8 years; IT Act 6 years). The 60-day figure is a UI window.
- Egress was 6.27 GB against a 5 GB free-plan cap, with only 78 MB of database
  and 100 MB of files — the whole dataset going out ~35× a month. Avatars were
  the largest single contributor.

**How to verify**

```bash
# Offboarding — signed in as an admin:
#   /admin/employees → row menu → "Offboard employee" → 3 steps
#   the same page, below the roster → "Previous employees" → "View more"
#   /api/admin/exit-register → CSV download

# Cron is auth-gated (expect 401 without the secret):
curl -s -o /dev/null -w "%{http_code}\n" \
  https://wms.mananvasa.com/api/cron/retention-anonymise

# Egress — in the browser devtools Network tab, load any page with avatars
# twice. The second load must serve them from cache, not re-download.
```

**Breaking / migration notes**

- **Migration `0212_employee_offboarding.sql` must be applied before this code
  runs.** It was applied to production by hand via the Supabase SQL editor on
  2026-09-05, because `pnpm db:migrate` replays all 212 migrations and the chain
  is broken (Known Issue 1). The migration is additive and fully idempotent
  (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so re-running it is safe.
- No new environment variables.
- `vercel.json` gained a 35th cron. The Hobby plan limit is 2 (Known Issue 4);
  this one is weekly and disarmed, so it changes nothing operationally.
- **Every retention class except `work_session_shots` has
  `purge_enabled = false`.** Nothing ages out until someone deliberately arms a
  class. Do not arm `employee_pii` without legal sign-off.

**Author:** Claude Opus 5 (paired with Manan)

### 2026-09-05 — Supabase migrated to new API keys; two false all-clears corrected

**What changed**

- **Supabase `anon`/`service_role` replaced with publishable/secret API keys.**
  New keys pushed to Vercel (prod + preview), deployed `altus-dvg2f47dg` from a
  git-less copy. Verified live: `sb_publishable_` present in the client bundle,
  old leaked anon key absent from all 20 scanned chunks, `wms.mananvasa.com` 200.
  No code changes were needed — the keys drop into the same env var names.
- **`components/admin/employee-list.tsx`**: added a Status column (Active /
  Deactivated chip, sortable) and a matching Status filter. Deactivation state
  was previously invisible in the roster — you had to open a row menu to see it.

**Findings worth keeping**

- **`anon`/`service_role` cannot be rotated.** Full detail in incident item 3
  above. This invalidated the previous plan and cost a detour — the dashboard
  still shows a hint pointing at the removed flow. Do not go looking for a
  rotate button; there isn't one.
- **`.env.production` + `.env.production.bak` were never deleted**, despite item
  6 recording them as gone. Also `.env.local`. See item 6 — this is now the top
  open item.
- **`vercel env ls` shows CREATION time, not update time.** A var edited in the
  dashboard still reports its original age on the CLI. Use the dashboard's "Last
  Updated" column to verify a push landed — the CLI will mislead you.
- **A claim made and retracted, recorded so nobody re-derives it:** it looked
  like `COOKIE_SECRET_CURRENT`/`PREVIOUS` had been rotated on Production but not
  Preview, based on those CLI timestamps. That inference was wrong for the reason
  directly above, and there is **no evidence of an actual gap**. If you want to
  check it properly, use the dashboard's Last Updated column. The broader
  question worth reviewing on its own merits: **preview deployments point at the
  production database**, so preview env vars are production-grade secrets.
- **`deleteEmployee` hides its real error.** `app/(admin)/admin/employees/actions.ts`
  catches with `err?.message`, but Drizzle wraps every failure in a
  `DrizzleQueryError` whose message is always `"Failed query: <sql> params: …"`.
  The actual Postgres cause sits on `.cause` and is never read, so the UI toast
  is uninformative for *any* failure at that step. Fix: use
  `err?.cause?.message ?? err?.message`. Surfaced by a failing Hetesh Vichare
  delete whose root cause is still undiagnosed as a result.

**How to verify**

```bash
curl -s -o /dev/null -w "%{http_code}" https://wms.mananvasa.com/login   # 200
# then, signed in: open a document or avatar — exercises sb_secret_ via Storage
```

**Breaking / migration notes**

- None yet. The legacy keys are still enabled, so the old values remain a valid
  rollback until incident item 3b/3c are done.

**Author:** Claude Code, working with the `Altus-corp` account holder


### 2026-09-04 (evening) — Credentials rotated, Firebase Auth rebuilt, data recovered

**What changed**

- **Firebase service account replaced.** The old `firebase-adminsdk-fbsvc@altuscorp-e7140`
  is **dead** — Google returns `invalid_grant: "Invalid grant: account not found"`
  for it, so no key of its can ever work again. Replaced with a new account,
  `altus-os-service-key@altuscorp-e7140.iam.gserviceaccount.com`, granted
  **Firebase Authentication Admin** + **Service Account Token Creator**. Both roles
  are required: without the second, login fails with `INVALID_CUSTOM_TOKEN` while
  password resets appear to work.
- **All 4 leaked service-account keys deleted** (`390de0aa`, `f80f66f3`, `f9cd36bf`,
  `ae7a2d0d`). A 5th (`cf684bc94c`) was generated mid-incident and is also dead with
  the parent account. `FIREBASE_PRIVATE_KEY`/`CLIENT_EMAIL`/`PROJECT_ID` all repushed.
- **Supabase database password reset** and `DATABASE_URL` rebuilt against the
  transaction pooler. Verified by direct connection before deploying.
- **26 Firebase Auth accounts recreated** with their **original UIDs**, taken from
  `employees.firebase_uid` — every one of the 28 employee rows still had it, so the
  missing Firebase Auth export was never needed. All FK references stayed valid;
  nothing in Postgres had to be rewritten. Accounts were created with **no password**
  (the old hashes are unrecoverable) and `disabled` mirroring `is_active`.
- **9 employees reactivated** at the account holder's instruction: Jeevan Bharambe,
  Dattaram Kap, Krish Maheshwari, Mitul Mehta, Namrata Nevgi, Rutvisha Mehta,
  Shreya Randhe, **Manan Vasa** and **Om Jadhav**. 19 of 28 now active.
- **Super-admins reduced to two** (`lib/auth/super-admin.ts`): Rohan Choudhary and
  Manan Vasa. Removed Om, Mohit, and `system.service.altus@gmail.com`. Also removed
  the `SYSTEM_SERVICE_EMAIL` env escape hatch — it let anyone who could set a Vercel
  env var grant themselves super-admin with no code review. It was unset in prod, so
  removing it changed no behaviour. Rohan also given `is_admin = true`.
- **Data restored from the 1-Sep backup** (additive `ON CONFLICT DO NOTHING`, so
  nothing newer was overwritten): `tasks` 952→1026, `accounts_monthly_checks` 0→467,
  `accounts_weekly_checks` 0→328, `accounts_bank_balances` 0→143,
  `accounts_loan_cells` 0→34, `project_nodes` 60→87, `candidate_intake` 1→13,
  `employee_departments` 59→74.
- `.gitignore`: added `/Altus Backup/` — 112 MB of DB rows including `salary_runs`
  and `salary_breakup` was untracked and **not ignored**; one `git add -A` would have
  pushed employee salary data to GitHub.

**Findings worth keeping**

- **`.env.example` is wrong about the database port.** It documents `5432`
  (session pooler); `lib/db/index.ts` says the app connects to the **transaction
  pooler on 6543**, and its `max: 10` is tuned against that pooler's limits. Trust
  the code. *(Not yet fixed — see Known Issues.)*
- **`account_type = 'system'` bypasses `is_active` entirely.** `isLoginLive()` in
  `lib/auth/current.ts` returns `true` for system accounts regardless of
  deactivation. No such account exists now — the only one, `System Service`, was
  deleted during the incident — but any future one is un-deactivatable by design.
- **An employee row was deleted outright, not deactivated:** `Rashmi Tripathi
  <rashmitripathi.altuscorp@gmail.com>`, active on 1 Sep, gone by 4 Sep 04:27. Her
  row is recoverable from the 1-Sep backup and **has not been restored yet**. This is
  why one `employee_departments` row (→ Operations) still cannot be re-inserted.
- **Nothing has been deleted since 2026-09-04 04:27.** A three-way diff of the 1-Sep
  backup, the 4-Sep 04:27 snapshot and live production shows every loss falling in
  that window and none after it.
- The GCP project `altuscorp-e7140` has **no parent organisation**, so the old
  `unleashed.in` workspace holds no inherited access. Project IAM is the whole
  picture, and it lists only the service account and `manan@altuscorp.in` (Owner).
- Supabase project `mwaijzxuyicysvimzspx` is owned by the **personal Gmail account**
  `manan.vasa@gmail.com` ("manan's Org"), not a company org. 2FA has been enabled on
  it. Moving it to a company-owned organisation is still outstanding.

**How to verify**

```bash
vercel env ls                      # DATABASE_URL + 3 FIREBASE_* all rotated today
node -e "..."                      # JWT-grant test against Google; see the session log
# in the app: Forgot Password -> reset link -> sign in
```

**Breaking / migration notes**

- Every employee except Rohan Choudhary must use **Forgot Password** before signing
  in. Their accounts exist with no password set.
- Anyone previously relying on Om or Mohit having super-admin will find they no
  longer do.

**Addendum, same evening**

- Deployed `altus-pvsyzc4k5` (git-less copy → `vercel deploy --prod --yes`), verified
  serving on `wms.mananvasa.com` with no `invalid_grant` / `INVALID_CUSTOM_TOKEN` /
  `28P01` in the logs.
- Fixed `.env.example`: it documented the database port as `5432`; the app uses the
  **transaction pooler on 6543** (`lib/db/index.ts`). Added a note about
  percent-encoding — a `@` in a password silently breaks the URL and produces a
  misleading auth error, which cost time today.
- Fixed `git push` hanging: `credential.helper` was Git Credential Manager, whose GUI
  prompt no script can answer. Scoped github.com to `gh auth git-credential`.
- Added Known Issues #7 (`account_type='system'` cannot be deactivated) and #8 (the
  Firebase Dynamic Links warning does not affect this app).

**Author:** Claude Code, working with the `Altus-corp` account holder


### 2026-09-03/04 — Unauthorized access incident (CONTAINED 2026-09-04 evening — see the entry above)

**What happened, in order**

All timestamps UTC. `employee_events.actor_id` for every row below resolves to
Manan Vasa's employee row (`1fbc08ff-fa3f-47c3-bcee-3539a9c0c299`).

- **~03:52–04:21** — 5 attendance punches deleted for Jeevan Bharambe (Aug
  1/3/4/5), 3 accounts deactivated (Om Jadhav, Rohan Choudhary, Jeevan),
  a password reset forced on Proveeka Makwana, Om's manager/schedule edited.
- **~13:42–13:46** — 7 more deactivations (Rutvisha, Rohan again, Danyal,
  Jeevan again, Namrata, Mitul, Om again).
- Manan told the account holder directly he did not do this.
- Traced the session mechanism: `lib/auth/session.ts` verifies the login
  cookie against `COOKIE_SECRET_CURRENT`/`PREVIOUS` — a shared HS256 secret,
  not a Firebase credential. That secret sits in plaintext in
  `.env.production` in `Downloads/ALTUS OS/` on this machine — already
  flagged as exposed in an earlier session. Anyone with that string can forge
  a valid login as any employee without a password.
- **Contained (round 1):** generated new `COOKIE_SECRET_CURRENT`/`PREVIOUS`,
  pushed to Vercel prod, redeployed via the git-less-copy workaround (`main`'s
  commit author isn't a Vercel collaborator — see `SETUP.md` §7). Confirmed
  live: `wms.mananvasa.com` serving the new build.
- **It didn't stop.** Firebase Auth went from 24 users to **1** (23 *deleted*,
  not disabled). `employees.is_active=false` count went from 12 to 17,
  including people who were untouched an hour earlier. A new
  `attendance_punch_delete` event landed at **2026-09-04T01:38:31Z** — well
  after the redeploy was confirmed live — actor still Manan's identity.
  Tried to disable Manan's Firebase account as an emergency stop:
  `auth.getUserByEmail("manan@unleashed.in")` → **no such user** — his account
  had already been *deleted*, yet new DB rows kept appearing under his
  employee ID. Set `employees.is_active=false` on his row directly (DB-only;
  the Firebase account no longer exists to disable).
- **Conclusion:** this is not a session/cookie problem. Whoever is doing this
  has the raw `DATABASE_URL` and `FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL`
  themselves and is writing directly to Postgres and calling the Firebase
  Admin API, with no app login involved at all — both credentials from the
  same exposed `.env.production`. Checked for a way to rotate these directly:
  Supabase CLI on this machine is authenticated to a *different* project
  (`AltusTribe`, `qetdwvqohfrtvrywvnnp`) with no access to the real production
  project (`mwaijzxuyicysvimzspx`) — account fragmentation, see
  [[altus-account-fragmentation]]. `gcloud` isn't installed. **Neither can be
  rotated from this machine/session — needs dashboard login as the account
  that actually owns each project.** Handed off to the account holder as the
  top item in 🔴 above; they were about to leave the office when this was
  found.

**Firebase Auth backup exists from before the deletions** —
`C:\Users\Welcome\Altus-Backups\2026-09-03\firebase-auth-users-altuscorp-e7140.json`,
24 users, taken ~13:53 UTC, before the mass deletion. Use it to restore
accounts once the leaked credentials are dead; do not restore into a database
that's still reachable by the old `DATABASE_URL`.

**Current locked-out list** (`is_active=false`, as of 2026-09-04T04:04 UTC —
will be stale by the time you read this, re-query `employees` directly):
Danyal Sayyed, Dattaram Kap, both Hetesh Vichare accounts, Jeevan Bharambe
(admin), Krish Maheshwari, Mitul Mehta, Namrata Nevgi, Nandini Maurya (admin),
Om Jadhav (super-admin), Parvez Khan, Pratham Medhekar, Ruchita Ambre (admin),
Rutvisha Mehta, Shreya Randhe, Siddhi Lakade, Suresh Yadav, and Manan Vasa
himself (deliberately, see above). Rohan Choudhary was reactivated and
confirmed working before the incident escalated further.

**Author:** Claude Code, working with the `Altus-corp` account holder

### 2026-09-02 — Repo restructure, deployment repair, performance

**Repository**
- Extracted the app from `task-management/` to the repo root. It previously sat
  in a subdirectory alongside an unrelated static portfolio site, which is why
  Vercel served `index.html` and never built the app.
- Removed the portfolio site and `mobile_LEGACY_DROP_2026-07-02/` (53 files).
  Full pre-change mirror preserved locally (`altus-os-backup.git`, 956 commits,
  38 branches).
- Force-pushed a fresh 2-commit history to `main`.

**Deployment — four separate gates, each hidden behind the last**
1. Vercel Hobby blocked the commit author → deploy from a git-less copy.
2. Project had **zero** environment variables → pushed 27 vars × 2 targets.
3. Framework Preset was **"Other"**, so Vercel served `public/` instead of
   `.next` — *the build reported success while every route 404'd*. Fixed with
   `"framework": "nextjs"` in `vercel.json`.
4. `FIREBASE_PRIVATE_KEY` was corrupted mid-session by a bad repair (see below).

**Performance**
- Pinned functions to `bom1` (Mumbai). They defaulted to `iad1` (Washington)
  while the database is in Mumbai — ~200-250 ms per query, several queries per
  page. **Warm TTFB roughly halved: ~0.51 s → ~0.24 s.**

**Password reset — was broken before this session and had four causes**
1. Firebase authorized domains didn't include the production domain →
   `auth/unauthorized-continue-uri`. Fixed by pointing `NEXT_PUBLIC_SITE_URL` at
   the already-allowlisted `wms.mananvasa.com`.
2. `NEXT_PUBLIC_SITE_URL` was `http://localhost:3000`, so previously issued
   reset links pointed at the recipient's own machine. `localhost` is
   allowlisted by default, which is why this failed silently for so long.
3. Resend domain `mananvasa.com` was `not_started` — DNS records were never
   published. Added DKIM + 2 SPF records; verification completed ~40 min later.
4. From-address had to match the verified domain exactly.

**Documentation**
- Added `SETUP.md`, `HANDOFF.md`, `docs/WMS_BLUEPRINT.md`.

**Mistakes made, recorded so they aren't repeated**
- `FIREBASE_PRIVATE_KEY` was working; a diagnostic run inside a shell heredoc
  collapsed `\\n` to a real newline, falsely reporting "no separators". The
  "repair" used `[^A-Za-z0-9+/=]`, which strips the backslash but **keeps the
  `n`** — injecting 27 stray characters into the base64 body (1624 → 1651) and
  breaking Firebase Admin. Restored from backup. **Never regex-repair a PEM;
  validate by base64-decoding the body first.**
- `altus-os-phi.vercel.app` was assumed to be production. The real domain is
  `wms.mananvasa.com`; the alias moved on redeploy.
- Several rounds were spent inferring provider errors from UI screenshots.
  `vercel logs` gave the exact error immediately. **Check logs first.**

---

## How to update this file

Append a new entry at the **top** of the changelog after every meaningful piece
of work — merged PR, config change, deploy, incident. Then commit it *with* your
change, not afterwards.

```markdown
### YYYY-MM-DD — Short summary of the change

**What changed**
- Bullet per user-visible or structural change. Name the files or modules.

**Why**
- The reason. A future reader needs the motivation, not just the diff.

**How to verify**
- The command, URL or click-path proving it works.

**Breaking / migration notes**
- New env vars, migrations to run, manual steps. Write "None" if none.

**Author:** Your Name
```

### Rules

1. **Write for someone who wasn't here.** Assume no context. Name files.
2. **Record failures and dead ends**, not just successes — they're often more
   valuable than the fix.
3. **Never delete history.** Move resolved items to a `### Resolved` section
   under Known Issues with the date and how they were fixed.
4. **Update the state table** at the top when domains, providers, projects or
   counts change.
5. **New env var?** Document it in `SETUP.md` *and* `.env.example` in the same
   PR, and add it to Vercel for **production and preview**.
6. **New migration?** Confirm a fresh `pnpm db:migrate` still passes from an
   empty database. If you can't, say so explicitly under Known Issues.

### Before you start work

```bash
git pull
pnpm install          # lockfile may have moved
pnpm db:migrate       # schema may have moved
```

Read the newest changelog entry and the Known Issues list. Most surprises in
this codebase are already written down.
