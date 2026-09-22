# Handoff

**Read this first.** It is the living state of the project: what works, what is
broken, what changed and why.

- Setup instructions → [`SETUP.md`](./SETUP.md)
- Replicating this system for a new client → [`docs/WMS_BLUEPRINT.md`](./docs/WMS_BLUEPRINT.md)
- **`Om` branch handoff + unrun SQL migrations** → [`HANDOFF-Om.md`](./HANDOFF-Om.md)

> **Every developer and intern must append to the changelog below before their
> work is considered done.** A PR without a changelog entry is incomplete. See
> [How to update this file](#how-to-update-this-file).

---

## ✅ Database migrations 0215–0224 — APPLIED 2026-09-15 (`0216_incentive_eligibility`, `0225`, `0226` still pending — see below)

> **Still outstanding: `0216`, and the `Rudra` branch's `0229` and `0230`**
> (see the bundle below and the 16–17 September entries).

> **This section is now a record, not a to-do.** All 15 migrations ran against
> production and verified clean (74/74). See the 15 September (night) changelog
> entry for the run, the device wipe and its restore. What follows is kept
> because every warning in it still applies to the next batch — the project
> mix-up, the "success is not proof" traps, and why `npm run db:migrate` is not
> the tool here. **`0216_incentive_eligibility.sql` is the one still outstanding**
> (see below); it self-heals at runtime, but apply it properly.

**Order: `db/VERIFY-0215-0224.sql`, then
`db/RUN-IN-SUPABASE-0215-0224-ALL.sql`, then the verify file again.** Both
arrived on the team's `prod-sync-0915` branch, merged here on 15 September.

🔴 **The instructions that came with those files name the wrong Supabase
project.** They say `fjopgyqytfvbudkwhdto`, and call it production. That is the
**team's** database. Production is **`mwaijzxuyicysvimzspx`**:

```
https://supabase.com/dashboard/project/mwaijzxuyicysvimzspx/sql/new
```

Run the file against their ref and it changes their data while production stays
unmigrated — and it looks like it worked.

**There is a THIRD project.** `docs/handoffs/HANDOFF-2026-09-11-candidate-no-
login-form.md` records `0221_candidate_access_links` being applied to
`ifcdpjbdinvmtewmgceg`. So of the three refs that appear in the team's notes,
**one is production and two are not**, and both of the others are named as
places migrations were actually run. Check the ref in the URL bar every time.

**Their notes disagree with ours about what is already applied**, and neither
is evidence. That same file says seven migrations are outstanding on production
(`0215` ×2, `0216`–`0220`); the 11 September entry below records `0215`–`0220`
applied by hand. They cannot both be right. Do not try to settle it by reading:
`db/VERIFY-0215-0224.sql` answers it against the live database in one run, and
every statement in the sheet is idempotent, so the cost of being wrong in the
"already applied" direction is nothing.

**Their sanity check cannot catch that.** "~270+ tables, near 0 means wrong
project" only catches an *empty* project; both databases carry the full WMS
schema. Step 3 of the verify file is the check that discriminates: this database
has `app.is_admin()` and `app.current_employee_id()`, theirs has neither — which
is why their `PART 3b` shipped commented out in September. **`has_is_admin`
false means you are not in production.**

🔴 **`0224` MUST RUN BEFORE THIS CODE DEPLOYS. It is not a degrade-gracefully
migration.** `0224` renames `mobile_devices.bios_serial_number` to
`device_name`, and `db/schema.ts:2085` already declares `deviceName`. Drizzle's
`db.query.mobileDevices.findFirst` expands every declared column, so against a
database where `0224` has not run it asks for a column that does not exist and
throws `42703`.

`resolveDeviceContext` (`lib/security/device-access.ts:220`) makes exactly that
call on **every request that carries a device cookie**, with no try/catch above
it, and the lookup runs even for exempt actors and with
`DEVICE_ACCESS_ENFORCEMENT=off` — the comment there says so deliberately, so the
master switch does not silently skip the audit row. So the failure is app-wide,
not confined to the device screens.

This is the 9 September outage in a new place: a bare-selected table, a column
the code knows about and the database does not. **Run the SQL first, then push
to `main`.** `DeviceRegistrationGate` catches its own errors and the Operations
Checklist and Job Description pages guard `42P01`/`42703` and show a setup
notice — those three are genuinely safe to deploy early. The device context is
not.

**Most of Part 1 is already applied here.** `0215`–`0220` went in by hand on
11 September as `SQL STEPS/STEP-3`, `STEP-5` and `STEP-6`. Every statement is
idempotent, so re-running is harmless — but the genuinely outstanding set is
smaller than "15 migrations": `0221` ×3, `0222` ×3 and `0224`, plus `0223`
only if the device wipe is wanted.

**Part 2 (`0223`) clears every row from `mobile_devices`.** That is intended —
it is the point of first-login registration — and it is guarded: it copies the
table to `mobile_devices_pre_0223` in the same transaction first, and skips
itself entirely if that backup already exists, so a second run cannot wipe
registrations people have just made. **To stop before the wipe, end at the line
marked `END OF PART 1`.**

**`0216_incentive_eligibility.sql` is ours and is NOT in that file** — it was
generated from `ae58385`, before that commit existed. The incentive page will
not break meanwhile: `lib/incentive/ensure-eligibility-schema.ts` applies the
additive half at runtime. Apply the migration properly regardless.

`db/RUN-IN-SUPABASE-0216-0224.sql` is **superseded and incomplete** — neither
`0215`, and none of Rudra's or Vinal's `0221`/`0222`. Use the `-ALL` file.

**Two 0216 files now exist**, ours and theirs. Harmless — the runner orders by
full filename — and it joins the 28 collisions already there back to `0019`.

**Then the `Rudra` branch's own two**, `0229` (broadcast repeats and WhatsApp
outcomes) and `0230` (Client Engagement), in a second bundle:

```bash
psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0229-0230.sql
```

That one is additive and re-runnable throughout — every statement is
`IF NOT EXISTS` or a guarded `DO` block, and the only `DROP`s are CHECK
constraints being replaced in place. Unlike the 0216–0224 set, the app keeps
working without it: the new screens simply have nothing to show.

Do **not** reach for `npm run db:migrate`: the drizzle journal is stale at
`0019`, so it would also apply two dozen unrelated pending migrations. Full
detail and per-file notes are in [`HANDOFF-Om.md`](./HANDOFF-Om.md).

### Four more, for Operations (added 2026-09-12)

Not part of the `0216–0224` file above. Apply **in this order**, after it:

| Migration | Gives you | Verified state |
|---|---|---|
| `0221_ops_event_checklist.sql` | Event Checklist templates, runs, items, ticks | **Never applied here** |
| `0222_job_description.sql` | JD Bank: ranks, positions, entries, assignments | **Never applied here** |
| `0225_jd_assignment_targets.sql` | Per-destination assignment flags on `jd_assignments` | New, unrun |
| `0226_jd_rank_ladder_26.sql` | The 26-rank ladder, replacing fourteen | New, unrun |

The first two were checked against `information_schema` on 2026-09-12 and **no
`jd_*` or `ops_checklist_*` table exists in this database**. Until they run,
both screens render from a seeded in-memory demo layer behind a banner naming
the migration — fully usable, resets on restart, stores nothing.

`0226` renumbers `rank_order`, **which is behaviour**: the vacancy resolver
climbs it, so the numbers decide who covers a vacant seat. It renumbers in two
passes (one pass collides with the unique index) and leaves `DGM` alone
deliberately, raising a notice naming how many positions are stranded on it.
All four are additive and idempotent — no `DROP`, no `DELETE`.

---

## Current state — 2026-09-08

**🟠 Incident contained, NOT resolved.** `DATABASE_URL` and the Firebase service
account are dead, Firebase Auth is rebuilt, no rows deleted since 2026-09-04
04:27, and Supabase is migrated to new API keys as of 2026-09-05.

**New on 2026-09-08:** `git push` deploys again (see *Deploys* below — run the
one-line `git config` on any machine you commit from). An outside developer
(`localaltuscorp-os`) has **read-only** access and contributes by fork and pull
request into `dev-integration`; he cannot push here at all. Rashmi Tripathi is
restored and can log in. Two undocumented delete guards on the database are now
written up in known issue 10 — read it before attempting any employee delete.

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

2. 🔴 **The 2026-09-09 sequence repair may not have reached the database that
   serves users** — see the 2026-09-09 changelog entry. Until the two `setval`
   statements run there, task status changes, reassignment and deletion fail
   with a duplicate-key error and roll back silently.

Several other secrets from the same file remain unrotated (item 5). Read the
section below the table before doing anything else.

| | |
|---|---|
| **Production** | https://os.altuscorp.in — live. DNS: `os` is a CNAME to Vercel in GoDaddy; **do not add TXT records at `os`** (see 2026-09-07 entry) . `wms.mananvasa.com` is dead. Historical references to the old host below are kept as written. |
| **Repo** | `Altus-corp/Altus-OS`, app at repo root, branch `main` |
| **Hosting** | Vercel, team `altus-corp1`, project `altus-os`, region `bom1` |
| **Database** | Supabase Postgres `mwaijzxuyicysvimzspx`, `ap-south-1` (Mumbai) |
| **Auth** | Firebase `altuscorp-e7140` — **29 users**, rebuilt 2026-09-04 evening from `employees.firebase_uid`, plus Rashmi's created by hand 2026-09-08. 20 active / 9 deactivated. Everyone except Rohan and Rashmi has **no password set** and must use Forgot Password. |
| **Email** | Resend, `mananvasa.com` verified |
| **Scale** | 216 pages · 145 API routes · 240 tables · 234 migrations · 35 crons |

### Deploys — `git push` works again as of 2026-09-08

**Fixed.** A plain `git push origin main` now builds and goes live on its own.
The CLI workaround below is no longer needed; it is kept only because the same
symptom will return the moment someone commits from a machine with the old
identity.

**What was wrong.** Vercel Hobby only builds commits whose author is authorised
on the Vercel account. Every commit in this repo was authored
`Rakesh Dubey <support@unleashed.in>`, which GitHub resolves to the login
`MananVasa-support` — the old Unleashed workspace identity, not a collaborator
here. Vercel created each deployment and immediately halted it:
`readyState: BLOCKED` with a 0 ms build, showing in `vercel ls` as `UNKNOWN`.
Nothing was wrong with the code, the branch, or the git connection, so
disconnecting and reconnecting the repo would not have helped.

**The fix** — repo-local, so other projects on the machine keep the old identity:

```bash
git config --local user.email "324000021+Altus-corp@users.noreply.github.com"
```

That is the GitHub noreply address for account id 324000021 = `Altus-corp`, the
account that owns both the repo and the Vercel project. **Run this on every
machine you commit from**, or pushes from that machine start getting blocked
again for the same reason.

**Verified:** commit `b1c85885` — same repo, same branch, everything identical
but the author — went `BUILDING → READY` and took `os.altuscorp.in`.

**Still true: `git push` itself is unreliable on the office machine.** It has
stalled for 10+ minutes on a single 2.6 KB file while `git fetch` stayed fast.
When that happens, land the commit through the GitHub Contents API instead
(`gh api -X PUT repos/Altus-corp/Altus-OS/contents/<path> --input body.json`
with `message`, base64 `content`, `branch`, and `sha` when replacing a file),
then `git fetch && git reset --hard origin/main` to re-sync. Commits made that
way are authored by `Altus-corp`, so they deploy normally.

**Old CLI fallback**, if the git path is ever blocked again: copy the tree
excluding `.git` (keep `.vercel/`), then `vercel deploy --prod --yes` from the
copy. `vercel redeploy <url>` re-runs EXISTING source, so it will **not** pick
up code edits. A `Blocked`/`UNKNOWN` deployment cannot be redeployed (400) —
pick a `● Ready` row.

**Git push once hung** because `credential.helper` was Git Credential Manager,
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

### 10. TWO undocumented delete guards live only on the database

Neither is in this repo — no migration, no code. Both were installed directly on
the Postgres instance during the 2026-09-04 incident response, and neither
definition has ever been read back. **A database rebuild would silently lose
both.**

**`delete_guard`** blocks bulk `DELETE`s and raises a message carrying `app=`,
`addr=`, `user=` and the offending query. It fired on 2026-09-05 blocking a
`DELETE` of 224 `employee_events` rows during an attempted employee delete,
which is what prompted the offboarding work.

**`emergency_no_employee_delete`** — found 2026-09-08 — is stricter: it blocks
**every** `DELETE` on `employees`, one row or many, via
`block_all_employee_deletes()`:

```
P0001: INCIDENT LOCK: employee deletion is disabled while the security
incident is being contained. (row: <uuid>)
HINT: To offboard someone, set is_active=false. To lift this lock:
      drop trigger emergency_no_employee_delete on employees.
```

**Do not follow that hint.** Dropping the trigger leaves the table unprotected
from then on and nobody remembers to put it back — and this lock is the reason
no employee row has been lost since 2026-09-04. If a delete is genuinely
warranted, disable and re-enable it inside **one transaction**, so a failure
anywhere rolls the trigger back on with everything else:

```sql
BEGIN;
ALTER TABLE employees DISABLE TRIGGER emergency_no_employee_delete;
-- ... the deletes, in deleteEmployee()'s order ...
ALTER TABLE employees ENABLE TRIGGER emergency_no_employee_delete;
-- verify tgenabled = 'O' in pg_trigger BEFORE committing
COMMIT;
```

Better still, check whether you need the delete at all. On 2026-09-08 the lock
blocked a delete that turned out to be unnecessary — see the Rashmi entry in
that day's changelog.

**Three things to do:** dump `pg_get_functiondef` for **both** and commit the
definitions so they survive a rebuild; decide whether the incident lock should
be lifted now that the incident is contained, or kept permanently; and consider
formalising `delete_guard` as a proper append-only rule on the audit tables
rather than a hand-rolled bulk-delete heuristic.

Related: the app connects as the Postgres **superuser** (`user=postgres` in the
guard's own message). A least-privilege application role would make guards like
this unnecessary for the app path and genuinely effective against everything
else.

### 11. ✅ RESOLVED 2026-09-08 — Rashmi Tripathi restored

Her `employees` row, her `employee_departments` → Operations membership and a
working Firebase login are all back. See the 2026-09-08 changelog entry for what
was done and for the two traps found along the way (offboarding does not release
an email address; the app resolves the signed-in user by `firebase_uid`, not by
email). Her original row id `b60094c4-513f-48ff-84e6-8fb5de54d615` was preserved
throughout; her Firebase UID is new.

---

## Changelog

### 2026-09-16 (night) — DCC rebuilt from the account holder's brief

Branch `Vinal`. The module was torn down earlier today (entry below) and is now
rebuilt against a written specification: **[`docs/DCC-SPEC.md`](./docs/DCC-SPEC.md)**,
which is authoritative and supersedes every earlier DCC note in this repo. Read
it before changing anything here.

**Three doors, generated from one list.** `/dcc` (My Day) · `/dcc/dashboard` ·
`/dcc/masters`, first under Employees. The rail and the module's own quick-nav
row both render `lib/dcc/nav.ts`, so they cannot advertise different doors —
which is exactly how the old module ended up offering a page that no longer
honoured it.

**There is no SP1 door and no Call Log door** (account holder, 2026-09-17): the
SP1 sheet *is* the dashboard, and the fifteen numbers are typed into that sheet,
so either would have been a second route to one screen. `/dcc/sp1` and
`/dcc/call-log` are now **redirects** to `/dcc/dashboard`, kept only because both
addresses are in bookmarks and in mail already sent.

**The SP1 half is new, and it is the half that was missing.** The old module
could report call outcomes but had no way to ENTER them, so the report was
permanently empty and looked broken.

- `lib/dcc/sp1.ts` owns the fifteen outcomes, their eight sheet colours, the
  Connected partition and all five ratios — **once**, so the screen, the grid and
  the email cannot disagree about what "Connected" means.
- The **top of `/dcc/dashboard`** is Jeevan's grid, full width: Monday→Saturday,
  a Weekly Total, **no Sunday column**, rows numbered 1–23, drawn as a
  spreadsheet because it is read aloud beside the sheet it replaces. The
  WMS-style sections sit under it and share its window, which is measured in
  weeks (`?weeks=1|2|4`, `?week=` steps back) so the two halves of the page can
  never describe different stretches of time.
- **You type into that sheet** — it is the call log. A cell is open only when one
  person is selected and you may fill for them, the day has not closed at
  11:59 pm IST, and the table exists; `saveCallLog` re-checks all three, so an
  open cell is an affordance and never a permission. Row 16 and the Weekly Total
  move as you type, rebuilt by the same `buildSp1Grid` the email uses.
- `dcc_call_logs` (**migration 0235**, new) stores one count per person per day
  per outcome, uniquely keyed, with no CHECK on the outcome — a sixteenth row on
  the sheet is data, not a migration.

**Two decisions worth challenging, both in one constant each:**

1. **Rows 1–11 count as Connected**, including "Not Interested" and "DND" — a
   person declining is not a call that failed to reach anybody. Rows 12–15
   (No Busy, Ringing, Call Back, Wrong Number) did not reach a person.
2. **A ratio with no denominator prints an em-dash, never `0%`.** The sheet's
   `#DIV/0!` is the bug being fixed, not the behaviour being copied — 0% reports
   a real failure on a day nobody worked, and would then be averaged into the
   weekly total and the ranking. The weekly column is likewise **recomputed from
   summed counts**, never by averaging the days.

🟡 **Jeevan's reference sheet has drifted from the calendar.** It labels
13-Sep-2026 "Monday"; that date is a **Sunday**. The sheet's Day row is one step
off, so its six-day blocks are Sun–Fri while claiming Mon–Sat. This app derives
the weekday from the date, so its columns will not line up with the sheet's
labels. Worth telling Jeevan — the structure (six working days, then a weekly
total, Sunday omitted) was copied; the typo was not.

**The rest of the brief.**

- **10 pm report** (`30 16 * * *` = 22:00 IST) now LEADS with the SP1 tables and
  puts the compliance summary under them. Distribution is unchanged and still
  tested: each person their own day, every Team Lead everyone below them
  transitively, the owner everybody. Still **preview-only** until
  `DCC_DAILY_REPORT_LIVE=true` — it is a nightly mail to the whole company.
- **11:59 pm IST lock** governs the call log as well as compliance entries, via
  the same `checkDccEntryWindow`, so "yesterday" means one thing module-wide.
  Only `dcc.edit_past_entries` (Manan Sir) reaches a closed day.
- **Team Leads author for their downline**; a compliance Manan authored is his
  alone to delete (`dcc.protected_kpi_author`, fails closed toward the ordinary
  rule). The Person view shows the author on every row so the refusal is legible
  before anyone tries.
- **DCC Masters** mirror Master JD / Person-specific JD: a Position tab whose
  saves reconcile every holder, and a Person tab with a searchable dropdown
  beside the heading — no left rail of names.
- **Google Calendar** sync is back on the entry write and the nightly cron.
  **The connect-gate is NOT back**: calendar sync is a benefit of connecting, not
  a toll on entering the app.

**What was reused, and why.** Everything visible is new. The pure, tested
calculations were not re-derived: the 11:59 pm window, the delete guardrail, the
schedule maths, the position-template reconciler, the report distribution
planner and the calendar writer. They are invisible, and several are tied to
unique indexes that already exist in the database — rewriting them blind would
have added bugs, not removed them.

🔴 **Three migrations are outstanding** and each feature degrades to an explicit
"not set up yet" notice until its own is applied: **0229** (calendar events),
**0230** (masters), **0235** (call logs, new).

Verified: `npx tsc --noEmit` clean, `next build` clean with all five routes and
both crons registered, ESLint clean on every new file, and the full unit suite
green — **3146 passed, 7 skipped**, including 40 new tests across
`dcc-sp1`, `dcc-sp1-email` and `dcc-nav`.


### 2026-09-16 — DCC removed from the Employees module

Branch `Vinal`. On the account holder's instruction ("remove all the dcc section
from employees completely"), the Daily Compliance Checklist is gone from the web
app. It will be rebuilt from scratch; this is a clean teardown, not a redesign.

**What was deleted.** The four rail entries under Employees; the whole
`app/(app)/dcc/` route tree (board, dashboard, masters, ranking, SP1); all of
`components/dcc/`; the three crons (`dcc-reminder`, `dcc-daily-report`,
`dcc-calendar-sync`) and their `vercel.json` schedules; the DCC branch of the
permission matrix; the `/dcc` workspace mapping; and the inbox deep-link for
`dcc_fill_reminder`.

**Three gates came out with it**, and this is the part worth knowing:

- The **post-login wall** in `app/(app)/layout.tsx` and `app/(app)/hub/page.tsx`
  no longer has a DCC leg — not the "fill your DCC" wall, not the manager review
  step, and not the **Google Calendar connect prompt**, which was mounted ahead
  of every other gate and so was the first thing a person with DCC KPIs met on
  login. The plan gate and the manager assign gate are untouched.
- The **DCC punch-out block** is deleted from both the web action and
  `/api/mobile/attendance/punch`. It had been force-off inline since
  2026-07-27, so nothing changes in behaviour — but the dead branch and its
  `isDccFilledFor` import are gone, and the mobile client's `needsDcc` response
  can never fire again.
- **Connecting Google Calendar no longer backfills DCC days.** The OAuth
  callback and profile "Sync now" push tasks only; `syncGoogleCalendarNow` lost
  its `dccChanged` field and the toast lost its second sentence.

Also unwired: salary-profile edits and the salary import no longer call
`scheduleDccMasterReconcile` when a designation changes.

**What deliberately stayed.**

- **Every `dcc_*` table and every DCC migration.** Nothing was dropped and no
  data was touched. `0235_dcc_call_logs.sql` — written this session, never
  applied anywhere — was deleted along with its `dccCallLogs` Drizzle table,
  because it existed only for the SP1 grid that is also gone.
- **The Android app and `/api/mobile/dcc/*`.** They are a separate client and
  were not in scope. They still read and write DCC normally, which is why
  `lib/dcc/{access,util,write,entry-lock,item-lock}.ts` and `lib/queries/dcc.ts`
  survive.
- **`lib/dcc/{dashboard,daily-report}.ts` and `lib/queries/dcc-dashboard.ts`.**
  Despite the folder they live in, the Hand-holding week calendar and
  People Allocation import `addDaysYmd`, `buildPersonReports` and `OUTCOME_LABEL`
  from them. Deleting the folder wholesale would have taken those screens down.
- **The JD "Add To → DCC" box.** It is in Operations, not Employees, and the
  `push_dcc` / `for_dcc` flags it writes have never been read by anything (see
  the 2026-09-12 entry). Left alone as a separate decision.

Verified: `npx tsc --noEmit` clean, `next build` clean, ESLint clean on every
touched file, and the full unit suite green (3085 passed, 7 skipped).


### 2026-09-16 — Initiator Status: renamed, gains Archived, and N/A for self-raised work

Branch `Vinal`. Three changes to the ruling column WMS Tasks, Goals and
Projects share, on the account holder's instruction.

**1 · Renamed.** "Approver / Initiator Status" is now **"Initiator Status"**
everywhere it is read — the three column headers, the chip's accessible name,
the column-picker entries, and every refusal message the server sends back.
A label only; nothing in the database was renamed.

**2 · Archived is a sixth verdict.** The list is now Pending · Approved · Not
Approved · On Hold · **Archived** · Cancelled. Like On Hold and Cancelled it is
a decision ABOUT the work rather than a judgement of finished work, so it does
not wait for the Doer Status to reach Done — only Approved and Not Approved do.

**3 · Self-raised work reads "Not Applicable".** When the initiator IS the doer
— somebody raised the task, goal or project row for themselves — there is no
approver to wait on, so the column says so instead of sitting on "Pending"
forever. An admin or super-admin may still overrule; nobody else can, including
the raiser and their manager.

**The bug this fixed on the way.** Goals and Tasks had disagreed about
self-raised work. Goals set `isDoer: false` for the raiser, which let somebody
approve their own goal; Tasks refused. Both now go through one explicit
`isSelfRaised` flag on `ApproverActor`, set from the module's own two ids rather
than by fudging `isDoer` — which is what let the two drift apart unnoticed.

Super-admin now rules on tasks as it already did on goals: the WMS task action
checked `employees.is_admin` only, so a super-admin who was not also flagged
admin was refused.

**Migration `0234_initiator_status_archived.sql` — NOT YET APPLIED.** Until it
runs, picking Archived fails at the database: `tasks.approval_status` is a
Postgres enum and the two goal side tables carry a CHECK. The file is
idempotent and safe to run before or after `0231` (the goal tables are only
touched if they exist). The `project_nodes` constraint is re-added **NOT
VALID**, exactly as `0204` wrote it — that table has rows older than the
constraint which were never checked, and a validating constraint would scan the
table and fail on one of them.

Verified: `npx tsc --noEmit` clean in source; the full unit suite passes.


### 2026-09-16 — The JD frequency picker becomes Google Calendar's, for real

Branch `Vinal`. The Job Description form's **Frequency** section now asks the
question the way Google Calendar asks it, on the account holder's instruction.

**What was wrong**

The menu was a fixed list — "Weekly on Saturday", "Monthly on the second
Saturday", "Annually on [Date]". Google's list is a set of SENTENCES ABOUT THE
START DATE, so ours was right one day in seven: a job starting on a Wednesday
offered to repeat weekly on Saturday, and `[Date]` was a literal placeholder
that was never a date. `Custom…` was a free-text box — a label nobody parsed,
which `isDueOn` deliberately never fires, so a "custom" JD had to be pushed by
hand forever.

**What changed**

- **The list is derived, not fixed.** `frequencyOptionsFor(startDate)` speaks
  the seven about the day picked — "Weekly on Wednesday", "Monthly on the third
  Wednesday", "Annually on September 16". A date in the last week of its month
  reads "last", not "fifth".
- **One "Starts on" date** replaces the form's three date inputs (the "once"
  date, the "annually" date, the interval anchor), exactly as the calendar has
  one. It anchors the whole menu.
- **`Custom…` opens Google's dialog** — "Repeat every N day/week/month/year",
  weekday chips, day-of-month vs nth-weekday, and Ends (Never / On a date /
  After N occurrences). It is the SAME dialog the task Schedule section opens,
  lifted to `components/recurrence/custom-recurrence-dialog.tsx`, with the
  vocabulary behind it in `lib/recurrence/google-recurrence.ts`. Two copies of
  "Monthly on the third Wednesday" is two chances to drift, and the drift is
  invisible — each screen looks right on its own.
- **A new recurrence shape, `{ kind: "rrule", rule, anchor }`**, carries what
  the dialog can now say. `recurrence` is jsonb, so there is **no migration**.

**Two traps worth knowing**

- **The presets are NOT RRULEs.** Each maps to the structured shape it always
  mapped to. `FREQ=DAILY` is seven days a week; this firm's "Daily" is Mon-Sat,
  because a task firing on the weekly off becomes an overdue row nobody can
  clear. Only `Custom…` produces an `rrule`.
- **`isDueOn` matches the pattern directly; it does NOT generate occurrences.**
  `lib/recurrence/rrule.ts` caps generation at 200 to stop a runaway rule
  spawning rows. Used as an oracle, that cap would make a daily job anchored a
  year back answer "not due" for every day after the 200th — the push job
  stopping silently in month seven. There is a test pinning a date two years
  out.

The server action **parses** the rule rather than shape-checking it: an RRULE
the generator cannot read is a JD that never comes due, the same silent
months-later failure as a dateless "Does not repeat".

Verified: `npx tsc --noEmit` clean in source; the JD, RRULE and JD-bulk unit
suites pass (80 tests), including 12 new cases for the rrule shape —
interval-counted-in-weeks, UNTIL, COUNT across a partial first week, the
200-occurrence cap, and an unreadable rule firing never.

### 2026-09-22 — Client Engagement: drag-to-assign finished, onboarding nudge removed

**Drag and drop on the Overview board (finished from a half-done 2026-09-21
working tree).** A card can be dragged onto another person's lane; the drop
calls the SAME `ceAssignAccount` as the Assign / Transfer button, so it is
manager-gated on the server, moves the account's calls, reports clashes and
writes the audit row. The button stays as the keyboard/touch path and the only
way back to Unassigned. While a drag is in progress every active member gets a
lane, so somebody's FIRST account has somewhere to land. The capacity bar now
leads with Unassigned, five cards to a row.

**Bug in that work, fixed: a hydration mismatch on Overview.** dnd-kit numbers
its accessibility ids from a module counter that runs independently on the
server and in the browser, so the page hydrated with
`aria-describedby="DndDescribedBy-0"` against `-4` and React threw the subtree
away (visible as the dev error overlay; the board still worked by luck). The
fix is a stated `id="ce-accounts-board"` on `<DndContext>`. Console is clean
now. Verified in the browser: handles present, a plain click still opens the
account, a drag assigns, the button returns it to Unassigned — 5/5.

**The onboarding nudge is gone.** "Please complete your Onboarding Form" floated
over every page; the account holder asked for it to be removed everywhere. The
single `<OnboardingNudge />` in `app/(app)/layout.tsx` was removed (import too);
the component is kept and says how to remount it. Checked on /hub,
/people-allocation and Client Engagement. The onboarding form itself, and the
Portal / HR record prompts for it, are untouched.

**CORRECTION to the 2026-09-19 entry below.** Turning the dev slow-query logger
off (`SLOW_QUERY_MS="off"`) did NOT fix the :3000 hangs — they recurred on
2026-09-22 with it still off (4 header queries stuck `active/ClientRead`, dev
server at 0 CPU). Three clean runs on the 19th were luck, not proof. The cause
is still open; the logger is only a suspect. Restarting the dev server is still
the only known cure, and `.next/dev/types/validator.ts` can also be left
half-written by a killed server, which makes `tsc` fail in generated code —
delete it and reload a page to regenerate.

### 2026-09-19 — Client Engagement: review fixes, full UI test pass, and why :3000 kept hanging

**Asked for, and done.** Every change below was checked on :3000 with scripted
browser runs (25/25 checks as Manan, 9/9 permission checks signed in as Jeevan).
The screenshots are in the account holder's `Desktop\Client Engagement` folder.
- No title bands (`PageCommandBar`) on any Client Engagement tab.
- Calendar: only booked calls get a box. Free time is no longer drawn; clicking
  empty space still schedules there. Call names may use two lines.
- Emp Grid: one card per person, stacked, with a shared `<colgroup>` so columns
  line up down to the G-Total. Unassigned is shown in red.
- PCA Grid: the matrix is P | C | Total (P + C) | A. Ambassadors are never added
  into a total, and the board's "All" footer follows the same rule. The board is
  now one card per person in a wrapping grid, because 9 table columns could not
  fit with the sidebar open.
- References: Status sits under the progress bar so the table fits; +1/−1
  update instantly (optimistic) and roll back on failure.

**Bugs found by testing, and fixed.**
- *Page would not scroll with the cursor over a table.* The unlayered global
  `:where(.overflow-x-auto…) { overscroll-behavior: contain }` beats any
  Tailwind utility, so `overscroll-y-auto` silently lost. The fix is the new
  unlayered `.scroll-x-only` class in `globals.css`; use it for any sideways-only
  table wrapper.
- *A newly scheduled call "vanished".* The start date defaulted to today, so a
  Thursday call made on a Saturday started next week. It now defaults to the
  Monday of the week on screen, and the toast says when the first call is after
  that week.
- *A clash message pointed at an invisible call.* It now names the clashing
  call's start date when that is later.
- Removed a `router.refresh()` after every save. `revalidatePath` in the action
  already returns fresh data, and the second fetch could race it.

**Why :3000 kept hanging (not Client Engagement).** The hangs were header
queries (unread-notification count, task count) left "active / ClientRead" on
Supabase. The dev-only slow-query logger (`lib/db/slow-query.ts`) forces each
lazy postgres-js query to start itself. With `SLOW_QUERY_MS="off"` in
`.env.local` (local only), three full-speed test runs caused **no** hang, where
before every run did. The file is untouched; production never enables the
logger unless `SLOW_QUERY_MS` is set. **Worth fixing properly** before anyone
sets that variable anywhere real.

**Also:** a stale 8.4 GB Turbopack cache (`.next/dev/cache/turbopack`) kept
bringing back an old route table, so every page under `/operations/*` returned
404 after a restart. Deleting the cache folder fixed it; it is safe to delete.

Test data is still in (`scripts/ce-test-data.mjs --remove` clears it) and is
back in its seeded state. The Activity log keeps the test runs' entries.

### 2026-09-18 — Client Engagement rebuilt from scratch (0238)

The first version (2026-09-16 entry below) was not approved. It is quarantined
in `_archive/client-engagement-2026-09-18/`. **Those files were never committed,
so that folder is their only copy**; see its README.

**Decisions (account holder, 2026-09-18):** own `ce_*` tables rather than
Hand-holding's `pa_*`; call types are exactly HH, Tool, Check-in and Reference;
only **Manan and Ruchita** assign out of Unassigned or transfer. Rashmi is out,
and so is every other admin.

**Tabs** (`/operations/client-engagement/…`):
- **Overview**: capacity bar (active accounts per person against their cap,
  green / amber / red, plus the Unassigned pool); numbered category tabs
  (Retainer, Ambassadors, PS with a cohort filter, BSS, Corporate, Reference
  Pipeline); Active | Inactive-and-on-hold split with a swimlane per person.
  Business status colours use the brief's exact hexes.
- **Calendar**: one person's week, 10 AM–8 PM only. Admins, super-admins,
  Manan and Ruchita pick anyone; everyone else sees their own. Free gaps are
  drawn and clickable. Inactive clients' calls are hatched and don't count as
  busy. The person's Hand-holding calls are overlaid read-only via
  `pa_people.employee_id`. Team bandwidth table below for admins. Batch field
  appears only for PS/BSS.
- **Emp Grid**: `Sr | Name | (Batch) | mins | (calls)`. Total row leaves the
  name empty and puts the participant count under Batch, where the sketch puts
  it. G-Total at the bottom.
- **PCA Grid**: matrix (people + Unassigned × P / C / A / All: count, weekly
  time, calls), plus the sketch's board with P / C / A / All buttons.
- **References**: quota per client, collector filter, One Time / Every Week,
  +1 / −1. Weekly reminder cron `/api/cron/ce-reference-reminders` runs
  Mondays 04:00 UTC, idempotent via `last_reminded_on`. New notification kind
  `ce_reference_reminder`.
- **Team & Log**: roster (login link, role, cap) and the audit log.

**Rules live in pure `lib/client-engagement/*`**, re-checked in the actions.
Going On Hold moves an account to Inactive without writing anything (derived),
so its coach is kept. A transfer moves the account's calls and reports any new
overlaps. Returning an account to Unassigned is refused while it has calls.

**Migration:** `db/RUN-IN-SUPABASE-0238.sql`, additive, one transaction,
re-runnable. It seeds the 8 named people. **Not yet applied**; until then every
tab shows a "needs its tables" notice. Validated on in-memory PGlite: runs
twice cleanly, and every CHECK refuses what it should.

**Verified:** `tsc --noEmit` clean; ESLint clean on all new files;
`tests/unit/ce-v2.test.ts` 24 new tests; full unit suite 3422 pass. The two
`device-exemption-login` timeouts pass when that file is run alone.
**Not verified:** anything in a browser. localhost:3000 was hanging on every
authenticated page all session (before any of this was written), and the
tables are not on Supabase yet.

### 2026-09-17 (night) — Exec Calendar: hover cards, the window editor, drag, and the sheet importer

The last four items of §6/§2A/§1.

- **Hover quick-card.** At week density a one-hour block shows a title and, if
  lucky, its times. The card gives category, duration, client, batch, location
  and notes on hover — the READ; the drawer stays the write. It flips to the
  left of the cursor near the right edge, because Sunday 20:00 is exactly where
  it would otherwise fall off the screen.
- **The window editor** (`exec_calendar_prefs`). Per PERSON, not per browser: a
  window in localStorage is a different calendar on the laptop and the phone,
  and the one you are not looking at is the one hiding an early block. Presets
  for the working day, office hours and a full 24h.
- **Drag to move and resize.** Pointer handlers bind to the WINDOW once a drag
  starts, not to the block — the cursor leaves the block it is dragging, which
  is the point of dragging, and a handler on the block drops the gesture there.
  A dashed ghost follows the pointer; on release the move goes through
  `saveExecEvent`, the SAME action the drawer uses, so a dragged block is
  validated exactly like a typed one. Dragging onto protected time is refused,
  toasted and the block snaps back.
- **The sheet importer** (`lib/exec-calendar/import.ts`). Paste a copied block
  of the master sheet — tab-separated, times down the first column, dates across
  the top.

**The importer's one important behaviour:** in the sheet a long block is not one
cell, it is the SAME TEXT REPEATED down every row it covers ("Manan Sir Break"
in fifteen consecutive cells). The parser collapses runs of identical text in a
column into ONE block spanning first row → end of last. Without that, importing
one week yields hundreds of one-hour fragments. 17 tests cover it, including the
collapse, the gap that must NOT merge, and the year the sheet leaves out.

`importExecBlocks` deliberately does **no conflict check**: the sheet is the
record of what happened, a decade of it contains overlaps, and refusing them
would import a version of history that never occurred. The protected-time
refusal exists to stop somebody booking over it in FUTURE; an import is a
transcription. Re-pasting is idempotent by (day, start, title).

**UI rule adopted:** every layout is now checked with the global sidebar BOTH
collapsed and open. The toolbar squeezed at ~1120px and wrapped "New block" onto
two lines; controls now carry `shrink-0 whitespace-nowrap` and the prose takes
the slack, so rows wrap between groups and never inside a button.

**Verified:** typecheck clean · 3,090 passing (same five pre-existing failures) ·
importer, window editor and toolbar shot at 1500px and 1120px with a clean
console.

**Still unpressed:** Stamp it, Import, and a drag — all three write through
actions that cannot be invoked from a script, and `look.mjs --live` refuses to
click against the real database. Their inputs are unit-tested; the writes are not.

### 2026-09-17 (evening) — Exec Calendar: the team view, masking proven, routines

**§5 is now real, and testing it found a bug.** The page only ever showed your
own week, so masking had nothing to prove itself against. `?owner=` opens
somebody else's calendar (picker in the toolbar), read-only, with every row put
through `maskAll` ON THE SERVER before it is serialised.

Checked by signing in as **Rudra Thukarul** and opening **Mansi Medhekar's**
week: the five Exercise blocks and the executive break read `Busy · Reserved` in
neutral grey — title AND colour gone — the private appointment is absent
entirely, the public client work keeps its full detail, and there is no New
block button. (Rutvisha could not be used: she has no `employees` row at all,
only `pa_people`, which is the same reason the HR letters fix needed Mansi.)

**The bug that only shows up from the other chair:** the variance alerts are
computed from what the VIEWER can see, so a masked calendar always looks like it
has no personal time — the panel told a colleague *"Personal & recovery is 0%,
under the 15% floor"* about somebody who exercises every morning. Alerts are now
suppressed when reading someone else's calendar, and the totals are labelled
*"Partial: blocks you cannot see are counted as reserved time"*. The mix is the
owner's to judge, on their own complete data.

**Routines (§4B) have a UI.** `components/exec-calendar/routine-dialog.tsx` —
weekday toggles, a time range, a date range, visibility, and four presets the
brief names (morning habit, weekend cohort, consulting day, executive break).
`?routine=1` opens it.

`stampExecRoutine` writes REAL BLOCKS rather than a rule re-evaluated on every
read, which is what lets a single Tuesday be moved or deleted and stay that way.
Its day-selection came out of the action into `routineDays()` in grid.ts — a
loop over dates with an inline weekday filter is exactly the arithmetic that is
wrong at a month boundary and is noticed only after a quarter is stamped one day
short. Now 7 tests cover it, including the year boundary.

**Verified:** typecheck clean · 3,073 passing (the same five pre-existing
failures) · owner view, masked view, editor drawer and routine dialog all shot
with a clean console.

**Not verified:** the stamp WRITE itself. `look.mjs --live` refuses to click
against the real database, and a server action cannot be invoked from a script,
so the button has not been pressed. Its inputs (`routineDays`, `checkConflicts`)
are unit-tested; the insert is not.

### 2026-09-17 (later) — Executive Master Calendar: 0231 applied, and it writes

`0231` ran against `ifcdpjbdinvmtewmgceg`; all three tables are present. The
NOTICEs it printed are `DROP CONSTRAINT IF EXISTS` on tables being created in
the same transaction — nothing was wrong.

**Now interactive.** `app/(app)/events/actions.ts` adds `saveExecEvent`,
`deleteExecEvent`, `saveExecGridPrefs` and `stampExecRoutine`. Two things are
re-checked on the SERVER rather than trusted from the form:

- **Ownership is in the WHERE clause** (`id = ? AND owner_id = me.id`), not a
  separate `if`. A crafted id matches no row instead of relying on a guard that
  a later refactor can drop.
- **Protected time** goes through `checkConflicts` again with the real diary.
  The drawer warns; the action refuses.

`stampExecRoutine` GENERATES rows rather than expanding a rule at read time —
one deleted Tuesday has to stay deleted, and a rule evaluated on every read
cannot remember that. It skips days that already carry the routine and days
where the slot would land on protected time, and reports both counts instead of
aborting the whole quarter over one Tuesday.

**The drawer** (`components/exec-calendar/event-editor.tsx`) puts the CATEGORY
first, because in this module the category decides behaviour — protected or not,
client picker or not, banner or block. Duration is derived from the clock and
shown live, never typed. `guessCategory` suggests a category from the title
while it is still a new block, which is the import path for sheet cells.

**It has a URL.** `?new=YYYY-MM-DD` opens the drawer on a fresh block, so another
screen can link straight to "book this", and the drawer is reachable without a
click — which is also how it was verified, since `look.mjs --live` refuses to
click against the real database.

**Keyboard** (§6): ← → step the period, `t` today, `n` new, and `e/b/c/w/s/o/m`
retag the open block. All ignored while a field has focus, so typing "b" in a
title does not silently retag it.

**Demo data.** 17 blocks were inserted into `exec_calendar_events` for Mansi
Medhekar (week of 2026-09-14) to prove the read → mask → layout → render path
with something real: a 07:00 habit, client accounts, a 15:00–20:00 cohort, BNI,
TDS Returns and an all-day marker. They show the analytics working — 33h 30m
booked, 31.9% of the open day, client delivery 31.3% / cohorts 25.4% / personal
20.9%, and no variance alert because both floors are met. **Undo:**

```sql
delete from exec_calendar_events where owner_id = '733b3a89-0f38-41d9-8bbd-2a097b74d325';
```

**Still to build:** the routine UI (the action and table exist, nothing calls it
yet), hover quick-cards, the window editor (`saveExecGridPrefs` exists, no UI),
drag to move/resize, and the sheet importer that `guessCategory` was written for.

### 2026-09-17 — Executive Master Calendar: the old module archived, the new core built

**The Monthly Events Master was quarantined, not deleted.** Its whole surface —
the `/events` routes, the 16 grid components, two module-only helpers — moved to
`_archive/monthly-events-2026-09-17/`, which is git-ignored and excluded from
`tsconfig`, so nothing there compiles and nothing reaches main. Git history is
the real archive; the folder is the convenience copy. The nav area and the
permission node were lifted out into `REMOVED-*.txt` beside it.

**What deliberately stayed, and why it would have broken.** `event_holidays` and
`components/events/holidays/` are the company HOLIDAY MASTER, read by
`lib/queries/holidays.ts` → HR Holiday List, `/holidays`, the mobile holidays
API, five task/manager reports and attendance's working-day counts.
`lib/monthly-events/types.ts` has 8 importers outside the module and `access.ts`
has 6. The four `/api/mobile/events/*` endpoints serve the shipped Android app.
**No table was dropped** — all 30 `calendar_events`, 28 `event_holidays`, 11
categories and 4 batch types are untouched, so the archived screens would work
again the moment the files move back.

**The new module took over `/events`**, so every old link lands on its
replacement instead of a 404.

**Built so far — the core the rest of the spec sits on** (`lib/exec-calendar/`):

- `taxonomy.ts` — the SEVEN fixed categories, in code rather than a table
  anyone can extend. Behaviour hangs off the category: protected time is
  protected because it is Personal & Wellness. Colours are palette TOKENS, never
  hex. `guessCategory` classifies free text ("BSS 90 S21" → cohort, "TDS
  Returns" → ops) so a decade of sheet cells can be imported without re-tagging.
- `grid.ts` — the CONFIGURABLE window, defaulting to the brief's 07:00–22:00
  instead of the old hard-coded 24 hours; ISO week numbering that gets the
  year boundary right (1 Jan 2027 is week 53 of 2026); month-as-whole-weeks for
  the dual view; and `layoutDay`, which renders 15:00–20:00 as ONE five-hour
  card with overlap columns rather than ten stacked cells.
- `analytics.ts` — §4D. Percentages are of COMMITTED time, not of the window,
  with `windowShare` reported separately; all-day markers excluded so a festival
  month does not swamp the mix; variance alerts are FLOORS only and stay silent
  on an empty range.
- `privacy.ts` — §5. `public | busy | private`, masked ON THE SERVER before the
  row is sent. A `busy` block keeps its day and hours and loses everything else
  INCLUDING its colour, because a green 07:00 block every weekday tells anyone
  watching that the executive exercises before work. Booking over protected time
  is REFUSED for anyone but the owner; every other overlap only warns.

**Screens:** `/events` with three horizons — Week (the grid), Two months (the
signature-sheet view, two months either side of a separator with ISO numbers
down the gutter) and Year — plus the allocation panel and the legend, which is
rendered FROM the taxonomy so it cannot drift from the rules.

**Migration `0231_exec_calendar.sql` — NOT RUN.** Three new tables
(`exec_calendar_events`, `exec_calendar_routines`, `exec_calendar_prefs`),
entirely additive, nothing altered. Separate tables rather than columns on
`calendar_events` on purpose: that is a shared company calendar, and bolting an
owner and a visibility onto it would make every existing consumer responsible
for filtering private rows it never had to think about.

```bash
node --env-file=.env.local scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0231.sql --apply
```

Until it runs the page works: `lib/queries/exec-calendar.ts` catches the missing
table, renders an empty grid and says so in a banner rather than erroring.

**Tests:** `exec-calendar-grid` (33) and `exec-calendar-rules` (27) — 60 new,
all passing. Suite: 3,065 passing, the same five pre-existing failures.

**Still to build:** the editor drawer and hover cards, the routine engine's UI
(§4B — the table and generator are in the migration), client/CRM picker wiring
(§4A — the column and the query exist), keyboard navigation and tagging hotkeys
(§6), and the per-person window editor (§2A — `exec_calendar_prefs` is there).

### 2026-09-17 — Policies are readable by everyone; letters open again

**Every employee can now find the firm's policies.** The individual policy pages
(`/hr/policies/<key>`) were ALREADY open to all — `requireWorkspace("hr")`, which
every employee passes. What was staff-only was the LIST: the all-policies grid
opened from `/hr?policies=1` was gated behind `isHrStaff`, and that link only
appears on a staff lifecycle step. So the policies were published in the sense
that a page existed, and unfindable in the sense that mattered.

Two changes:

- `hr-console-home.tsx` no longer gates the grid on `isHrStaff`.
- **`/policies` now lists the authored policies too** — a "Firm policies" grid
  above the uploaded documents, one card per POLICY_CARD, linking to the policy
  page. That is the route every employee can already reach from the HR rail, so
  the policies are now discoverable without knowing a query string. The cards are
  passed from the SERVER: `lib/hr/policies/registry` also holds every policy's
  full text, which has no business in the client bundle.

**Editing did not open up.** `/hr/policies/<key>/edit` still calls
`requireHrStaff`. The Edit Policy button on the policy page was showing on
`isAdmin || isSuperAdmin` — a WIDER set than the route allows, so an admin
outside the HR department saw a button that bounced them straight back. It now
matches the route (`isHrStaff`).

**Letters were not broken.** Reported as "none of the letters are opening";
the cause was identity, not code: `/hr/letters/<key>` calls `requireHrStaff`, and
`DEV_USER_EMAIL` resolved to Vinal Patil — department "Apps" / Operations,
`is_admin=true`, which does NOT satisfy `isHrStaff` (department "HR" or
super-admin). On port 3002 the dummy admin passed that check, which is why it
worked until the switch. `.env.local` now points at the only HR-department
employee in the database (Mansi Medhekar); the previous value is in
`.env.local.bak-devuser`. **Local only — no permission was granted to anybody.**

**Verified in the browser, both sides of the rule:** as a NON-HR employee
(Vinal) all six firm policies are listed on `/policies`, POSH opens and can be
printed, exported and signed, and neither Upload nor Edit is offered; as HR
(Mansi) Edit Policy returns. Letters open and both new signatures render — see
the 2026-09-17 signature entry.

### 2026-09-17 — The real signatures, and why they had to be cropped first

Rutvisha's and Manan's scans replace the placeholders on every HR letter.

- **`hr-signature.png` is now Rutvisha's mark** — the HR desk standing signature,
  so it lands on every HR-signed letter (everything except ctc-breakup and
  appointment; see `signatoryOf`). Same filename, so no code changed.
- **`manan-vasa-sign.png` (new) is Manan's**, and backs BOTH Director letters
  (`PROPRIETOR_SIGNATURE_IMAGE`) and the Selection letter's founder block. The
  old `proprietor-signature.jpg` / `manan-sign.jpeg` are superseded and now
  referenced by nothing; they are kept so an already-issued PDF can be traced to
  the mark it carries. PNG rather than JPEG because the new scans have real
  transparency, which a JPEG cannot hold.
- **Two hardcoded paths became the constant.** `letter-editor.tsx` imported
  `PROPRIETOR_SIGNATURE_IMAGE` and then hardcoded the jpg path anyway, and
  `pdf.ts` did the same. Exactly the drift `firm.ts` warns about, and it would
  have left the Director's OLD signature on screen and in the PDF while every
  other path moved. Both now read the constant.

**The crop is the part worth remembering.** The sign-off renders in a FIXED box
— 66px on screen, 52pt in the PDF — with `object-fit: contain`, so it scales the
whole CANVAS, not the ink. Manan's scan was a 497x502 square holding a 369x151
signature: 30% of the height was ink, so it would have printed at about **20px
tall**, a third the size of the mark it replaced. Measured, not eyeballed.

`scripts/trim-signature.mjs` (new) crops a PNG to its ink plus 4%:

```
manan-vasa-sign.png   497x502 -> 399x163    ink 30% of height -> 93%
hr-signature.png      422x332 -> 417x238    ink 66% -> 92%
```

Run it on the next scan too; a signature that arrives centred in a big
transparent square is the normal output of a phone scanner app.

**Verified:** both files served by the app (200, `image/png`), byte-identical to
the scans before trimming, and **pdfkit embeds both re-encoded PNGs without
error** — the real risk, since the trimmer writes the PNG itself.

**Not verified:** how they look on a rendered letter. `/hr/letters/<key>` calls
`requireHrStaff`, and the local dev user (`DEV_USER_EMAIL=vinalpatil…`) is not in
the HR department, so the page redirects to `/hr`. Point `DEV_USER_EMAIL` at an
HR-department account to see one.

### 2026-09-17 — Policies: a named set of authors, and why the list is empty

**Who may publish.** `lib/hr/policies/access.ts` (new, pure) names Manan,
Ruchita and Rutvisha, and nobody else may upload or remove a policy. **Being an
admin is no longer enough** — `app/(app)/policies/actions.ts` used to allow
`isAdmin || isSuperAdmin`, and both flags are held by more people than should
hold the pen. Enforced in the server actions AND in the two mobile twins
(`app/api/mobile/policies/route.ts` and `[id]/route.ts`), which had their own
copy of the old rule; all four now import the one module, so the phone and the
browser cannot drift apart. Hiding the Upload button is the convenience; the
action is the control. Rutvisha matches by NAME only: on 17 September she had no
`employees` row at all (she exists in `pa_people`), so there is no address to
list — add it to `PUBLISHERS_BY_EMAIL` when she gets an account. The dummy admin
is admitted only while `DUMMY_MODE` is on, so port 3002 stays usable.

**The empty Policies page is not a regression.** Asked why the policies had
disappeared and when. They were never on this database:

| checked | result |
|---|---|
| `documents` rows under `hr-policies/` | **0** (1 document row in total) |
| objects in `documents/hr-policies` in Supabase storage | **0** |
| dummy seed | has never seeded a policy |
| `POLICY_STORAGE_PREFIX` | unchanged since the initial commit |
| the page, the loader, the workspace component | untouched since `bb1a178` |

So nothing deleted them. On port 3002 the list has always been empty unless
somebody uploaded one by hand, and `dummy:setup --reset` clears that. If real
policies exist they are in a different Supabase project — which fits the
dashboard refusing access to `ifcdpjbdinvmtewmgceg` on the same day.

**Tests:** `tests/unit/policy-access.test.ts` — 7, including the one that
matters, an admin being turned away.

### 2026-09-16 — Client Engagement: the call scheduler, the commitment calendar, per-lead books and DD Master

**What changed**

- **The Engagement Call Scheduler.** Every row in the Active / Inactive tables
  has a Calls button showing what it takes a week; the dialog is a row per call
  — day, from, to, type — with the length derived from the clock rather than
  typed, and the lead's week shown as it stands and as it would be after saving.
  The action (`ceScheduleCalls`) re-checks everything the form checks and
  refuses three things: a call outside 10:00–20:00 or ending before it starts, a
  call landing on another call the same lead already has, and anything that
  would take that lead past **30 hours** in the week the engagement is actually
  charged to. Scheduling needs an owner — an unassigned record says so.
- **The Commitment Calendar** (`/operations/client-engagement/calendar`).
  Monday–Sunday, 10:00–20:00 and nothing outside it, a block per call placed by
  its own clock, daily totals beneath and the week's total above, in bold red
  past 27 hours with the banner from the brief. `?lead=` and `?week=` are in the
  URL, so a particular week for a particular lead is a link. In the All-leads
  view a block is tinted by whose call it is (Manan black, Rohan/Mitul red,
  Ruchita/Rutvisha grey, Jeevan/Mohit dark grey). Calls with no times are listed
  in a "Not fixed" strip rather than dropped.
- **A lead's own book.** Clicking a name in the Emp Grid opens
  `?lead=…` underneath: their engagements per product, with the weekly duration,
  the number of calls, the commitment hours across the whole engagement, and a
  totals row saying how many engagements that is. The P / C / A headers carry the
  "+" from the notes, which opens the matching add form on Overview via `?add=`.
- **DD Master** (`/operations/client-engagement/dd-master`). The products, call
  types and batch numbers behind every dropdown, editable by the three people
  who may assign and readable by everyone. The lists START from the code
  constants, so a fresh database has full dropdowns and no row here can empty
  one; `ce_dropdown_options` then renames, retires, reorders or extends them.
  Retiring hides an option from the forms and leaves records that already use it
  alone — a batch that is over should stop being offered, not stop having
  existed. Built-ins can be renamed and retired but never deleted, because
  records point at codes. The scheduler's call types and the add forms' products
  and batches all read this list, and `ceScheduleCalls` validates against the
  same one, so the form and the server cannot disagree.

**Migration**

None new. This all runs on `0230_client_engagement.sql`, still **not run against
Supabase** — `db/RUN-IN-SUPABASE-0229-0230.sql` is the bundle to paste when you
are ready, additive and re-runnable. Until then these screens simply have
nothing to show; nothing breaks.

**Seed data**

`scripts/dummy-db-seed.ts` gained `seedClientEngagement`: three leads with
roster rows, eleven participants and clients (three unassigned, one on hold, one
on barter, one not started), two ambassadors, and calls that put Jeevan near the
27-hour line plus one legacy call with no times. **Untested — it needs
`pnpm dummy:setup --reset`, which needs the port-3002 server stopped first.**

**How to verify**

```bash
pnpm typecheck
pnpm vitest run tests/unit/ce-schedule.test.ts tests/unit/ce-dropdowns.test.ts \
  tests/unit/ce-workload.test.ts tests/unit/ce-metrics.test.ts
```

Verified in the browser on dummy mode (port 3002): the Calls button opens the
scheduler, Handholding is offered to a PS participant, saving reports "1 call
scheduled", the Calls cell reads 1h and the Calls-not-fixed badge drops to 0;
the calendar draws that call on Monday 10:00–11:00 in Jeevan's colour with the
day and week totals agreeing; the Emp Grid's "+" headers and lead links work and
the drill-down adds up; DD Master retires 110 and adds 111, and the add-participant
batch dropdown immediately shows 111 and not 110 (both then put back).

**Not verified**

- The 30-hour refusal and the clash refusal have unit tests but were not
  exercised through the UI — the dummy database has only one entity with calls
  on it. Seeding (above) is what makes that reachable.
- `seedClientEngagement` has never been run.

### 2026-09-16 — Broadcasts: annual + custom repeats, Teams audience, automatic WhatsApp, on-time publishing

**What changed**

- **Repeats gained Annually and Custom dates.** Monthly and annual repeats now
  keep the day of the month of their FIRST send (31 Jan → 28 Feb → 31 Mar, no
  drift), computed on the India wall clock. Custom repeats walk an explicit list
  of datetimes. All of it is pure and unit-tested (`lib/ecos/recurrence.ts`).
- **Teams are an audience.** The six standing teams (`lib/teams/roster.ts`) can
  be targeted; each resolves to that manager's whole branch through the existing
  `resolveTeamScopes`.
- **WhatsApp is automatic.** The channel sends the approved Meta template
  (`META_WHATSAPP_BROADCAST_TEMPLATE`, four variables — from, subject, summary,
  link) to everyone opted in, and records per person what happened in
  `broadcast_recipients.channel_outcomes`: sent, or skipped with the reason
  (not opted in / no number / template not configured), or failed with Meta's
  message. The broadcast page shows the counts and the reasons. The old
  `whatsapp_manual` panel still renders for broadcasts that were sent with it.
- **Scheduled broadcasts are meant to go out within about a minute**, not at the
  next daily run: the popup poll fires a throttled sweep after its response
  (`lib/ecos/publish-due-trigger.ts`), sharing one claim-based publisher with the
  cron (`lib/ecos/publish-due.ts`). **See the caveat below — this is unverified.**
- **Publishing is now race-safe.** `publishBroadcastCore` flips the status first,
  and only from an unpublished state, so a manual Publish and a sweep cannot both
  snapshot recipients and deliver.
- Composer dropdowns wear the app's chevron (`components/ui/chevroned-select.tsx`).

**Migration**

`0229_broadcast_recurrence_whatsapp.sql` — additive: `broadcasts.recurrence_dates`,
`recurrence_anchor`, `publish_claimed_at`; `broadcast_recipients.channel_outcomes`;
a partial index on due scheduled broadcasts. **Not run against Supabase.**

**How to verify**

```bash
pnpm typecheck
pnpm vitest run tests/unit/ecos-recurrence.test.ts tests/unit/ecos-whatsapp-params.test.ts
```

Verified on dummy mode: the composer offers One-time / Daily / Weekly / Monthly /
Annually / Custom dates with an Add-date list, the Teams chips appear under a
custom audience, the channel reads "WhatsApp" (not "manual"), and a broadcast
scheduled through the UI did publish by itself, snapshot its recipients, pop up
centre-screen, and record "not opted in to WhatsApp" for all 26 dummy employees.

**🔴 Unverified — on-time publishing**

How SOON a scheduled broadcast publishes was never measured. Two later attempts
sat unpublished for five minutes while the popup poll was demonstrably running
(36 polls, no popup on screen), and `/api/cron/ecos-publish` reported `due: 0`
for a broadcast that was overdue — so either those rows never left `draft`, or
they were claimed by a sweep whose publish failed and left the 10-minute claim.
The dev-server log would say which; the dummy database corrupted before it could
be read. **Anyone picking this up: schedule one broadcast a couple of minutes
out, watch the `pnpm dev:dummy` terminal for `[ecos]` lines, and check
`broadcasts.status` / `publish_claimed_at` / `published_at` directly.** The daily
cron remains the backstop either way.

**Also worth knowing**

- **`.pglite` corrupted twice in one session**, both times after the dev server
  stopped — the second time within an hour of a clean rebuild, and a stale
  `postmaster.pid` was not the cause (removing it did not help). Only
  `pnpm dummy:setup --reset` recovers it. The first corrupt copy is kept outside
  the repo at `CloneWMS_localRepo/.pglite-corrupt-2026-09-16`.
- Dummy-mode WhatsApp always records "template not set up" / "not opted in":
  no Meta credentials, and no dummy employee has opted in.

**Author:** Rudra (with Claude)


### 2026-09-15 (night) — Migrations 0215–0224 APPLIED; the team's merge deployed

**The pending-migration section above is now history.** `0215`–`0224` ran
against production (`mwaijzxuyicysvimzspx`, the personal-Gmail project) on
15 September, verified by a full pass of `db/VERIFY-0215-0224.sql`: **74 checks,
all true**, including both `0224` rows that gate the deploy. `main` and
`dev-integration` were then pushed together; `/login` 200, `/api/health` ok
(db 108ms, storage 603ms).

**Part 2 ran too — the device wipe — and was then restored.** The paste covered
lines 1–1994 of a 1994-line file, so Part 2 was included rather than stopped at
`END OF PART 1`. All 66 `mobile_devices` rows were deleted, having been copied
to `mobile_devices_pre_0223` in the same transaction first. They were put back
within the hour by `db/RESTORE-DEVICES-FROM-0223-BACKUP.sql`: **66 restored, 66
in backup, 0 live before, 0 skipped** — a clean full copy, and proof nobody had
re-registered in the window.

So **first-login registration is effectively not in force**: the restored rows
carry their old `approved` status, which for the auto-adopted ones means "this
browser turned up once", not "this person registered this machine". The wipe
can be redone deliberately — the footer of the restore file has the three
statements, and note that Part 2 skips itself while `mobile_devices_pre_0223`
exists, so the old backup must be renamed and dropped first.

**Vercel warned that `altus-corp1` had used 75% of the free Fluid Active CPU
allowance, and the cause is the broadcast poller.** `<BroadcastPopup>` is
mounted in `app/(app)/layout.tsx`, so it runs on every authenticated page, and
it polls `/api/broadcasts/popup` every **4 seconds** — 900 requests an hour per
open tab. It is the ONLY network poller in the app (`refetchInterval`,
`refreshInterval` and `pollingInterval` appear nowhere), and it went live with
Rudra's 0215 work this same day, which is why the alert arrived when it did.

**The crons are not the cause and can be ruled out:** 35 of them, none more
frequent than daily — 35 invocations a day against roughly 150,000 from the
poller.

Each poll is not cheap either. `getCurrentEmployee()` verifies the session
(crypto, which is real CPU rather than I/O wait that Fluid bills lightly), then
reads the employee, then `getDelegation()`, then the broadcast query — about
four round trips, fifteen times a minute, per person.

**Fixed for free: the poll now skips while the tab is hidden.** A popup nobody
can see is not worth a round trip, and nothing is missed or even delayed — the
`visibilitychange` handler already fires a check the moment the tab returns, so
a broadcast sent while you were away now appears on RETURN rather than up to
one throttled interval later. Strictly faster than before.

**Then solved properly: the popup now PUSHES, and the poll is a safety net.**
Raising the interval was the obvious lever and it is the wrong one — it trades
the feature's whole promise for the saving. Supabase Realtime already carries
`tasks` changes in this app (`components/layout/live-indicator.tsx`), and a
broadcast is the same shape of event, over a websocket the browser is holding
open anyway. So the popup subscribes to the `broadcasts` table and the poll
rate became **adaptive**:

| realtime channel | poll rate | requests/hour/tab |
|---|---|---|
| `SUBSCRIBED` | 60s | **60** |
| anything else | 4s | 900 (the old behaviour) |

That is a 93% cut **and** faster delivery — push arrives when the row is
written, polling arrives up to a full interval later.

**The adaptive rate is what makes it safe to deploy before the SQL.** It runs
at 4s until the channel actually reports `SUBSCRIBED`. So with `broadcasts`
missing from the publication, the websocket blocked, or
`NEXT_PUBLIC_DISABLE_REALTIME=true` on the LAN build, it degrades to exactly
what it did before — there is no configuration in which it is slower than the
version it replaces.

**SQL to get the saving: `db/ENABLE-REALTIME-BROADCASTS.sql`** — one guarded
statement adding `broadcasts` to the `supabase_realtime` publication. Until it
runs, the code is live and costing what it always did.

**The poll does not go away, and should not.** Realtime announces row changes;
it cannot announce that somebody's SNOOZE expired, which is a clock event with
no row behind it. 60s is the right resolution for that, and doubles as the net
for a websocket that dropped silently.

**It subscribes to `broadcasts`, never `broadcast_recipients`** — publishing
writes one broadcast row and one recipient row PER PERSON, so the recipients
table would wake every tab in the company once per colleague. And the push is
only a nudge: the browser then calls `/api/broadcasts/popup` once, so every
per-person decision (who, snoozed, lock-mode) stays on the server and no
broadcast content crosses the realtime channel.

**The SECOND Vercel alert — Function Storage 75% of 10 GB — is a different
problem with a different cause, and it is structural.** Measured from the
traced bundles of a real build (`.next/server/**/*.nft.json`, summing each
function's actual files), not estimated:

| | |
|---|---|
| Functions in one deployment | **431** |
| Sum of all function bundles, uncompressed | 10.30 GB |
| Unique files behind them | 180 MB |
| `/api/hr/letters/pdf` | **98.7 MB** |
| `/api/hr/letters/email-pdf` | **98.7 MB** |
| `/api/hr/letters/issue-rich` | **96.2 MB** |

**THE CAUSE WAS NOT THE LETTER ROUTES, AND NOT THE NUMBER OF DEPLOYMENTS.**
Both were wrong guesses made from the list of heaviest FUNCTIONS; the answer
only appeared on totalling what was INSIDE all 431 of them:

| package | total | in # functions | each |
|---|---|---|---|
| **`@electric-sql/pglite`** | **7.14 GB** | **426 of 431** | 17.2 MB |
| (the app's own code) | 1.97 GB | 431 | 4.7 MB |
| `next` | 0.52 GB | 431 | 1.2 MB |
| `@sparticuz/chromium` | 0.19 GB | 4 | 49.8 MB |

**One devDependency was 69% of the bill.** PGlite is the DUMMY_MODE fixture
database — PostgreSQL compiled to WASM, for the local sandbox on port 3002 —
and every function that touched `lib/db` shipped a copy production can never
execute. Chromium, the thing that looked like the problem, is 1.8%.

**Every precaution was already in place and none of them helped.** It is a
devDependency, it is in `serverExternalPackages`, and `dummyDb()` `require()`s
it at call time with a comment saying the real database path must never pay for
it. But `serverExternalPackages` stops a package being BUNDLED, not TRACED —
keeping it a plain runtime require is the whole point of it — and a call-time
`require()` with a literal string is still statically analysable, so the tracer
follows it exactly as it would an import. **This is the trap worth remembering:
the three things that normally keep a dependency out of production say nothing
at all about file tracing.** Only `outputFileTracingExcludes` does, and that is
now set in `next.config.ts`.

**FUNCTIONS STORAGE: WHAT IS OBSERVED, AND WHAT IS STILL UNKNOWN.** Four
theories were advanced about this meter on 15 September and every one was
wrong, so this section records measurements and marks the rest as open.

**Observed, 15 September:** the Usage graph (Usage → Functions Storage → Total
size) climbed from 0 B on ~30 August to **10.6 GB against a 10 GB allowance**,
in an unbroken line with no dip — including through the afternoon when **80 of
84 deployments were deleted**. Deployment Storage fell to 1.76 GB that same
hour; this meter did not move. Deployments came in Preview/Production PAIRS at
identical timestamps, because the same commit was being pushed to `main` and to
`dev-integration` and Vercel built both.

**Observed, 16 September:** it **dropped to zero**.

**Why it dropped is NOT established.** Two candidates, and they imply opposite
things:

1. **The billing period rolled over on the 16th.** Then the allowance simply
   refills monthly and the climb starts again with the next deploy.
2. **The deletions were credited a day late.** Then deleting deployments IS a
   real lever, it just settles slowly — and the "never falls" reading taken
   from a single afternoon was an artefact of watching too short a window.

A drop to *zero* rather than to the cost of the four surviving deployments
leans towards (1), but that is an inference, not a measurement.

**To settle it**, watch two things: whether the line resets again around 16
October (→ monthly cycle), and whether deleting a deployment produces a drop a
day later (→ deletions work, with a lag).

**What to do is the same under both readings, which is why it is safe to act
on now:**

- **Batch pushes.** Fifteen small ones on 15 September cost ~3.4 GB in an
  afternoon — about **240 MB per deployment**, which is the one number here
  that was measured directly rather than inferred.
- **Never push one commit to two branches that both build.** `vercel.json` now
  sets `git.deploymentEnabled["dev-integration"] = false`; the branch still
  takes pushes and still works as the outside developer's PR target, it just
  stops producing a build. That halves the cost of every change on its own.
- **Smaller functions still help**, but only from the next deploy onward — the
  pglite change reduces what each new deployment adds and cannot refund
  anything already counted.

**And read the graph before theorising.** Deleting old deployments, the three
Chromium letter routes, and an `outputFileTracingExcludes` glob were each
confidently blamed and each innocent; one look at the shape of that line would
have refuted all three.

⚠️ **DO NOT TRUST A LOCAL `.nft.json` MEASUREMENT, including the table above.**
Three builds of essentially the same tree measured 10.30 GB, then 1.95 GB, then
1.95 GB — and both small ones traced **no node_modules at all**: zero files for
`@sparticuz/chromium`, zero for `firebase-admin`, zero for `postgres`. An app
without its own database driver cannot run, so those traces are incomplete, not
a saving. The complete one came from a build that reused an existing `.next`;
the empty ones followed `rm -rf .next`. An `outputFileTracingExcludes` entry was
blamed for the emptiness and was innocent — it reproduces with no exclude
configured.

So the 7.14 GB figure comes from the one trace that was internally consistent
(chromium in exactly the four routes configured for it, firebase-admin in 92),
and it is the best evidence available rather than a proven number. **The
authority is Vercel → Usage → Functions Storage after a deploy.** Treat a local
build as a hypothesis generator only.

**Three routes carry three separate copies of the same 67 MB Chromium binary
— 201 MB of pure duplication in every single deployment.** They are traced in
by `CHROMIUM_BIN` in `next.config.ts` because `@sparticuz/chromium` unpacks its
binary at runtime, so nothing statically imports it and Vercel's file-tracing
would otherwise drop it. The include is correct; having three routes that each
need it is the cost.

**What to do, in order:**

1. **Deploy the `outputFileTracingExcludes` fix** (done — see `next.config.ts`).
   It is what removes the 7.14 GB.
2. **Then delete the deployments built BEFORE it**, once the new one is live
   and healthy. They still reference the fat bundles, and the meter cannot fall
   while anything does.
3. **Do not deploy on every push.** Each push to `main` is a full 431-function
   deployment. Batch work onto one deploy rather than five. This matters for
   Deployment Storage (which does accumulate) more than for Functions Storage.
4. **Optional, and much smaller than it looks: collapse the three letter-PDF
   routes into one.** They all render the same rich letter through headless
   Chromium and differ only in what they do with the bytes (return / email /
   store), so one route with a mode parameter carries the 67 MB once instead of
   three times. Worth roughly 150 MB — real, but 1.8% of the problem, not the
   headline it first appeared to be. It is a refactor of three live endpoints
   and wants its own change and its own test.

**Do NOT "fix" this by deleting the `outputFileTracingIncludes` entries.** They
look like bloat and they are load-bearing: without `CHROMIUM_BIN` the rich
letter routes fail at runtime with "input directory …/bin does not exist", and
without the `public/letter-fonts`, `public/letterhead` and `public/logos`
includes the PDFs render with no fonts and a code-drawn red band instead of the
letterhead. `public/` is CDN-served and is not guaranteed to be on the function
filesystem.

**The two alerts are unrelated.** Fluid Active CPU is the broadcast poller
(above); Function Storage is deployment artifacts. Fixing one does nothing for
the other.

**A verification file must be ONE statement.** The Supabase editor displays only
the LAST result set of a multi-statement run. `VERIFY` was eight `SELECT`s, so
running it showed check 7 and silently discarded checks 1–6 — and the output
was indistinguishable from a clean full run. It is now a single query returning
`(check_name, ok)` ordered failures-first. Same reason the restore script has
no `BEGIN`/`COMMIT`: one statement is atomic already, and a trailing `COMMIT`
returns no rows, so it would become the last result set and hide the report.
Written up for the team in [`docs/handoffs/README.md`](./docs/handoffs/README.md).

**Three defects Vinal reported, two of them fixed here.**

1. **The Goals rail had no pill for the page it lands you on.**
   `WORKSPACE_LANDING.goals` is `/goals/dashboard` and `/ws/goals` routes there
   too, but `WORKSPACE_NAV.goals` never listed it — so entering the room opened
   a page with nothing highlighted and no way back to it once you clicked away.
   Added as the first item, with `canvasOnly` for the same reason the three
   level pages carry it (the page itself redirects to `/goals` when
   `GOALS_CANVAS_ON` is off, so without it the pill would be a dead link).

2. **Bulk Add vanished from the desktop ribbon — and that one is ours, not
   the team's.** The bar the Aura bar replaced carried "search · bulk add ·
   create · bell · focus"; bulk add was the single control that did not make
   the crossing. It is still rendered in `DashboardSidebar`, so it survived on
   phones and disappeared on desktop, which is exactly why it read as "it works
   in wms-local but not here". Restored to `aura-top-bar.tsx` before Create,
   the order the old bar used. **The lesson: when a component is replaced,
   diff what the old one RENDERED, not just what it looked like.**

3. **The short client and subject pickers are a DATA gap, not a bug — no code
   change would fix it.** Both lists are rows read straight out of `clients`
   and `subjects` filtered on `is_active = true`. The only code-level filter
   that exists is `lib/tasks/subject-options.ts`, and it retires exactly two
   values — "WMS" and "WMS App" — neither of which is on the reported list;
   "Altus Ecosystem" is PINNED there and is always offered. Clients have no
   policy layer at all. So those rows are on the team's database and not on
   this one, which is what a team working on a separate Supabase project
   produces. `db/SEED-CLIENTS-AND-SUBJECTS.sql` diagnoses first (missing vs
   merely switched off — different fixes) and then seeds, matching
   case-insensitively because `name` is UNIQUE but case-SENSITIVE and a plain
   `ON CONFLICT DO NOTHING` would put "BSS" next to "bss" in the picker.
   **Expect up to a 10-minute lag** before the names appear: both lists are
   `unstable_cache`d with a 600s revalidate, and a hand-written INSERT cannot
   invalidate the tag the way the in-app write paths do. A redeploy is instant.

**ANSWERED — broadcast authoring stays open to every employee.** Rudra asked
for a ruling in `docs/handoffs/HANDOFF-Rudra.md` §6.4: `requireAuthor()` is
`requireUser()`, so anyone signed in can create a broadcast, while managing an
existing one correctly requires author-or-admin. **The account holder's
decision on 15 September is that this is intended — leave it as it is.** No
code change; the current behaviour already is the decision.

Recorded here so it is not re-raised as a bug every time someone reads that
permission check. The thing to watch, if it ever becomes a problem, is not
authoring itself but **Critical/Emergency priority, which carries app-lock
mode** — that is the capability worth splitting off, rather than restricting
who may post an announcement.

### 2026-09-15 (evening) — The team's fork audited against the Aura merge

No new code from the fork: `dev/main` and `dev/prod-sync-0915` are both already
contained in this branch (merged as `5a86a2a0`). What follows is the audit of
that merge, and the four repairs it needed.

**SQL to run before deploying** — unchanged, and still outstanding:
`db/VERIFY-0215-0224.sql` → `db/RUN-IN-SUPABASE-0215-0224-ALL.sql` → the verify
file again, against **`mwaijzxuyicysvimzspx`**. See the pending-migrations
section at the top of this file, including why the instructions that shipped
with those files name the wrong project.

**What the merge broke, and the fixes**

- **`tests/unit/incentive-export.test.ts` no longer type-checked.** Its
  `CatalogRow` fixture predates `0216`, so it was missing the two fields that
  migration added. Given `appliesToAll: true` / `eligibleIds: []` — the state
  0216 leaves behind — with a note saying why the exports do not read them.
  This was the ONLY type error in 459 changed files.
- **The Aura room switcher advertised a key that does nothing.** The shortcut
  alphabet became letters on 11 September (`qwertyuiopdf`, twelve keys for
  twelve rooms, replacing ten digits that left two rooms with none). The one
  listener mounted app-wide requires **Alt**, so a badge reading a bare "Q" was
  advertising a keystroke the app ignores. `lib/aura-rooms.ts` now emits
  `moduleShortcutHint` — "⌥Q", the same two-character form the module footer
  and module bar already use. **This is the only user-visible change here.**
- **`.gitignore` carried `!components/**/whatsapp*` twice**, once from each
  side of the merge, with two different comment blocks explaining the same
  incident. Kept the first.
- **`db/VERIFY-0215-0224.sql` gained check 3b.** See below.

**Check 3b — the drift the -ALL sheet does not cover**

`db/history/SCHEMA_DRIFT_FIX_2026-09-10.sql` (their file, tracked here rather
than left loose in `SQl Queries by the team members/`) repairs **pre-0215**
migrations that were never applied on their database: `employees.employment_
status` and its four siblings, `goals.client`, the `project_nodes` columns and
`project_node_attachments`. Its Part 3 is `0215`, which the -ALL sheet already
carries — Parts 1 and 2 are not in that sheet at all. So running the -ALL sheet
end to end would still leave those missing, on any database that skipped them.
Check 3b now asks the question directly instead of assuming the answer. Expect
every row true on production, which was repaired on 9 September.

That file also independently confirms the project test in check 3: it records
that `app.is_admin()` does not exist on `fjopgyqytfvbudkwhdto`, which is why
their `PART 3b` shipped commented out.

**What the merge got right, and is worth not re-litigating**

- **Every Aura file is byte-identical** to `7e91012a`: `app/aura.css`, the top
  bar, the rail lens, the widget grid, the charts, the widget bodies,
  `lib/dashboard/widgets.ts`, `lib/aura-rooms.ts`, the hub page. Nothing of the
  design was reverted by a team branch that predated it.
- **Operations reaches the new top bar for free.** `roomsFor()` maps whatever
  `MODULE_ORDER` holds, and Operations was *appended* to that list rather than
  slotted in beside the two rooms it absorbed — which is what kept `q`…`p`
  pointing at the same ten modules. No wiring was needed.
- **The HR console renders the Aura bar inset**, through Rudra's
  `useInsetTopBar()`, so the console's rail runs full height like every other
  module's. The bar is a `shrink-0` flex item there, not a scroll child, so its
  `position: sticky` is inert rather than wrong.

**Known, deliberately not fixed here**

- **`components/hub/module-shortcuts.tsx` is orphaned.** The team's bare-letter
  hub shortcuts were built for the old hub-card grid, which the dashboard
  replaced; nothing imports the file. Mounting it now would be actively wrong —
  the Aura bar carries a search field, so a bare "q" on this screen is typing.
  Alt+letter works everywhere, including here. Left in place, unmounted.
- **`package.json`'s tiptap pin is under the npm-only `overrides` key.** This
  repo declares `packageManager: pnpm@10.33.0`, and pnpm reads
  `pnpm.overrides`. The pin therefore works for `npm install` and does nothing
  on Vercel. Not moved: mirroring it under `pnpm.overrides` forces a
  `pnpm-lock.yaml` regeneration, and changing dependency resolution in the same
  push as a 459-file merge is how a good merge becomes a bad deploy. The
  lockfile is untouched by the merge and `--frozen-lockfile` still matches, so
  the deploy builds exactly as today's does. Do it as its own change.
- **Broadcast authoring is open to every signed-in employee** —
  `requireAuthor()` is `requireUser()`, while managing an existing broadcast
  correctly requires author-or-admin. Broadcasts support Critical/Emergency
  priority with app-lock mode, so this is any employee being able to take over
  everyone's screen. Rudra flagged it for confirmation in
  `docs/handoffs/HANDOFF-Rudra.md` §6.4 and it has not been answered.

**Verification** — `tsc --noEmit` clean after the fixture fix (the one error
above was the only one). The nine-to-ten red unit tests and ten lint errors are
pre-existing and unrelated; both the team and this branch have confirmed them
against clean trees at `bd20607` and at `ea75ddec`.

### 2026-09-15 — Per-person incentive eligibility; dashboard trimmed and widened

**SQL TO RUN: `db/migrations/0216_incentive_eligibility.sql`.** It is additive
and safe to re-run. You do not have to run it before the deploy — see below.

**THE INCENTIVE MODULE NOW DECIDES WHO EACH INCENTIVE APPLIES TO.** An admin
opens the incentive chart and, per row, picks **Everyone**, a **whole function**
(one button per department), or **named people**. Anyone not picked:

- does not see that incentive **at all** — it is not greyed out or marked
  ineligible, it is simply not in their catalog;
- does not have it counted in their **target vs actual**.

Two design decisions worth knowing:

- **A department button SELECTS, it does not SUBSCRIBE.** Pressing "Sales" ticks
  everyone currently in Sales and then forgets it was ever a department; what is
  stored is the list of people. If the rule were stored instead, moving somebody
  between departments would change what they are paid for months after anyone
  decided anything, and nobody would know why.
- **`applies_to_all` defaults to TRUE.** The moment the migration runs, every
  existing incentive stays visible to exactly the people who could see it a
  second earlier. Nothing disappears until an admin narrows it deliberately.

**An entry naming an incentive the catalog has never heard of still counts.**
`incentive_entries.incentive_name` is free text imported from the old sheet with
no foreign key, so a typo or a retired scheme makes a row unclassifiable — not
forbidden. Quietly dropping someone's earnings over a spelling mistake in an
import is the worse failure. Same for a ledger row never linked to an employee.

**THE DEPLOY CANNOT OUTRUN THE SQL.** `lib/incentive/ensure-eligibility-schema.ts`
runs the additive half of 0216 once per server process, and every read falls
back to "everything applies to everyone" if the rules cannot be read at all.
Code arriving before its migration is what took Daily Goals, punch-in and
sign-in down on 8 and 9 September; this is the same shape as the existing
`lib/ensure-incentive-schema.ts`. **Still run the file** — the guard is
insurance, not a substitute.

**What is NOT covered:** `incentive_targets` stores ONE target per person per
month, not a target per incentive. So the *actual* side is filtered by
eligibility and the *target* side cannot be — there is nothing in the schema to
split it by. Per-incentive targets would need their own column and a second
migration.

**Dashboard, same day:** the workspace rail is gone from /hub (every room is in
the top bar, so a second permanent copy down the left was 252px spent saying it
twice), the "N things need you today" line is gone, the top bar now shows up to
eight tabs, and there are three more widgets (Waiting on, Inbox, Joined this
month) plus move-to-top/bottom, a compact density and a greeting switch.

Tests: `tests/unit/incentive-eligibility.test.ts` (8) and
`tests/unit/dashboard-layout.test.ts` (15).

### 2026-09-15 — Holiday carousel, merged holiday lists, letter order, Fit to one page, Management Verdict

**What changed**

- **HR > Holidays is a carousel of what is still ahead.** Past holidays are
  hidden; prev / next jump straight to the previous / next month that has a
  holiday, across year boundaries (`lib/hr/holiday-calendar.ts`,
  `app/(app)/hr/holidays/holiday-carousel.tsx`). "All upcoming" lists every
  remaining holiday by month. The Year / Month dropdowns are gone.
- **Print Calendar always prints the whole current calendar year**, Jan–Dec,
  past and ad-hoc days included, from a print-only section — whatever month is
  on screen.
- **`/holidays` and `GET /api/mobile/holidays` show ad-hoc and published
  holidays**, not only the Events Master (`lib/queries/company-holidays.ts`).
  Each mobile row now carries a `source` (`events` / `published` / `adhoc`).
- **The five task / manager reports use the merged holiday calendar**
  (`listHolidayRowsBetween` in `lib/queries/holidays.ts`) instead of the raw
  `holidays` table: dashboard, task report, manager drill-down, manager
  activity board, creator workload board.
- **Letter order.** Appraisal: End of Probation → Appraisal → Promotion →
  Increment → New CTC Appraisal → New CTC Promotion. Exit: Experience Letter
  before Letter of Recommendation. Same order on the letters index.
- **Fit to one page** (`lib/hr/letters/fit.ts`). A toolbar switch on every
  letter; ON by default for New CTC – Appraisal and New CTC – Promotion. It
  tries the normal layout, then compact spacing, then text scaled down to a 78%
  floor — in the browser (so Print prints it), in the pdfkit PDF and in the
  free-edit (Chromium) PDF. Every issue / export / send request carries it.
- **Management Verdict** replaces the Outcome card on Management Assessment:
  Selected / Rejected / One More Round / Free Training / Assignment Needed, each
  linking to its letter. One More Round keeps the stored value `shortlisted`.
- **Training Verdict** on the After Free Training letter: Accept / Extend /
  Regret fills the Outcome line and links to the Appointment or Regret letter.
- **HR lifecycle:** Candidate Records moved to Pre-Joining; the dead
  Acceptance Letter item removed (the letter itself was already unregistered).

**Why**

The holiday list opened on months with nothing in them and on days already
gone; the print was a snapshot of the screen. Ad-hoc holidays already reached
attendance and payroll but not the lists employees read. Appraisal letters
spilled onto a second page.

**How to verify**

```bash
pnpm typecheck
pnpm vitest run tests/unit/holiday-calendar.test.ts tests/unit/company-holidays-merge.test.ts \
  tests/unit/letter-order.test.ts tests/unit/letter-fit.test.ts tests/unit/format-date-hr.test.ts
```

On dummy mode (port 3002), measured 15-Sep-2026:

- `/hr/holidays` opens on September 2026 with only 23-Sep (4-Sep and 14-Sep have
  passed); the print-only section holds all of 2026.
- New CTC – Appraisal: 2 pages → 1 page in browser print (82%, compact) and in
  the PDF. New CTC – Promotion: 2 → 1 page in the PDF.

**Breaking / migration notes**

- **No migrations.**
- **Working-day counts in the five reports drop slightly**: they now subtract
  published and Events Master holidays too, and no longer count withdrawn ones.
- **The Offer (Selection) letter stays two pages.** It does not fit one page even
  at the 78% floor, so its switch starts OFF; turned on it says "Still 2 pages".
- **Not verified:** the mobile holiday API (needs a mobile session) and the
  Management Verdict screen with a real candidate.
- **Already failing before this work, untouched:** unit tests in
  `delegated-access-authorization`, `device-exemption-login`, `done-on-time`,
  `global-search-provider`, `task-actions`, `task-stat-counts`; two lint errors
  in the voice-recorder code of `management-assessment-screen.tsx`.

**Author:** Rudra (with Claude)

### 2026-09-12 (night) — The home screen is a dashboard you arrange yourself

**The launcher grid is gone.** Twelve tiles under "Jump into a workspace" were
a second copy of the twelve links the rail already carries — permanently, two
clicks closer — and they took the bottom half of the screen to say it.

**In its place, eleven widgets, and the user arranges them.** Every one can be
one of three widths, pushed up or down, removed, or added back:

| widget | what it shows |
| --- | --- |
| WMS · daily loop | due/overdue today, the next three by name |
| Goals · this week | week score, weekly + cascade counts, FY average |
| Quick actions | new task, plan my day, attendance, goals, inbox |
| Hours | this week vs your target, plus/minus, the month so far |
| What's coming | the next company holidays |
| Attendance | your punch and your week; roster counters for admins |
| Where your work sits | everything open on you, by priority |
| This month's outcomes | what was due, and how it went |
| Your work shape | a petal per day sized by hours actually worked |
| Your team | each direct report's open/overdue count (managers only) |
| Open on you | every open task, soonest first, with who gave it to you |

**HOW IT IS BUILT, and the one thing to understand before touching it:** the
SERVER renders every widget body and hands `DashboardGrid` a map of finished
nodes; the client component only decides ORDER, SIZE and PRESENCE. So none of
the dashboard's data crosses to the browser and a widget stays an async Server
Component while still being furniture the user moves.

**Three new queries**, all in `lib/queries/aura-dashboard.ts`: upcoming
holidays, the manager's team load, and the month's punches — the last folded
into `myWorkShape`, so the hours ledger and the bloom come from ONE read and
can never disagree about how long you worked.

**THE LAYOUT IS IN `localStorage`, NOT ON THE EMPLOYEE ROW.** That is a trade,
not an oversight: a column means a migration, and migrations here are applied
to production by hand. The cost is real — the arrangement does not follow you
to another device, and clearing site data resets it. Moving it to the database
is a small change (`lib/dashboard/widgets.ts` already has the serialised
shape); it just needs a migration run.

`reconcileLayout` is the only thing between a browser-written string and the
dashboard, so it is covered by `tests/unit/dashboard-layout.test.ts` (15 cases:
corrupt storage, unknown ids, duplicates, illegal sizes, a widget that stops
being available, and the one that matters — **a removed widget must not come
back** when the catalogue later gains an entry, which is why `StoredLayout`
records `removed` instead of inferring it from absence).

No SQL.

### 2026-09-12 (late) — Opaque top bar, overflow-only "More", the glass rail

Four corrections to the morning's Aura work, all reported from production.

- **THE TOP BAR IS NOW OPAQUE.** It was glass, and glass over a whole scrolling
  page is unreadable the moment anything passes under it — dashboard cards,
  faces and numbers came straight through the strip. It keeps the specular
  edge and the drop shadow, so it still reads as an Aura surface; it simply
  does not let anything through. **This was two bugs, not one:** the z-index
  was 20 (the reference page's value), and page content at z-50 was painting
  OVER the bar, so opacity alone would not have fixed it. The bar is z-60 now
  — clear of every in-page layer, still under the app's dialogs and drawers
  (70, 90, 100, 120).
- **"More" holds only the rooms that did NOT get a tab.** It used to list every
  room. The catch is that which tabs fit is width-dependent, so the count is
  now measured in JS (`useTabCount`, via `useSyncExternalStore` so the server
  and client snapshots agree) instead of hiding tabs with CSS media queries. A
  CSS-hidden tab would have left its room in neither the bar nor the menu.
- **Search and identity are one right-hand cluster.** Search used to grow into
  the middle of the bar, which stranded the account menu at the far end. The
  avatar also now shows on EVERY screen — it used to be suppressed on module
  pages because the rail's foot carried one. That foot profile bar is gone;
  identity lives in the bar, once.
- **The left rail is the new glass-rail design** (`RAIL-SPEC.md` +
  `aura-glass-rail.html`, both now under `.claude/skills/aura/reference/`): a
  floating glass pane, a numbered index, and ONE travelling indicator instead
  of a background per row, with a red light that flows across a row on hover.
  The dashboard gets it in full (`AuraGlassRail`, PINNED + ALL WORKSPACES);
  the module rail gets the same material and the same lens applied to its
  existing pills.

The lens (`components/layout/aura-rail-lens.tsx`) keeps the two traps the spec
warns about — no transition on the first placement, and measurement on a timer
rather than `requestAnimationFrame`, which is paused in background frames — and
adds a third we hit here: **the rows may not exist yet.** The module rail's nav
is an async server component behind a Suspense boundary, so on a slow read the
real rows land long after a 2s retry window closes. A `MutationObserver` on the
container is the only placement that cannot be outrun.

No SQL.

### 2026-09-12 — Aura: the dashboard, the app-wide top bar, and the rail

**What changed**

- **The Aura design language is now a project asset**, at `.claude/skills/aura/`
  — the language itself as a skill, plus the reference dashboard, the upstream
  stylesheet and the original brief under `reference/`. `.gitignore` excludes
  `.claude/*` rather than `.claude/` so it can be tracked: git never descends
  into an excluded *directory*, so a `!` re-include underneath one never
  matches. The stylesheet lives at `app/aura.css`, imported by `globals.css`.
- **`/hub` is no longer a launcher, it is the dashboard.** Greeting, the WMS
  daily loop and this week's goals, attendance, three charts, the open-work
  table, and the twelve workspace tiles kept at the bottom.
- **The top bar is now on every screen in every module** — brand, module tabs,
  a "More" menu listing every room, a full-width search box on ⌘K, then create /
  focus / notifications / identity.
- **The module left rail keeps its job and gets the Aura material.** The top bar
  switches ROOMS; the rail lists the SECTIONS inside the one you are in. That
  division is why the bar no longer repeats the page's name.
- **TeX Gyre Heros and Inter are self-hosted** in `app/fonts/` (21 KB a weight
  and 48 KB), registered with `next/font/local`. Never `next/font/google` — a
  deploy must not depend on fonts.gstatic.com, which is what took `b50e9e2`
  down.

**Every number on the dashboard is real**, and where the reference mock's
dimension does not exist in this schema the panel was re-cut onto one that does
rather than filled with something plausible. `lib/queries/aura-dashboard.ts`
carries the reasoning per panel:

- *"Where your week went, by workspace"* → **your open work by priority**.
  Nothing in this codebase tags a record with a `WorkspaceId` and the task-time
  rollup has no module dimension, so hours-per-workspace cannot be computed at
  all.
- *Timer-based hour counts* → **attendance punches**. `attendance_logs` is the
  one place a real worked minute is recorded for everyone; the task timer is
  opt-in and mostly empty. The work-shape bloom, the week strip and the
  hour-of-day strip all come from there.

**Permissions.** The roster-wide attendance counters (present / late / on leave
/ unmarked) are **admin-only** — the same rule `/attendance/live-status`
enforces, since those counts span every employee. Everyone else sees their own
punch and their own week, full width.

**Four bugs found and fixed while building it**

1. `roomsFor()` was exported from a `"use client"` module and called from the
   server, which crashed **every** route. It now lives in `lib/aura-rooms.ts`.
   A function in a client module can be rendered, never called, from the server.
2. `.aura-app` had `overflow: hidden` (copied from the reference page). An
   ancestor with a non-visible overflow becomes the scroll container, so
   `position: sticky` resolved against it and the top bar scrolled away. The
   blobs were already clipped by `.aura-field`, so nothing needed it.
3. The rail skin lost the cascade: `globals.css` imports `aura.css` at the TOP,
   so an equal-specificity rule further down `globals.css` won on source order
   and the selected item kept its old pink wash. Every skin selector now carries
   both `.sidebar-rail` and `.aura-rail-skin`.
4. The bar is pinned to **exactly 56px**. `body:has(.app-topbar)` publishes that
   as `--app-topbar-h`, the HR console sizes itself to
   `calc(100dvh - var(--app-topbar-h))`, and every `.sticky-below-topbar` header
   pins to it — so the new bar keeps the `app-topbar` class and the height.

**Still true**: no SQL to run for any of this. It is presentation plus five
read-only queries, all caught individually — a dead panel costs a panel, a
thrown one costs the front door.
### 2026-09-12 — Operations room rebuilt, task timer fixed properly, default scope by role

Branch `Vinal`, fast-forwarded to `ae58385b`. **Everything below is UNCOMMITTED
working tree** — 59 modified files and 23 new ones. Nothing has been pushed.

**What changed**

- **Default scope is decided by role, in one place.** New
  `lib/auth/default-scope.ts`: team member → their own work, admin → their own
  work, super-admin → everyone. Feeds eight call sites that each used to write
  `me.isAdmin ? undefined : me.id` for themselves — `/tasks`, `/tasks/agenda`,
  `/tasks/kanban`, `/archived`, the three task export routes and `/dashboard`.
- **The Scope segmented control is gone** from `components/layout/filter-bar.tsx`.
  Whose work you are reading is now asked only by the Assignee dropdown, which
  already carries an "All employees" row and your own name marked "(You)".
- **The task timer has four states, not a boolean.** `idle · running · paused ·
  stopped`, derived from the event log in `lib/tasks/time/phase.ts`. Stop is a
  real persisted action (`stopWork` in the engine, `work_stopped` in the log);
  Restart now clears the recorded time and counts from `00:00:00` again
  (`timer_reset`); the hero band, the Time Spent card and the Time Log tab all
  render one shared `components/tasks/time/timer-controls.tsx`.
- **Operations is the room it was asked to be.** Training moved in from the hub,
  Broadcasts and Job Description moved across from HR, Salary Slip moved to
  Employees, the front-door card deck was deleted (the room opens on
  Hand-holding), Help Desk → HR Help Desk, Exit → Exit Process, and the rail is
  now **alphabetical** with the landing named outright
  (`OPERATIONS_LANDING_AREA`) instead of being whatever sat at index 0.
- **The JD Bank has its ten columns**: Sr. No., Position, Function, Job
  Description, Frequency, Time Estimated, Attachment, Notes, Add To, Add To
  Person — every one sortable, ascending → descending → back to serial order.
- **Job descriptions are assigned per destination.** Three boxes — DCC, WMS,
  Event Checklist — each with a searchable roster
  (`components/operations/job-description/module-assign-boxes.tsx`), stored as
  three flags on one `jd_assignments` row (**migration 0225**).
- **The rank ladder is the account holder's 26**, replacing fourteen
  (`lib/jd/ladder.ts`, **migration 0226**), and the JD/checklist function
  pickers are restricted to seven (`lib/jd/functions.ts`).
- **Frequency speaks Google Calendar**: Does not repeat · Daily · Weekly on
  Saturday · Monthly on the second Saturday · Annually on [Date] · Every weekday
  · Custom. Two new recurrence shapes, `once` and `yearly`.
- **The Event Checklist grid** got sortable headings, the columns renamed to
  Sr. No. / Doer / Activity / Due Date / Target Date / Backup / Doer Status /
  Actual Date / Var, an inline **Add event** at the foot of the Event Name
  dropdown, and the dead "Import from Job Description" button removed.
- **A demo layer** (`lib/demo/`) renders the JD Bank and the Event Checklist
  from seeded in-memory data whenever their tables are missing, behind a banner
  naming the migration. See *Breaking* — this is currently the ONLY way either
  screen has ever been seen.

**Why**

**1. The same rule written eight times had already drifted.** Before this,
`/tasks` opened an admin on the whole company while `/dashboard` opened them on
themselves; the agenda always defaulted to the viewer, including super-admins;
and the **kanban passed `{}`, so every viewer's board opened on the whole
company** — including team members who see only their own rows everywhere else.
Nobody reported these, because a wrong default looks like data.

**2. "Fix the timer" had been asked nine times, and the ninth fix was correct.**
The engine, the store and the two surfaces were all right and all tested. What
was wrong was what the buttons MEANT: Restart rewound only the open session and
kept every banked minute, so a task with forty minutes on it read `40:00` the
instant after a button promising zero. And the rail's "Stop" called the same
action as the hero's "Pause" — one verb, two spellings, on one screen. No amount
of shared state fixes a divergence that lives in the markup, which is why the
controls are now one component with two skins.

**3. The screenshots being reported do not come from this database.** Worth
knowing before chasing the next bug report: `.env.local` holds one
`DATABASE_URL` (`ifcdpjbdinvmtewmgceg`), and a read-only probe found **no task
created in the last two days and no task titled "App"**, while the report showed
one created "just now" with a running session. Whatever is being clicked is a
different deployment. Fixes land here; the screen being checked is served by
another build.

**Also worth knowing**

- **`jd_*` and `ops_checklist_*` do not exist in this database.** Verified
  against `information_schema`: migrations 0221 and 0222 have never been
  applied here. Both features run entirely on the demo layer, which is why it
  exists — a "run the migration" card is accurate and completely unreviewable.
- **The upstream pull disabled the WMS device gate.** `204c5781` comments out
  `enforceWmsDeviceAccess` in `lib/auth/current.ts` because it was refusing
  every login: the gate ran before capabilities were consulted, so anyone whose
  one-per-kind slot was filled was bounced — including from the Registered
  Devices screen that would have approved them. Device enrolment still runs.
  **Before re-enabling, every active employee needs an approved device of the
  kind they sign in from.**
- **That pull also broke a test**, and it is not one of ours:
  `delegated-access-authorization` greps `lib/auth/current.ts` for
  `await enforceWmsDeviceAccess(real)` and no longer finds it.
- **Sr. No. is a row ordinal, not the serial.** It renumbers when you filter.
  The permanent `JD-0004` is on the number as a tooltip and in the drawer. If
  the printed number is meant to be permanent, the column should show the serial
  instead — the two cannot both be column one.
- **Notes were write-only for months.** The JD form has written `notes_html`
  since day one, but no query ever selected it and `JdEntryRow` did not carry
  it, so every note anyone typed was invisible everywhere. It is now in the
  grid as a stripped one-line preview and in full in the drawer.
- **Sales and Others stay in the function master.** The JD pickers offer seven;
  the firm still has nine, and editing the master down would strip the *label*
  off employees who hold those keys rather than removing the function.
- **Sorting is deliberately not remembered** on either grid. Collapse state
  persists because that is a lasting preference; a sort is how you read a list
  for a minute, and finding the grid still alphabetical next week reads as the
  plan itself having been rearranged.
- **Two specification documents** were written against this code and published
  as artifacts: the JD Bank spec, and a two-part spec covering Job Description
  and the Event/Non-Event Checklist. They mark every requirement Built /
  Partial / To build against what actually exists.
- **The JD auto-push still does not exist.** `push_dcc`, `push_wms`,
  `push_event` and `jd_push_log` are all in place and **nothing reads them** —
  ticking "Daily Compliance Checklist" records an intention and creates no task
  anywhere. This is the largest remaining gap in the feature.

**How to verify**

```bash
pnpm typecheck                       # clean
pnpm exec eslint .                   # clean apart from known warnings
pnpm exec vitest run --no-file-parallelism
# 2912 passed, 5 failed — all five pre-existing or from the pull, see above
```

Click-path, all on the demo layer: `/operations` redirects to Hand-holding · the
rail reads Broadcasts → Training alphabetically · `/operations/job-description`
shows ten sortable columns and the three assignment boxes ·
`/operations/checklist` sorts within each phase and offers **＋ Add event…** at
the foot of the Event Name dropdown · open any task and Pause, Stop and Restart
agree between the crimson band and the Time Spent card.

**Breaking / migration notes**

- 🔴 **Four migrations are unrun for these features**: `0221` (Event
  Checklist), `0222` (Job Description), and the two written today —
  **`0225_jd_assignment_targets.sql`** (per-destination assignment flags) and
  **`0226_jd_rank_ladder_26.sql`** (the 26 ranks). Apply in that order. Both
  new ones are additive and idempotent.
- `0226` **renumbers `rank_order`, which is behaviour** — the vacancy resolver
  climbs it. It does so in two passes because a single pass collides with the
  unique index, and it deliberately **leaves DGM alone**: that rank has no
  equivalent in the new list, and guessing between Deputy Director and General
  Manager would reroute live work. The migration raises a notice naming how
  many positions are stranded.
- **The ladder as ordered puts the GM grades ABOVE the VP grades** — a vacant
  Manager escalates through AVP, VP and President before reaching Assistant
  General Manager. This is the account holder's stated order, pinned by a test
  in `tests/unit/jd-ladder.test.ts`. If it is not intended, it is a two-line
  edit plus the migration.
- No new env vars.
- Nothing is committed. `git status` shows 59 modified and 23 new files on
  `Vinal`.

**Author:** Vinal Patil (with Claude)


### 2026-09-11 — Schema drift closed, WMS team's second batch merged, id counters repaired

**What changed**

- **Merged the WMS team's 11 Sep work** (`dev/main`, 119 files, 17 new): HR
  console quick-access nav and module landings, dashboard badge and hover
  fixes, task errors that say *why* they failed, goal self-approval with a
  reason, holidays, device self-registration. Shipped as `608a7cdb`.
- **Applied every outstanding migration to production by hand**, in eight
  steps, verified after each. The files are in `SQL STEPS/` under Downloads —
  not committed, they are operational scripts replaying committed migrations.
- **Repaired every sequence in the database.** See below; this was the day's
  worst bug and the least visible.

**Why — three failures, three different lessons**

**1. Code shipped ahead of its schema (again).** The 8 Sep merge carried
migrations nobody ran. Symptoms were maddeningly indirect: sign-in failed with
*"Email or password didn't match"* while Firebase was actually succeeding —
`POST /api/auth/session` was 500ing on a missing `employees.employment_status`
and the client fell through to its generic message. Goals died on a missing
`goals.client`. Punch-in died on a stale `0206` device index.
**Migrations before code, always.** This time the order was respected and
nothing broke.

**2. "Success. No rows returned" is not proof.** Step 3 reported success and
had done nothing: a partial text selection in the Supabase editor meant only
the final two lines ran. It even inserted `__schema_applied` rows, recording
migrations as applied that were not. The independent verify query is the only
reason this was caught. **Always Ctrl+A before Run, and always verify by
reading the schema, not the success banner.**

**3. Restores leave id counters behind.** `event_log.seq` is a `bigserial`.
The 4 Sep restore reinstated rows with their original ids but never moved the
counters, so the counter sat at **208** while the table had reached **10008**.
Every write to `event_log` failed with a duplicate-key error on a column the
application never sets. It had been latent for a week and only fired when
somebody wrote.

> **Any future restore MUST be followed by a counter resync.**
> `SQL STEPS/STEP-8-fix-sequences.sql` does the whole database and is safe to
> re-run — it touches no rows, only moves counters forward.

**Also worth knowing**

- **0215 supersedes 0214.** Two approved devices of any kind is retired; the
  rule is one laptop AND one phone. Applying it revoked three superseded
  laptop registrations (Mansi Medhekar, Mishtie Kanani, Shreya Randhe); each
  kept the machine they had used that morning.
- **The team's `PART 3b` (RLS on `attendance_audit_log`) ships commented out**,
  because their database lacks the `app` helper functions. Ours has both
  (`is_admin`, `current_employee_id`), so it was uncommented and applied. Check
  before assuming their scripts are complete for this database — their project
  is `fjopgyqytfvbudkwhdto`, ours is `mwaijzxuyicysvimzspx`, and row counts in
  their files are theirs, not ours.
- **Migration numbers collide, 28 of them**, back to `0019`. `0185`, `0186` and
  `0212` have three files each; `0215` has two. Nothing is broken — the runner
  tracks by filename — but the number no longer tells you the order anything
  ran, which is exactly what you want when diagnosing drift. Worth moving new
  migrations to a timestamp prefix.
- **This merge reverted nothing.** Unlike 8 Sep, their branch was cut from
  current `main`. Verified by hashing every file against the last 120 commits.

**How to verify**

```bash
pnpm typecheck        # clean, needs NODE_OPTIONS=--max-old-space-size=6144
```

In Supabase, `SQL STEPS/STEP-7-verify.sql` must read 5, 4, 4, 1, 1.

**Breaking / migration notes**

- The eight SQL steps were run **by hand against production** and are not in
  the migration chain's normal flow, though `__schema_applied` records them.
- 🔴 **Supabase quota exceeded.** Projects are restricted from **20 Sep 2026**
  if the organisation stays over. Payment method to be added 18 Sep — two days
  of margin, and quota lifts are not always instant.

**Author:** Rohan Choudhary (with Claude)


### 2026-09-10 — ECOS broadcast popup + snooze, HR letters overhaul, HR console chrome

Commit `5e3d2fd` on branch `Rudra` (pushed to `origin/Rudra`; **`main` untouched
at `ea0a8bf`, so none of this is on the live site**). 47 files, +3,966 / −404.

#### 🗄️ DATABASE CHANGES — READ BEFORE DEPLOYING

**One migration must be applied to the target Supabase database BEFORE the code
from this branch is deployed, or broadcast queries fail at runtime.**

`db/migrations/0215_broadcast_popup_snooze.sql` — additive and idempotent
(`IF NOT EXISTS` on every statement, safe to re-run; no existing data is read,
modified or deleted):

```sql
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);
```

Verification queries and a copy-paste version for the Supabase SQL Editor:
[`docs/SQL_QUERIES_FOR_DEPLOY.md`](./docs/SQL_QUERIES_FOR_DEPLOY.md).

Two notes for whoever runs it. `ADD COLUMN ... NOT NULL DEFAULT true` does not
rewrite the table on PG 11+, so it is fast. `CREATE INDEX` is **not**
`CONCURRENTLY`, so it takes a brief write lock on `broadcast_recipients` —
negligible at current row counts, but use `CONCURRENTLY` if that table has grown.

`db/schema.ts` declares the same five columns and one index. Schema and database
must match: applying 0215 is what makes them agree.

**Database impact by work area:**

| Area | DB impact |
|---|---|
| ECOS broadcast popup + snooze | **YES — migration 0215 required** |
| HR letters overhaul | None — code only |
| Communications, login UI, layout shell, `next.config.ts` | None — code only |

New queries worth knowing about, all in `lib/ecos/queries.ts`:

- `nextPopupBroadcastForEmployee()` — **polled every ~5 seconds on every
  authenticated page** by `<BroadcastPopup>`, which is mounted app-wide in
  `app/(app)/layout.tsx`. Joins `broadcast_recipients` to `broadcasts` and reads
  `snooze_session`, `snoozed_at` and `popup`. This is now the highest-frequency
  query in the app — the index above exists for it. It is fail-closed (returns
  null on error) so a failure is a missing popup, not a broken page.
- `getBroadcastAnalytics()` — aggregates `snooze_count` for the dashboard.
- The snooze / read paths write `snooze_session`, `snoozed_at`, `snooze_count`
  and `popup_seen_at`.

#### What changed

- **ECOS broadcast popup + snooze.** A published broadcast now flashes as a
  centre-screen modal within ~5s. "Read" settles the receipt for good; the "✕"
  snoozes it until the recipient's next login, tracked by an opaque
  browser-session id. Deliberately distinct from the full-screen app-lock gate
  (`broadcast-lock-gate.tsx`), which the popup skips entirely so the two can
  never fight over the same screen.
- **HR letters overhaul** — editor, rich rendering, PDF pipeline, letterhead,
  fit-to-width, plus `scripts/letter-page-estimate.ts`.
- **HR console chrome.** The app top bar was a full-width strip sitting *on top
  of* the HR console's own left rail — the one module that did not match the
  rest. It now renders inside the console's **content column**
  (`components/layout/inset-top-bar.tsx` hands it down; `chrome-shell.tsx`
  routes it there for HR full-bleed routes), so the rail runs the full height of
  the viewport like every other module's rail and the page title starts where
  the page starts.
  - Gotcha for anyone editing `hr-console-shell.tsx`: the shell must **not**
    carry `flex-1`. `flex-basis: 0%` replaces the main-size property on a flex
    item, so `height: 100dvh` is silently ignored and the shell sizes to its
    content — it grew ~160px past the frame, and since the frame is
    `overflow-hidden` the rail's footer fell off-screen with nothing able to
    scroll to it. The comment in the file says so; keep it.
- **Turbopack workspace root pinned** in `next.config.ts`. A stray empty
  `package-lock.json` in the Windows home folder was out-ranking this repo's
  `pnpm-lock.yaml`, so Turbopack rooted the module graph at the home directory
  and watched the whole user profile. That watch tree invalidates unreliably and
  produced phantom "export doesn't exist" build errors for exports that plainly
  did. Affects `next dev` only — the production build uses webpack.

#### Caveats — read before merging to `main`

1. **Everything was verified against `DUMMY_MODE` and the rebuilt PGlite fixture
   DB.** There has been no pass against the real database with real auth.
2. **9 unit tests fail** across `super-admin`, `roster-permission`,
   `done-on-time`, `task-actions`, `global-search-provider` and
   `task-stat-counts`. These are **pre-existing** — verified by running the same
   files at `bd20607`, before this work, where they fail identically. Not caused
   by this branch, but they are red and someone should own them.
3. **Any signed-in employee can publish a company-wide broadcast.** The gate on
   authoring is `requireAuthor()`, which is just `requireUser()`. Managing an
   *existing* broadcast correctly requires author-or-admin (`requireManager`),
   but creation is open to all staff — and broadcasts support Critical /
   Emergency priority with app-lock mode. Confirm this is the intended policy.
4. `pnpm build` uses `rm -rf`, which fails on Windows. The build was verified
   with `npx next build --webpack` directly.

#### ⚠️ Incident: local dev ran against the production database

For several hours a dev server was running on **port 3000** via plain `pnpm dev`
instead of `pnpm dev:dummy` (port 3002). Plain `dev` does not set `DUMMY_MODE`,
so the app used the real `DATABASE_URL` from `.env.local` — the live Supabase
project — with `DISABLE_AUTH="true"` and
`DEV_USER_EMAIL="vinalpatil.altuscorp@gmail.com"` resolving every request to
Vinal Patil's **real** employee row, as Administrator. Sign Out appears broken in
that mode because identity is recomputed from an environment variable on every
request, so there is no session to clear.

Any row written while browsing that server is real production data attributed to
Vinal. `event_log` (`actor_id`, `event_type`, `occurred_at`) can be queried to
list exactly what was written. `.env.local` is gitignored and has never been
committed, so no credentials were exposed.

**Rule of thumb: port 3002 is the sandbox, port 3000 is production data.**

#### ⚠️ `.gitignore` swallowed a source file — third occurrence

`components/ecos/whatsapp-panel.tsx` was written and imported by
`app/(app)/communications/[id]/page.tsx`, but `git add -A` skipped it silently
and the branch shipped an import of a file that was never pushed. It failed to
resolve at build time.

Cause: line 58 of `.gitignore` is `WhatsApp*`, intended for media exports. On
Windows and macOS the filesystem is case-insensitive, so it also matches
`whatsapp-panel.tsx`. The override list already carried `!lib/**/whatsapp*`,
`!app/api/whatsapp/` and `!tests/unit/whatsapp-*.test.ts` — each added after this
same trap bit — but never `components/`. Now fixed with `!components/**/whatsapp*`.

**If you add a `whatsapp*` source file anywhere new, check `git check-ignore -v`
on it before you commit.** A silent skip here does not fail locally; it fails in
the deploy build, long after the push.

To audit a branch for this class of bug, resolve every `@/` import against
`git ls-files` rather than against the working tree — the working tree still has
the file, which is exactly why it looks fine locally.

#### Also

- The PGlite fixture DB corrupts when the dev server is force-killed — it
  happened twice today. Symptom is every query failing, including trivial ones
  like `select distinct "subject" from "tasks"`. Fix is
  `pnpm dummy:setup --reset`, then restart. Rebuilt clean at 234 migrations.
### 2026-09-10 — Task timer repaired, Bulk Add, hub letter shortcuts, template dropdowns

**What changed**

*Task timer — it was writing to the database and saying nothing (the day's main fix):*

- `components/tasks/time/task-timer-store.tsx` (**new**) — one timer per task
  detail screen, shared by the crimson hero band, the Time Spent rail card and
  the Time Log tab. Each of the three used to call the Server Actions itself and
  hold its own idea of "running". Optimistic: the label and the clock move in
  the same frame as the click, and the flip retires itself when the server value
  changes.
- `components/tasks/time/use-elapsed.ts` — rewritten on `useSyncExternalStore`
  with a server snapshot of `0`, and one shared 1s ticker for every clock on the
  page instead of an interval per component. Adds `useNowMs()` for relative
  stamps.
- `components/tasks/detail/task-hero-band.tsx`,
  `components/tasks/detail/detail-rail.tsx`,
  `components/tasks/time/task-time-panel.tsx` — all three now read the store.
  Dead local state, `useRouter` and action imports removed; unused `taskId`
  props dropped.
- `components/tasks/detail/task-detail-redesign.tsx` — mounts
  `TaskTimerProvider` around the detail subtree.
- `components/tasks/detail/detail-rail.tsx` — the Task Timeline's relative
  stamps ("43m ago") are hydration-safe.
- Restart's confirmation text corrected: it claimed to archive the session and
  reset to `00:00:00`; the engine rewinds only the session in progress and keeps
  every banked minute.

*Tasks:*

- `components/header/bulk-add-quick-action.tsx` (**new**) — Bulk Add button and
  dialog (upload an `.xlsx`, or download a blank template). WMS only; the gate
  is inside the component because `dashboard-sidebar.tsx` is a server component
  that renders once. Top-bar order is now Global Search · Bulk Add · Add ·
  Notification Bell · Maximize, in `components/layout/app-top-bar.tsx` and the
  phone bar in `components/layout/dashboard-sidebar.tsx`.
- `components/tasks/tasks-bulk-entry.tsx` — the grid is hidden, not unmounted,
  when you go to Review, so going back keeps every row you typed.
- `components/tasks/task-table.tsx` — an empty search now explains itself
  ("Search looks only at the N tasks loaded for the filters above…") with a
  Clear search button. `visibleCols` hoisted out of the row map: it was declared
  per-row and the new empty-state row could not see it — `tsc` caught it,
  Turbopack does not typecheck, so a production build would have failed.

*Excel templates:*

- `lib/goals/template-workbook.ts` (**new**, extracted from the route so it is
  testable) — Goals template gains a Client column beside Area with a real
  dropdown, all validations rebuilt by header name after the column insert,
  gridlines on, and a filled-in Client example.
- `app/(app)/goals/template.xlsx/route.ts` — slimmed to 84 lines.
- `lib/tasks/template-columns.ts`, `app/(app)/tasks/template.xlsx/route.ts` —
  the Tasks template's Client column gets its dropdown and the live client list;
  examples fall back to a real option rather than rendering blank.

*Hub and navigation:*

- `lib/module-theme.ts` — `MODULE_ORDER` re-sequenced (WMS, Goals, Project, Team
  Productivity, Billing, HR, Sales, Accounts, Training, Employees, Monthly
  Events, HandHolding) and letter shortcuts `qwertyuiopas` assigned by position.
- `components/layout/module-shortcuts.tsx` — Alt/Meta only, never Ctrl; reads
  `e.code` so the layout does not matter.
- `components/hub/module-shortcuts.tsx` — bare-letter shortcuts on the hub, with
  a typing guard, a modal guard and a `defaultPrevented` guard so it yields to
  the `G`-sequences bound on `document`.
- `app/(app)/hub/page.tsx` — taglines removed, letter badge on each card, six
  cards per row on `xl` so all twelve fit in two rows with no scrolling, wrapper
  widened 1140 → 1440px, and the grid pinned 80px under the hero (was `my-auto`,
  which left 173px of dead space above the first row).
- `components/layout/chrome-shell.tsx` — no bottom padding on the hub, so the
  centring is symmetric.
- `components/layout/module-bar.tsx`, `components/layout/module-footer.tsx`,
  `lib/shortcuts.ts` — badges and the help sheet show the new letters.

*Goals:*

- `components/goals/plan/duplicate-date-dialog.tsx` (**new**) — Duplicate now
  asks which day. Extracted from `plan-item-card.tsx` so `day-review.tsx` uses
  the same one; the × moves a row to Unfinished and says so.
- `components/goals/review/review-table.tsx`,
  `components/goals/review/review-workbench.tsx` — percent fields hold TEXT, so
  typing `100` into a field showing `0` gives `100`, not `0100`. Approved % is
  an editable input on rows the viewer can approve.

*Layout sweep (one heading per page):*

- `app/(app)/review/page.tsx`, `app/(app)/dashboard/done/page.tsx`,
  `app/(app)/tasks/kanban/page.tsx`, `components/index-hub/index-hub-board.tsx`,
  `components/projects/projects-workspace.tsx`,
  `components/tasks/time/reports/report-frame.tsx` — the page's own big black
  heading is gone where the top bar already said the same word. The top-bar
  title stays. `components/layout/page-command-bar.tsx` gained an opt-in
  `titleInTopBar` (default `false`; 70 call sites unchanged), and
  `components/layout/page-title.tsx` (**new**) portals a title into the bar.
- `components/tasks/time/reports/report-ui.tsx` — every Time Intelligence table
  scrolls inside its own card with a sticky header and a visible bar, instead of
  scrolling the page and taking the column names off screen.
- `components/weekly-goals/weekly-goal-task-group.tsx` — the "WEEKLY GOAL" chip
  next to the heading "This Week's Goals" is gone; it stated the same fact
  twice. The chip stays on the kanban goal card, where goal cards sit
  interleaved with task cards and nothing else tells them apart.

*Tests — 11 new files, ~90 cases:*

`task-timer-store`, `elapsed-hydration`, `bulk-add-quick-action`,
`module-shortcut-letters`, `module-shortcuts-handler`, `hub-letter-shortcuts`,
`bulk-entry-keeps-drafts`, `goals-template-workbook`, `task-template-dropdowns`,
`review-pct-input`, `day-review-row-actions`, `weekly-goal-group-header`.

**Why**

The timer looked completely dead: click Start Work and the button kept its
label, the clock stayed at `00:00:00`, so you clicked again. The Server Actions
were succeeding the whole time — the ledger showed `work_started` /
`work_paused` / `work_resumed` rows landing correctly. Two things hid that.
First, every control awaited the action and then `router.refresh()`, which on
the task drawer re-renders `/tasks` — 868 rows against a remote database,
measured at **22 seconds** — with no local state to cover the wait. Second, the
clock was server-rendered from the wall clock, so React compared the server's
`00:02:58` against the browser's `00:03:01`, threw `Hydration failed`, and
**discarded the entire task-detail subtree** on every open of a task with a
running timer. A third, quieter fault: none of the three `run()` helpers had a
`.catch()`, so a Server Action that *threw* rejected into nothing — no toast, no
rollback, a button stuck mid-flip.

The rest of the day was the account holder working through the WMS surfaces:
bulk upload from a spreadsheet, letter shortcuts that actually fire, twelve
modules visible without scrolling, one heading per page, tables that scroll
where the data is, and drafts that survive a round trip.

**How to verify**

```bash
pnpm typecheck                        # clean
pnpm test -- --no-file-parallelism    # 10 pre-existing failures, unchanged
```

In the app, on a task detail (`/tasks/<id>` or `/tasks?task=<id>`):

- Start Work → the button becomes Pause and the clock starts inside 600ms, not
  20 seconds. The Time Spent card flips with it.
- Reload while it runs → no `Hydration failed` in the console.
- Pause → the readout keeps the seconds it just banked instead of jumping back.

Measured live, 600ms after each click:

```
INITIAL              00:23:40   ["Start Work","Restart","Resume","Restart"]
0.6s after Start     00:23:40   ["Pause","Restart","Stop","Restart"]
+6s ticking          00:23:45   ["Pause","Restart","Stop","Restart"]
0.6s after Pause     00:23:47   ["Start Work","Restart","Resume","Restart"]
```

Hub: every card's letter badge fires with **Alt+letter** from anywhere, and the
bare letter on `/hub` itself. Twelve cards, two rows, no scrollbar at 1920×1080,
1536×880, 1440×900 or 1280×800.

**Breaking / migration notes**

- No new env vars, no new migrations, no schema changes.
- ⚠️ This work sits **uncommitted on branch `Vinal`** — 36 modified files and 17
  new ones. `origin/main` is at `ea0a8bf7` and contains none of it.
- ⚠️ **Approved % on Daily rows is NOT done.** Goal-tier rows behave as asked;
  daily rows cannot, because `daily_checklist` has no initiator column and no
  `accept_pct`, and `daily_checklist_reviews` is per-day rather than per-item.
  Needs a schema decision before it can be built.
- ⚠️ **The Accounts hub card is reachable but bounces.** `canAccessWorkspace
  ("admin")` allows any admin; `requireAccountsAccess()` wants super-admin or the
  Accounts department, so a plain admin lands on `/accounts` and is sent back to
  `/hub`. Pre-existing, unchanged — clicking the card did the same before. Someone
  has to decide whether to hide the card or widen the route.
- Duplicate headings remain on `/goals/yearly`, `/goals/dashboard`, `/billing`
  and `/training` — the same sweep, not yet applied there.
- The Sales module is hidden locally because Vinal Patil is in Operations/Apps,
  not Sales. Set `DEV_ALL_WORKSPACES="true"` in `.env.local` to see it.
- **Dropdowns missing on another deployment?** The New Task pickers show only
  rows with `is_active = true` (`lib/queries/clients.ts`,
  `lib/queries/subjects.ts`); the Admin panel shows every row. That is the whole
  difference. `UPDATE clients SET is_active = true WHERE is_active = false;` and
  the same for `subjects`. Two caveats: the list is cached for 10 minutes and a
  raw SQL write does not clear that cache, and `WMS` / `WMS App` stay hidden
  regardless because they are retired in code (`lib/tasks/subject-options.ts`),
  replaced by the pinned `Altus Ecosystem`.
- The dev server wedged three times under sustained browser automation and had
  to be killed and restarted. Root cause is the same 22-second `/tasks` render.

**Author:** Vinal Patil

### 2026-09-09 — Task writes were failing on broken sequences; 13 fixes on `Vinal`

**What changed**

*Database — two statements, both `setval`, no row data touched:*

- `event_log_seq_seq` advanced 3 → 10,071 and `tasks_task_no_seq` 1,000 → 2,965,
  past the data already in their tables. The two insert probes either side ran
  inside deliberately rolled-back transactions.

*Application — 13 commits on branch `Vinal`, pushed as `cf058fdb`:*

- `components/tasks/detail/task-attachments.tsx` — a failed upload no longer
  leaves the button disabled; deleting a file also clears its hover preview.
- `app/(app)/tasks/actions.ts` — 14 call sites moved to `dbErrorMessage` +
  `logDbError`, so a failure names its cause instead of tipping the SQL and its
  bound parameters into a toast.
- `app/(app)/tasks/page.tsx` — "Not Read" no longer zeroes every other summary
  pill: `unread` joins the stripped filter set and the `sameScope` test.
- `lib/goals/scope.ts`, `app/(app)/goals/review/*`,
  `app/(app)/weekly-goals/actions.ts` — whoever raised a goal can approve it,
  and an approval under 100% now requires a note.
- `components/ui/hover-tip.tsx` + 12 callers — every hover surface opens
  downward instead of over the row just read.
- `components/dashboard/*`, `components/goals/*` — one badge colour (brand red)
  on every section heading; Task Summary gained the badge it never had; the
  Goals board's own header stopped defaulting to `--color-altus-red-deep`.
- `components/layout/filter-bar.tsx` — the active-filter row no longer appears
  for the default self scope, where it read "1 active · <your name>" on an
  untouched page.
- `components/dashboard/aging-heatmap.tsx` — sizes to its lanes, not to 600px.
- `components/dashboard/exec/{creator-workload,manager-activity}-table.tsx` —
  collapsed delegation sections leave no empty outlined box.
- `components/weekly-goals/weekly-goal-task-group.tsx` — one width for all four
  priority pills.
- `scripts/apply-one-migration.ts` — `--force`, for when a restored
  `__schema_applied` ledger claims files it never ran against this database.

**Why**

Status changes, doer reassignment and task deletion all failed with
`23505 duplicate key value violates unique constraint "event_log_pkey"`,
`Key (seq)=(3) already exists`. The restore loaded rows with their original ids
but left the sequences near 1, so every insert collided: `event_log.seq` next 4
against max 10,071, and `tasks.task_no` next 1,001 against max 2,965 with a
UNIQUE index. Events are written inside the caller's transaction by design
(ARCHITECTURE.md Law 2), so the failing event rolled the operational row back
with it — the status simply never changed, with nothing in the UI to say why.
`tasks.task_no` was the same fault not yet reached; task creation would have
started failing at 1001.

**How to verify**

```bash
pnpm typecheck        # clean
pnpm build            # exits 0 (next build --webpack)
pnpm test -- --no-file-parallelism   # 9 pre-existing failures, unchanged
```

Sequence health — run this after ANY restore, for every serial column, not just
these two. `next` must exceed `max`:

```sql
select (select last_value from public.event_log_seq_seq) as seq_last,
       (select max(seq) from public.event_log)           as col_max;
```

In the app: change a task status. It commits.

**Breaking / migration notes**

- No new env vars, no new migrations.
- ⚠️ **The sequence repair was applied only to the database in `.env.local`.**
  Four task titles on screen at the time were absent from it (1,027 tasks, none
  matching), so if a different database serves users, run the same two `setval`
  statements there or the failures recur. They are safe to re-run.
- ⚠️ This work sits on branch **`Vinal`** at `cf058fdb` — **not** `main`, and
  not deployed.
- Data gap, not a defect: `employees` names only 4 managers and 13 of 23 active
  rows have no `manager_id`, so the manager board is rendering correctly over
  incomplete data. Needs completing in Admin → Employees.

**Author:** Vinal Patil


### 2026-09-08 (late) — WMS team's work merged; four silent reverts caught

**What changed**

- Merged PR #3 (`localaltuscorp-os:wms-integration-pr`) — HR console, Project
  Plan, goals dashboard, attendance devices. **136 new files, +62,503 lines.**
- Restored our versions of 479 files their branch had reverted or mangled.
- Hand-merged 10 files where both sides had real work.
- Fixed their `lib/auth/dev-bypass.ts`, which omitted the five offboarding
  columns and so would not compile against the current schema.
- **Excluded** `.github/workflows/migrations-prod.yml` — see below.

**Why — read this before accepting the next PR from them**

Their branch was cut from this repo on **2 September** and never pulled again.
Git offered it as a clean fast-forward with **zero conflicts**, and it silently
reverted four days of fixes. A green "mergeable" badge means nothing here.

What it would have undone, all restored:

| Reverted | Consequence had it merged |
|---|---|
| `rehostActionLink` + both call sites | every password-reset link 404s again |
| offboarding enums, `employee_exits`, `data_retention_policies` | **build fails** — the offboarding code that imports them was kept |
| `.env*` and `/Altus Backup/` in `.gitignore` | env files and 112MB of salary/PII become committable |
| `"regions": ["bom1"]` in `vercel.json` | deploys leave Mumbai, DB stays in ap-south-1 |
| Access column, `ArchiveEmployeeDialog`, 6543 pooler note, retention cron | assorted |

Their `employee-row-actions.tsx` was **rejected wholesale**: it re-added the
hard-delete dialog and removed `ArchiveEmployeeDialog`. Offboarding stays; hard
delete stays unreachable from the UI (and `emergency_no_employee_delete` blocks
it at the database anyway — known issue 10).

**How to review the next one.** Do not read the diff top to bottom; 456 of their
949 files differed only by their toolchain rewriting `—` to `-`, which buries
the real changes. Instead hash every file in their tree against this branch's
history — if their blob equals an older blob of ours, they changed nothing there
and our version wins. That reduced a 949-file review to 10 genuine merges.

**The excluded workflow.** `migrations-prod.yml` is a `workflow_dispatch` job
running `pnpm db:migrate` against production via `PROD_DATABASE_URL`. Left out
deliberately: the migration chain cannot rebuild the database (known issue 1),
all four CI secrets are empty, and giving CI write access to the production
database is a decision to take on its own merits — not as a side effect of a
feature merge. It still exists on the PR branch if wanted.

**How to verify**

```bash
pnpm typecheck        # passes clean; needs NODE_OPTIONS=--max-old-space-size=6144
pnpm test             # 9 failures across 6 files — IDENTICAL to pre-merge
```

The typecheck no longer OOMs at 6144MB — that is the fix `ci.yml` still needs.
The 9 test failures and 9 lint errors are pre-existing; both were confirmed by
running the same files in a worktree at the pre-merge commit `19f0845f`, not
assumed.

**Breaking / migration notes**

- Their new files reference **migrations 0213/0214**, which have **not** been
  run or verified against production. Check before relying on the new modules.
- No env vars added. `DUMMY_MODE` is documented in `.env.example` but optional.

**Author:** Rohan Choudhary (with Claude)

### 2026-09-08 — Push-to-deploy fixed, outside contributor onboarded, Rashmi restored

**What changed**

- **`git push` deploys again.** Set the repo-local commit author to
  `324000021+Altus-corp@users.noreply.github.com`. See *Deploys* near the top of
  this file for the full diagnosis — the short version is that every commit was
  authored by the old `support@unleashed.in` identity, which Vercel Hobby
  refuses to build. Verified with `b1c85885`.
- **Outside developer onboarded** (`localaltuscorp-os`, GitHub id 324032360) on
  a **fork-and-pull-request** model. He has **read** access only, forks the repo,
  and opens PRs against the new `dev-integration` branch. `main` moves only by a
  deliberate merge.
- **`CONTRIBUTING.md` added** at the repo root, where GitHub surfaces it
  automatically when a PR is opened. Landed via the Contents API as `50b9f0fd`
  because `git push` was stalling.
- **Rashmi Tripathi restored** — `employees` row, `employee_departments` →
  Operations membership, and a working Firebase login. Original row id
  `b60094c4-513f-48ff-84e6-8fb5de54d615` preserved; **new** Firebase UID.
- **Known issue 10 rewritten** to cover the second delete guard,
  `emergency_no_employee_delete`, discovered when it blocked a delete.
- **Known issue 11 closed.**

**Why**

- Branch protection is **impossible** on this repo: GitHub Free gives private
  repos no rulesets and no classic branch protection. Both endpoints return
  *"Upgrade to GitHub Pro or make this repository public."* Read-only access plus
  forks enforces review by withholding write, which needs no paid plan and
  cannot be bypassed by an admin editing a rule. Going public temporarily was
  considered and **rejected**: forks made during a public window stay public
  permanently, bots scan newly-public repos within seconds, and three live
  Google API keys are committed at HEAD (`android-app/app/build.gradle.kts`,
  `android-app/app/google-services.json`, `docs/local-deploy/env.local.template`,
  `tests/unit/site-url.test.ts`). Protection would also stop being enforced the
  moment the repo went private again, so it buys nothing.

**Dead ends, in the order they were hit** — these are the useful part

1. **`DATABASE_URL` is unrecoverable from tooling.** `vercel env pull` writes
   `[SENSITIVE]` for all 19 secrets, and the password on file from 2026-09-04
   is dead (`28P01`). The pooler host is
   `aws-1-ap-south-1.pooler.supabase.com:6543` — **`aws-0`** returns
   *"tenant/user not found"*. All DB work below was therefore run by hand in the
   Supabase SQL Editor.
2. **`ARRAY[]` will not restore.** Generating the row's `tags` column as an
   empty `ARRAY[]` fails with `42P18: cannot determine type of empty array`.
   Emit arrays and JSON as **untyped literals** (`'{}'`, `'{"1","2"}'`) so
   Postgres coerces them to the column's real type; `ARRAY[...]` also wrongly
   forces `text[]`.
3. **Restoring the `employees` row is not enough.** Department membership lives
   in `employee_departments`; the `department` / `department_id` columns on
   `employees` do not grant it. A row restored without it looks correct in the
   roster and still fails department-gated checks.
4. **Offboarding does not release an email address.** `archiveEmployee` sets
   `employment_status = 'former'` and deletes the Firebase user, but keeps the
   real address. `inviteEmployee`'s duplicate check is on email alone with **no
   status filter**, so re-inviting that person fails with *"An employee with
   this email already exists."* `email` is not in `EditEmployeeSchema`, so the
   UI cannot fix it either. **This will hit every rehire** — worth adding a
   status filter to that check.
5. **`deleteEmployee` is deprecated but not gone.** It still works from code;
   it was only unwired from the UI in favour of Offboard.
6. **The delete was blocked, and that was correct.**
   `emergency_no_employee_delete` refused it. The blocked path turned out to be
   unnecessary: `lib/auth/current.ts` resolves the signed-in user with
   `eq(employees.firebaseUid, claims.uid)`, so a restored employee only needs a
   Firebase account whose UID matches that column. Creating the account in the
   Firebase Console and pointing `firebase_uid` at it is an `UPDATE` — no
   delete, no offboard, no touching the lock, and her row id survives.

**How to verify**

```bash
# push-to-deploy: the author must be Altus-corp, state must not be BLOCKED
git log -1 --format='%an <%ae>'
vercel ls altus-os | head -3

# access model: read, and no write anywhere
gh api repos/Altus-corp/Altus-OS/collaborators \
  --jq '.[] | "\(.login) \(.role_name)"'
```

Rashmi: sign in as her with the temporary password — reaching the dashboard
proves the UID matches. In Admin → Employees she is active, Operations, no
Access chip.

**Breaking / migration notes**

- **Run `git config --local user.email "324000021+Altus-corp@users.noreply.github.com"`
  on every machine you commit from**, or that machine's pushes silently stop
  deploying.
- No migrations. The Rashmi fixes were hand-run SQL against production and are
  **not** in the migration chain.
- Kept out of git deliberately: `restore-rashmi.sql`, `rashmi-login.sql`,
  `rashmi-department.sql` in `~/Downloads` contain her full personal record.
  Delete them once she is confirmed working.

**Author:** Rohan Choudhary (with Claude)

### 2026-09-07 (late) — `RESEND_API_KEY` rotated; sender finally working

> **✅ CONFIRMED WORKING 2026-09-07 by the account holder:** password reset
> completes end to end — email delivered from `noreply@altuscorp.in`, link opens
> `os.altuscorp.in/set-password`, password changes successfully. Every layer of
> that chain was verified independently before this: DNS at the authoritative
> nameservers, Firebase link generation in the logs, `rehostActionLink` against
> the real failing URL, and the new Resend key against `/domains`.

**What changed**

- **`RESEND_API_KEY` replaced** (prod + preview) with a key issued from the Resend
  account that actually owns the verified domains. **This also rotates one of the
  six secrets still live from the exposed `.env.production`** — item 5 below is
  now five secrets, not six: `CRON_SECRET`, `GOOGLE_CLIENT_SECRET`,
  `VAPID_PRIVATE_KEY`, `WHISPER_API_KEY`, `OPENROUTER_API_KEY`.

**Why sending kept failing after the domain verified**

Resend's dashboard showed `altuscorp.in` as **Verified**, yet every send failed
with *"The altuscorp.in domain is not verified"*. Both were true at once: the
domain was verified **in the account being viewed**, while `RESEND_API_KEY` was
5 days old and scoped to a different account, for which the domain genuinely did
not exist. `SETUP.md` already warns to check `/domains` **for that API key** —
that is exactly this trap, and the dashboard cannot show it to you.

**Check a Resend key in seconds instead of guessing through deploys:**

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
```

It lists the domains that key can see, with status. If the sending domain is
absent or unverified there, the key is the problem — no deploy required to find
out. This was verified against the new key before it was pushed.

**Note on rebuilding accounts**

The instinct to recreate the Resend account under a company identity was sound,
but unnecessary here — the fix was one API key. Worth knowing if it ever is
necessary: **Resend DKIM values are per-account**, so a new account means
replacing `resend._domainkey.altuscorp.in` and the `send.altuscorp.in` records
in GoDaddy. Given how badly that DNS editor behaved during this outage, treat
any Resend account migration as a planned change, not a quick fix.

**Ownership, still worth fixing deliberately**

Production depends on several *personal* identities: Supabase sits in
`manan.vasa@gmail.com`'s org, Vercel is `manan-8621`, GCP `altuscorp-e7140` has
one human Owner, and commits are authored `support@unleashed.in` (the old
domain) which is why every `git push` is blocked. Consolidating onto a **role
account** on `altuscorp.in` — `ops@`, not any individual's mailbox — removes the
single-person failure mode the repo has already hit once with a departed
developer.

**Author:** Claude Code, working with the `Altus-corp` account holder

### 2026-09-07 (evening) — Domain cutover finished: DNS, sender, and the Firebase action-URL bug

**What changed**

- **`RESEND_FROM_EMAIL` → `Altus Corp Dashboard <noreply@altuscorp.in>`** (prod +
  preview). `altuscorp.in` and `os.altuscorp.in` are now verified in Resend.
  `wms.mananvasa.com` is still verified there from 3 months ago — harmless, worth
  removing once nothing references the old domain.
- **DNS (GoDaddy, `altuscorp.in`)** — `os` now points at Vercel again.

**The outage, and the DNS rule behind it**

Setting up Firebase's *custom domain for email templates* put two TXT records on
`os.altuscorp.in`. **A CNAME cannot coexist with any other record at the same
name**, so adding those TXTs forced out the CNAME that pointed `os` at Vercel.
The site went fully dark — `DNS_PROBE_FINISHED_NXDOMAIN`, which looks like a
Vercel or app failure and is neither. Both GoDaddy nameservers simply had no
address record for the host.

Recovery was slower than it should have been because **GoDaddy's "Save All
Records" is all-or-nothing**: the pending batch contained rows duplicating
records that were already saved, every one of them flagged "conflicts with
another record", and that silently discarded the whole submission — including
the A record we actually needed. The zone serial advanced while nothing we
wanted was being written.

Resolution: **the Firebase custom email domain was never needed.** This app
generates reset links with `generatePasswordResetLink()` and sends them through
**Resend**; Firebase's own email sending, SPF and DKIM are never exercised. The
two TXT records were deleted and `os` restored as a CNAME to Vercel.

> **If you ever re-add the Firebase email domain:** its TXT records and a CNAME
> at `os` are mutually exclusive. Use **A records** (`216.198.79.1`,
> `64.29.17.1`) for Vercel instead — A and TXT coexist fine. The two
> `firebase*._domainkey.os` CNAMEs are at their own names and never conflicted;
> they are still in the zone.

**The Firebase action URL cannot be changed — worked around in code**

Reset links kept 404ing even after `NEXT_PUBLIC_SITE_URL` was corrected, because
the link *host* comes from Firebase, not from us: Authentication → Templates →
"Action URL" (`notification.sendEmail.callbackUri`). It is stuck on
`https://wms.mananvasa.com/set-password` and **cannot be updated** — the Admin
API returns `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` and the console fails with "An
error occurred when updating action URL". `os.altuscorp.in` is already an
authorized domain and the sender is Firebase-managed (`method: DEFAULT`), so
neither is the cause. This looks like a bug on Google's side.

`rehostActionLink()` in `lib/site-url.ts` swaps only the origin of the generated
link, leaving path and query byte-for-byte — `oobCode`, `apiKey`, `continueUrl`
and `lang` untouched. Applied at both `generatePasswordResetLink` call sites
(public reset **and** admin invite links). It follows `NEXT_PUBLIC_SITE_URL`, so
if Google fixes the console setting it silently becomes a no-op.

**Two findings worth acting on**

1. **Why every `git push` shows a failed deployment.** Vercel is linked correctly
   (`github:Altus-corp/Altus-OS`, prod branch `main`) — the repo connection is
   *not* the problem, and disconnecting/reconnecting it changes nothing. The
   commits are authored `Rakesh Dubey <support@unleashed.in>`, which is not
   attached to the `Altus-corp` GitHub account Vercel deploys through, so every
   push is blocked with `UNKNOWN` status and a 0ms build. Fix without upgrading:
   `git config --local user.email "324000021+Altus-corp@users.noreply.github.com"`
   GitHub attributes commits by email, so this makes them land as `Altus-corp`
   and `git push` would deploy normally — retiring the git-less-copy workaround.
2. **Project Framework Preset is `null`** (= "Other"). Only `vercel.json`'s
   `"framework": "nextjs"` saves you. If that line is ever dropped, Vercel serves
   `public/` and **every route 404s while the build reports success** — the
   failure already documented in the 2026-09-02 entry. Set the preset in
   Settings → General as well, so it does not depend on one JSON line.

**Diagnostics that paid off, for next time**

- `vercel logs <deployment> | grep -i error` gave the exact provider message
  every single time — `invalid_grant`, `INVALID_CUSTOM_TOKEN`, `28P01`, and
  "The altuscorp.in domain is not verified". Never infer these from the UI.
- Query the **authoritative** nameservers (`ns55/ns56.domaincontrol.com`)
  directly. Public resolvers cannot distinguish "record missing" from "not yet
  propagated"; the authoritative answer can.

**Still open**

- **Android app** — source now points at `os.altuscorp.in`, but an installed APK
  does not change on a web deploy. Needs a rebuild and redistribution.
- **CI has been red since 2026-09-02** — `pnpm typecheck` dies with
  `FATAL ERROR: JavaScript heap out of memory` (exit 134) on the runner. One
  line fixes it: `NODE_OPTIONS: --max-old-space-size=6144` in `ci.yml`. All four
  CI secrets are also empty, so `pnpm test` would likely fail after it.
- **Letterhead footer** (`lib/hr/entities.ts`) still prints `manan@unleashed.in`
  and `www.mananvasa.com` on offer and selection letters. Branding on legal
  documents — needs a decision, not a config change.
- The other two Firebase email templates (verification, address change) have
  their own action URLs, almost certainly still on the dead host. The code
  workaround does **not** cover them, because the app does not generate those
  links itself.

**Author:** Claude Code, working with the `Altus-corp` account holder


### 2026-09-07 — Domain moved to os.altuscorp.in

**What changed**

- `NEXT_PUBLIC_SITE_URL` → `https://os.altuscorp.in` (production + preview).
  **This was the bug:** password-reset emails are built from this value, so every
  reset link pointed at `wms.mananvasa.com`, which no longer resolves to a
  deployment. Users clicking a valid, unexpired link got Vercel's
  `404 DEPLOYMENT_NOT_FOUND` — the token was fine, the host was gone.
- Replaced the hardcoded old host in 15 files. The ones that actually mattered:
  - `lib/email/onboarding-email.ts` — `ONBOARDING_URL`, sent to new joiners.
  - `lib/hr/letters/templates/selection.ts` — onboarding URL printed on
    selection letters.
  - `android-app/app/build.gradle.kts` — the Android app's `altus.apiBaseUrl`
    default. **The mobile app was pointing at a dead host**; it needs a rebuild
    and redistribution, which a web deploy does not do.
  - `scripts/shoot-*.ts`, `scripts/verify-salary.ts` — screenshot/verify tooling.
  - Four cron route doc-comments, plus comments in `lib/site-url.ts`,
    `lib/google/calendar.ts` and the Android `Color.kt`.
- Historical text in this file and in `docs/` was **not** rewritten — those
  entries describe what was true at the time (rule 3).

**Verified before the change**

- `os.altuscorp.in/login` → 200; `wms.mananvasa.com/login` → 404.
- `os.altuscorp.in` was already in Firebase → Authentication → authorized
  domains (along with `altuscorp.in`), so link generation itself was never the
  failure — only the host the link pointed to.

**Still on the old domain, deliberately — needs a decision**

- `RESEND_FROM_EMAIL` is `Altus Corp Dashboard <noreply@mananvasa.com>`. Changing
  it requires verifying a new sending domain in Resend (DKIM + SPF DNS records,
  ~40 min to propagate last time). Until that is done, **do not change it** — a
  from-address that does not match a verified domain silently stops all mail.
- `lib/hr/entities.ts` letterhead footer, printed on offer/selection letters:
  `DEFAULT_EMAIL = "manan@unleashed.in"`, `DEFAULT_WEBSITE = "www.mananvasa.com"`.
  Both are stale, but they are branding on legal documents, not app config.

**How to verify**

Request a password reset and confirm the emailed link starts with
`https://os.altuscorp.in/set-password?mode=resetPassword&oobCode=...`, then that
it loads the set-password page rather than a Vercel 404.

**Breaking / migration notes**

- Reset links issued before this deploy still point at the dead host and cannot
  work. Anyone holding one must request a fresh link.
- The Android app needs a rebuild to pick up the new API base URL.

**Author:** Claude Code, working with the `Altus-corp` account holder


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
