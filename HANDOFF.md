# Handoff

**Read this first.** It is the living state of the project: what works, what is
broken, what changed and why.

- Setup instructions → [`SETUP.md`](./SETUP.md)
- Replicating this system for a new client → [`docs/WMS_BLUEPRINT.md`](./docs/WMS_BLUEPRINT.md)

> **Every developer and intern must append to the changelog below before their
> work is considered done.** A PR without a changelog entry is incomplete. See
> [How to update this file](#how-to-update-this-file).

---

## Current state — 2026-09-04

**🔴 Active security incident in progress — read the section below the table
before doing anything else.**

| | |
|---|---|
| **Production** | https://wms.mananvasa.com — live, serving authenticated traffic |
| **Repo** | `Altus-corp/Altus-OS`, app at repo root, branch `main` |
| **Hosting** | Vercel, team `altus-corp1`, project `altus-os`, region `bom1` |
| **Database** | Supabase Postgres `mwaijzxuyicysvimzspx`, `ap-south-1` (Mumbai) |
| **Auth** | Firebase `altuscorp-e7140` — **1 user as of 2026-09-04, 23 deleted mid-incident, see below** |
| **Email** | Resend, `mananvasa.com` verified |
| **Scale** | 216 pages · 143 API routes · 238 tables · 211 migrations · 34 crons |

### Deploys are CLI-only right now

`git push` does **not** auto-deploy. Vercel Hobby rejects commits whose author
isn't the linked GitHub account, and that link still points at a departed
developer's account. Deploy from a git-less copy — see `SETUP.md` §7.

---

## 🔴 ACTIVE INCIDENT — resume here (2026-09-04, ~04:00 UTC / ~09:30 IST)

**Someone has direct access to `DATABASE_URL` and `FIREBASE_PRIVATE_KEY` and is
using them right now, bypassing the app entirely.** Not a session/cookie issue —
confirmed by writing straight to Postgres and calling the Firebase Admin API
with no app login at all. Full detail in the 2026-09-03/04 changelog entry
below. **Do not consider this resolved until both of the two steps just below
are done and confirmed.**

### Do these two first, before anything else on this list

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

3. **Rotate `SUPABASE_SERVICE_ROLE_KEY`.** Still the original key. Bypasses
   every RLS policy. Rotating the JWT secret in Supabase rotates this
   *and* `NEXT_PUBLIC_SUPABASE_ANON_KEY` together — coordinate the env-var
   push so the site isn't broken mid-rotation.
4. **Reactivate the wrongly-locked employees** — but only after steps 1-2
   above are confirmed done, not before. As of this writing **17 of 28
   employees have `is_active=false`**, most from an unauthorized actor, some
   legitimately unrelated. Full current list in the changelog entry. Cross-
   check each against `employee_events.note` before flipping back.
5. **Rotate every other secret in `.env.production`**: `CRON_SECRET`,
   `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`,
   `WHISPER_API_KEY`, `OPENROUTER_API_KEY`. Same file, same exposure — no
   reason to assume these are clean just because they haven't been abused yet.
6. **Delete `.env.production` and `.env.production.bak`** from
   `Downloads/ALTUS OS/` once every value in them has been rotated. Keep
   secrets only in Vercel's env store; use `vercel env pull` when a local copy
   is needed for a one-off script, then delete it.
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

### 4. 34 crons on a Hobby plan (limit: 2)

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

---

## Changelog

### 2026-09-03/04 — Unauthorized access incident (ONGOING — see 🔴 above)

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
