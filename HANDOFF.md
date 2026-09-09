# Handoff

**Read this first.** It is the living state of the project: what works, what is
broken, what changed and why.

- Setup instructions → [`SETUP.md`](./SETUP.md)
- Replicating this system for a new client → [`docs/WMS_BLUEPRINT.md`](./docs/WMS_BLUEPRINT.md)

> **Every developer and intern must append to the changelog below before their
> work is considered done.** A PR without a changelog entry is incomplete. See
> [How to update this file](#how-to-update-this-file).

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
| **Scale** | 216 pages · 145 API routes · 240 tables · 212 migrations · 35 crons |

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
