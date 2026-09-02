# Handoff

**Read this first.** It is the living state of the project: what works, what is
broken, what changed and why.

- Setup instructions → [`SETUP.md`](./SETUP.md)
- Replicating this system for a new client → [`docs/WMS_BLUEPRINT.md`](./docs/WMS_BLUEPRINT.md)

> **Every developer and intern must append to the changelog below before their
> work is considered done.** A PR without a changelog entry is incomplete. See
> [How to update this file](#how-to-update-this-file).

---

## Current state — 2026-09-03

| | |
|---|---|
| **Production** | https://wms.mananvasa.com — live, serving authenticated traffic |
| **Repo** | `Altus-corp/Altus-OS`, app at repo root, branch `main` |
| **Hosting** | Vercel, team `altus-corp1`, project `altus-os`, region `bom1` |
| **Database** | Supabase Postgres `mwaijzxuyicysvimzspx`, `ap-south-1` (Mumbai) |
| **Auth** | Firebase `altuscorp-e7140` — 23 users, invite-only |
| **Email** | Resend, `mananvasa.com` verified |
| **Scale** | 216 pages · 143 API routes · 238 tables · 211 migrations · 34 crons |

### Deploys are CLI-only right now

`git push` does **not** auto-deploy. Vercel Hobby rejects commits whose author
isn't the linked GitHub account, and that link still points at a departed
developer's account. Deploy from a git-less copy — see `SETUP.md` §7.

---

## 🔴 Outstanding security actions

Not yet done. Ordered by severity.

1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`.** Still the original key on project
   `mwaijzxuyicysvimzspx`. It bypasses every RLS policy. A developer who left
   without handover may still hold it. **Nothing else on this list matters as
   much.**
2. **Revoke `MananVasa-support` GitHub access.** Then audit **Deploy keys**,
   **Webhooks** and **installed GitHub Apps** — those survive removing a person
   and are the usual back door.
3. **Protect `main`.** Currently unprotected and force-pushable.
4. **Rotate every other credential** the departed developer saw: Firebase
   service account, Resend, Slack, WhatsApp, DigiLocker, OpenRouter, Whisper.
5. **Reconnect Vercel's GitHub** to `Altus-corp` so deploys stop depending on
   the old account.

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
