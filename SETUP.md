# Setup

Get the Altus Corp Dashboard running locally, then deployed. Read this end to
end before starting — several steps have gotchas that cost hours if hit blind.

> **New to the project?** Read [`HANDOFF.md`](./HANDOFF.md) first for current
> state, known issues, and what changed recently.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **22.x** | 20 LTS also works. Vercel builds on 24.x. |
| pnpm | **10.33.0** | Pinned in `packageManager`. `npm i -g pnpm@10.33.0` |
| PostgreSQL | **16.x** | Or a Supabase project. See §3. |
| Java | 11+ | Only for the Firebase Auth emulator (local login). |
| Git | any | |

**Windows note:** EnterpriseDB now blocks automated downloads (winget returns
`403`). Use the portable build instead:

```bash
# Zonky ships the same Postgres 16.15 binaries via Maven Central
curl -sL -o pg.jar https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/16.15.0/embedded-postgres-binaries-windows-amd64-16.15.0.jar
unzip -o pg.jar && tar -xJf postgres-windows-x86_64.txz
./bin/initdb.exe -D data -U postgres --pwfile=pwfile -E UTF8 --auth=scram-sha-256
./bin/pg_ctl.exe -D data -o "-p 5432" -l logfile.txt start
```

This build ships `initdb`, `pg_ctl` and `postgres` only — **no `psql`, no
`pg_dump`**. Fine for running the app; install full Postgres if you need backups.

---

## 2. Install

```bash
git clone https://github.com/Altus-corp/Altus-OS.git
cd Altus-OS
pnpm install          # ~600 MB, 2-5 min
```

---

## 3. Environment

Copy `.env.example` and fill it in as `.env.local` (gitignored):

```bash
cp .env.example .env.local
```

### Required — the app will not boot without these

`lib/env.ts` validates these with Zod at startup and **throws on any missing
one**, which fails the build, not just runtime:

```env
DATABASE_URL="postgresql://postgres:<pw>@localhost:5432/altus_corp"
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

> For **local Postgres**, the Supabase values are never contacted — they only
> need to pass URL/length validation. Use `http://localhost:54321` and any
> 20+ char string, and set `NEXT_PUBLIC_DISABLE_REALTIME="true"`.

> On **Vercel/Supabase**, use the **pooled** connection string (port `6543`),
> not direct (`5432`). Serverless functions exhaust direct connections.

### Required for login

```env
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""      # see warning below
COOKIE_SECRET_CURRENT=""     # 48 random chars
COOKIE_SECRET_PREVIOUS=""    # 48 different random chars
CRON_SECRET=""               # 32 random chars
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
```

> ### ⚠️ `FIREBASE_PRIVATE_KEY` — the single most common setup failure
>
> Keep the `\n` sequences as **literal backslash + n**, on one line, wrapped in
> double quotes. The code does `.replace(/\\n/g, "\n")` at runtime.
>
> - ✅ `"-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"`
> - ❌ real newlines (breaks `.env` parsers)
> - ❌ no separators at all (unparseable PEM — **the build succeeds and login
>   silently fails at runtime**)
>
> Never "repair" this key with a regex that strips non-base64 characters —
> `[^A-Za-z0-9+/=]` deletes the backslash but keeps the `n`, injecting stray
> characters into the base64 body. Verify with:
> ```bash
> node -e "const k=process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g,'\n');
> const b=k.split('\n').filter(Boolean).slice(1,-1).join('');
> console.log('valid:', Buffer.from(b,'base64').length > 1000)"
> ```

Everything else in `.env.example` is optional and degrades gracefully.

---

## 4. Database

```bash
pnpm setup:local-postgres    # local Postgres only; skip on Supabase
pnpm db:migrate
```

### ⚠️ A fresh migration run currently fails three times

The chain **cannot rebuild the database unaided**. See `HANDOFF.md` → Known
Issues. Until fixed, apply these in order:

**1. Fails at `0024_dont_know_status.sql`**
`invalid input value for enum task_status: "dont_know"`

```bash
pnpm tsx --env-file=.env.local scripts/apply-dont-know.ts
pnpm db:migrate     # resume
```

**2. Fails at `0033_storage_documents_rls.sql`** (local Postgres only)
`schema "storage" does not exist`

```sql
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
```

**3. Fails at `0206_device_kind_laptop_phone.sql`**
`column m.status does not exist`

```sql
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
```

Then `pnpm db:migrate` completes — 211 migrations.

---

## 5. First admin

`pnpm seed` is **disabled by design** — the system starts empty. Create the
first admin instead:

```bash
cp .env.local .env.bootstrap     # add SUPABASE_SERVICE_ROLE_KEY
pnpm bootstrap-admin --email you@company.com --name "Your Name"
rm .env.bootstrap                # contains service-role credentials
```

> Do **not** use `pnpm bootstrap-admin -- --email ...`. pnpm 10 forwards the
> `--` as a positional argument and Node's `parseArgs` rejects it.

The script prints a password-reset link to the terminal when Resend isn't
configured. Open it, set a password, sign in.

---

## 6. Run

```bash
pnpm dev            # http://localhost:3000
```

### Fully local login (no cloud Firebase)

Needs Java. Uses the Firebase Auth emulator:

```bash
pnpm exec firebase emulators:start --only auth --project <your-project>
```

Add to `.env.local`:

```env
FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
```

`cert()` still needs a *parseable* key, so generate a throwaway one —
credentials are ignored once the emulator host is set:

```bash
openssl genpkey -algorithm RSA -out dummy.pem -pkeyopt rsa_keygen_bits:2048
```

Set a known password via the emulator's admin API:

```bash
curl -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/<pid>/accounts:update" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"localId":"<uid>","password":"dev1234","emailVerified":true}'
```

Emulator UI: http://127.0.0.1:4000

---

## 7. Deploy (Vercel)

```bash
pnpm build          # verify locally first - stricter than `pnpm dev`
```

`pnpm dev` uses Turbopack; `pnpm build` uses webpack and catches errors the dev
server does not. Always build before deploying.

### Project settings that must be correct

| Setting | Value | Why |
|---|---|---|
| Framework Preset | **Next.js** | If "Other", Vercel serves `public/` and **every route 404s while the build reports success** |
| Root Directory | `.` | App lives at repo root |
| Region | **`bom1`** | Must match the Supabase region. Set in `vercel.json` |

Both are pinned in `vercel.json` so they survive redeploys:

```json
{ "framework": "nextjs", "regions": ["bom1"], "crons": [ ... ] }
```

> **Region matters more than it looks.** Functions defaulting to `iad1`
> (Washington) against a Mumbai database added ~200-250 ms *per query*.
> Co-locating roughly halved TTFB.

### ⚠️ Vercel Hobby blocks deploys by commit author

On Hobby plans only commits authored by the linked GitHub account build.
Everything else sits at status `UNKNOWN` with `0ms` build time — it looks stuck,
not failed.

**Workaround** — deploy from a copy with no `.git` (keep `.vercel/`):

```bash
tar --exclude=.git --exclude=node_modules --exclude=.next -cf - . | (cd /tmp/deploy && tar -xf -)
rm -f /tmp/deploy/.env*.local          # see the warning below — do not skip this
cd /tmp/deploy && vercel deploy --prod --yes
```

> ⚠️ **Strip `.env*.local` from the copy.** The tar line excludes `.git`,
> `node_modules` and `.next` — but NOT `.env.local`, which sets
> `FIREBASE_AUTH_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` and
> `ALLOW_INSECURE_COOKIES` for local development. `NEXT_PUBLIC_*` values are
> inlined into the client bundle at build time, so any key Vercel does not
> itself define ships to production — pointing live auth at a `127.0.0.1`
> emulator. Production environment comes from Vercel; the file is never needed
> in the deploy copy. *(Found 2026-09-05, after two deploys that had to remove
> it by hand.)*

**Real fix** — Vercel → Settings → Login Connections → reconnect GitHub as the
account that authors commits. Then `git push` auto-deploys normally.

### Push environment variables

```bash
vercel env add KEY production      # value on stdin
```

`NEXT_PUBLIC_*` values that look like credentials (Supabase anon key, Firebase
API key) need `--no-sensitive --force --yes`, or the CLI blocks on a prompt.
Both are public by design. Set every variable for **production *and* preview**.

---

## 8. Email (Resend)

Password reset and invites go through Resend.

1. Verify your sending domain at https://resend.com/domains — add the DKIM TXT
   and the two SPF records to DNS.
2. Set `RESEND_FROM_EMAIL="Name <noreply@yourdomain.com>"`.

> **Resend matches domains exactly.** A verified `wms.example.com` does **not**
> authorise sending from `example.com`, or vice versa. The from-address domain
> must be the verified one.

> DKIM verification runs through Amazon SES and can take **40 minutes to 72
> hours** after DNS is correct. Records showing `pending` with correct DNS is
> normal — wait, don't re-add them.

### Firebase authorized domains

Add every domain you serve from to **Firebase Console → Authentication →
Settings → Authorized domains**, or `generatePasswordResetLink` throws
`auth/unauthorized-continue-uri` and reset fails with *"We couldn't start the
reset just now."*

`localhost` is allowlisted by default — which is why reset appears to work
locally and breaks in production.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails, `ZodError` on `DATABASE_URL` | Env vars missing on the platform | Add all three required vars |
| Every route 404s, build succeeded | Framework Preset is "Other" | `"framework": "nextjs"` in `vercel.json` |
| Deploy stuck `UNKNOWN`, `0ms` build | Hobby commit-author block | Deploy from a git-less copy |
| Login works locally, fails in prod | Wrong Firebase project, or user absent | Check Firebase → Authentication → Users |
| "We couldn't start the reset just now" | Domain not in Firebase authorized domains | Add it |
| "generated your reset link but couldn't email it" | Resend domain unverified, or from-address ≠ verified domain | Check `/domains` for **that API key** |
| `Failed to find Server Action` | Stale browser tab after deploy | Hard-refresh (Ctrl+Shift+R) |
| App slow, queries fine locally | Functions in a different region from the DB | Pin `regions` in `vercel.json` |

**Debug production properly** — don't infer from screenshots:

```bash
vercel logs https://your-domain.com | grep -i error
```

The server actions log real provider errors. This resolved in seconds what took
several rounds of guesswork.

---

## Command reference

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build (webpack, stricter) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript strict |
| `pnpm test` | Vitest unit tests |
| `pnpm test:visual` | Playwright visual smoke tests |
| `pnpm db:generate` | Generate migration from Drizzle schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio (visual DB browser) |
| `pnpm verify:env` / `pnpm verify:db` | Config and connection checks |
| `pnpm bootstrap-admin` | Create first admin |
| `pnpm start:lan` | Serve on `0.0.0.0:3000` for LAN access |
