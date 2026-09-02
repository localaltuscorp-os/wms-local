# Setup: Altus Corp Dashboard end-to-end

This is the walkthrough for getting the dashboard running on a fresh machine — from zero to "I can sign in as an admin and see real tasks." Follow it top-to-bottom. Every command below is copy-pasteable from the repo root (`D:\altus-corp-dashboard`).

## Prerequisites

- **Node.js 22 LTS or newer.** The repo uses Next 16 + `--env-file` flags that need a current Node.
- **pnpm 10.33.0** (the version pinned in `package.json` → `packageManager`). Install with `npm i -g pnpm@10.33.0` or `corepack enable && corepack prepare pnpm@10.33.0 --activate`.
- **Git** for cloning. **OpenSSL** (or any 32-byte random source) for generating cookie secrets.
- **OS notes:** developed on Windows 11 + PowerShell. macOS/Linux work identically; replace `pnpm` invocations 1:1. On Windows, run the commands from PowerShell or Git Bash — both fine.
- **Accounts you will need:**
  - **Supabase** (free tier is enough) — Postgres + Realtime.
  - **Firebase** (free Spark plan is enough) — Authentication only, plus the Cloud Function for custom claims.
  - **Resend** (free tier sends from `onboarding@resend.dev`; verifying a domain is optional but recommended).
  - **Vercel** + a domain registrar are *optional* — only if you want to deploy beyond localhost and point a custom domain at the dashboard.

Install dependencies once and you are ready to wire credentials:

```bash
pnpm install
pnpm dlx firebase login   # one-time, needed only if you plan to run the emulator
```

## Step 1 — Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a strong DB password and the closest region.
2. Wait ~2 minutes for the project to provision.
3. Collect four values from the Supabase dashboard:
   - **`DATABASE_URL`** — *Project Settings → Database → Connection string → URI*. Use the "Session" pooler URI (port 5432) and substitute your DB password into the `:PASSWORD@` slot.
   - **`NEXT_PUBLIC_SUPABASE_URL`** — *Project Settings → API → Project URL*. Looks like `https://abcd1234.supabase.co`.
   - **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — *Project Settings → API → Project API keys → `anon` `public`*. JWT starting with `eyJ…`.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — same page, the `service_role` `secret` key. Server-only — never expose this in the browser.
4. **Enable Realtime on the `tasks` table.** *Database → Replication → `supabase_realtime` publication → toggle `tasks` ON.* The dashboard's "Live" pill subscribes via Realtime; if you skip this it will sit at "Connecting…" forever.
5. **Enable Third-Party Auth (Firebase) for RLS.** *Authentication → Providers → Third-party Auth → add Firebase* and paste your Firebase Project ID once you have it from Step 2. This is what lets RLS policies read `auth.jwt() ->> 'sub'` as a Firebase UID. Migration `0004_m2_rls_helpers.sql` assumes this is wired.

## Step 2 — Firebase project + service account

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**. Disable Google Analytics (we don't use it).
2. **Authentication → Get started → Email/Password → Enable.** Leave "Email link (passwordless sign-in)" off. **Disable public sign-up** by leaving no other providers on — the dashboard is invite-only.
3. **Project Settings (gear icon) → General → Your apps → Add app → Web (`</>`)**. Nickname it anything. Firebase shows a `firebaseConfig` block — copy these:
   - `apiKey` → **`NEXT_PUBLIC_FIREBASE_API_KEY`**
   - `authDomain` → **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`** (e.g. `altus-corp-dev.firebaseapp.com`)
   - `projectId` → **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`** *and* **`FIREBASE_PROJECT_ID`** (same value, two vars — one for the client bundle, one for server)
   - `appId` → **`NEXT_PUBLIC_FIREBASE_APP_ID`** (format `1:000000000:web:0000…`)
4. **Project Settings → Service accounts → Generate new private key.** Downloads a JSON file. From that JSON, extract:
   - `client_email` → **`FIREBASE_CLIENT_EMAIL`**
   - `private_key` → **`FIREBASE_PRIVATE_KEY`** (see Step 4 for the newline-escaping gotcha)
5. **Deploy the `setAuthClaim` Cloud Function** under `functions/` — it stamps `{role: "authenticated"}` onto every new user so Supabase RLS recognizes them. From the repo:
   ```bash
   pnpm dlx firebase use <your-project-id>
   cd functions && npm install && cd ..
   pnpm dlx firebase deploy --only functions
   ```
6. **Optional but recommended for local dev: the Firebase Auth Emulator.** It is preconfigured in `firebase.json` to run on port 9099 (Auth) + 4000 (UI). When the emulator vars are set in `.env.local`, every auth call hits localhost instead of live Firebase — so you can blow away users freely. Start it with `pnpm emul` standalone, or combined with Next via `pnpm dev:full`.

## Step 3 — Resend

1. Sign up at [resend.com](https://resend.com).
2. **API Keys → Create API Key** (full-access is fine for now) → **`RESEND_API_KEY`** (starts with `re_`).
3. **Optional but recommended: verify your sending domain** under *Domains → Add Domain*. Add the DNS records they show you. Until verified, Resend will only let you send to the address you signed up with — useful for testing, not for inviting real teammates.
4. Set **`RESEND_FROM_EMAIL`** to either a verified address (e.g. `"Altus Corp Dashboard <dashboard@your-domain.com>"`) or fall back to `"Altus Corp Dashboard <onboarding@resend.dev>"` (Resend's shared sandbox) for first-light testing.

## Step 4 — Fill `.env.local`

```bash
cp .env.local.example .env.local
```

Open `.env.local` in your editor and fill in every value from Steps 1–3. The full key list, with where each value comes from:

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase → DB → URI | Substitute the DB password into `:PASSWORD@`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API | JWT, `eyJ…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | JWT, `eyJ…` — server only |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config | |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web config | ends in `.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web config | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web config | format `1:<sender>:web:<hex>` |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | Local emulator | `localhost:9099` in dev, **leave empty in prod** |
| `FIREBASE_AUTH_EMULATOR_HOST` | Local emulator | same value, server-side mirror |
| `FIREBASE_PROJECT_ID` | Service account JSON | same as the `NEXT_PUBLIC_` one |
| `FIREBASE_CLIENT_EMAIL` | Service account JSON `client_email` | ends in `iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Service account JSON `private_key` | **See gotcha below** |
| `COOKIE_SECRET_CURRENT` | Generate locally | 32+ random chars |
| `COOKIE_SECRET_PREVIOUS` | Generate locally | 32+ random chars, different from current |
| `RESEND_API_KEY` | Resend dashboard | `re_…` |
| `RESEND_FROM_EMAIL` | Your verified sender | `"Name <addr@domain>"` |
| `NEXT_PUBLIC_SITE_URL` | Where the app runs | `http://localhost:3000` locally |

**The `FIREBASE_PRIVATE_KEY` newline gotcha.** The PEM in your downloaded JSON is multi-line. `.env.local` files cannot hold real newlines, so you must collapse the line-breaks into the two-character escape `\n` and wrap the whole thing in double-quotes:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIB...\n...\n-----END PRIVATE KEY-----\n"
```

The codebase (`lib/firebase/admin.ts`, `middleware.ts`, `scripts/bootstrap-admin.ts`) calls `.replace(/\\n/g, "\n")` on read — so the escaped form is the *required* form, not just a workaround.

**Generate the cookie secrets** with any 32-byte random source. Both keys must be ≥32 characters and *different* (one is current, one is the previous-rotation fallback used by `next-firebase-auth-edge` for zero-downtime rotation):

```bash
# macOS / Linux / Git Bash
openssl rand -hex 32

# PowerShell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Run that twice; paste the outputs into `COOKIE_SECRET_CURRENT` and `COOKIE_SECRET_PREVIOUS`.

**Verify before continuing:**

```bash
pnpm verify:env
```

`scripts/verify-env.ts` checks every var above for presence + shape, refuses any value still on a `.env.local.example` placeholder, and dry-runs the Firebase Admin SDK initialization. It exits non-zero if anything is off. Fix the `✗` rows and re-run until it prints `✓ Environment ready.`

## Step 5 — Run migrations

```bash
pnpm db:migrate
```

This applies the 9 SQL migrations in `db/migrations/` to your Supabase Postgres in order:

| # | File | What it does |
|---|---|---|
| 0000 | `0000_harsh_thena.sql` | Initial schema: `employee_role`/`task_priority`/`task_status` enums + `employees` + `tasks` tables |
| 0001 | `0001_curved_firedrake.sql` | Replace `task_priority` with the Eisenhower 4-quadrant set, add `subject` column |
| 0002 | `0002_m2_auth_columns.sql` | M2 auth: `firebase_uid` / `is_admin` / `is_active` / `invited_at` / `joined_at` on `employees` |
| 0003 | `0003_m2_drop_redundant_index.sql` | Drop a redundant index from 0002 |
| 0004 | `0004_m2_rls_helpers.sql` | `app.current_employee_id()` + `app.is_admin()` SECURITY DEFINER helpers used by every RLS policy |
| 0005 | `0005_m2_rls_policies_phase1.sql` | Enable RLS on `employees` + `tasks`; read-only policies for authenticated users |
| 0006 | `0006_m2_task_columns.sql` | M2.1 task provenance: `created_by_id` / `approved_by_id` / `approved_at` / `approval_note` / `updated_at` |
| 0007 | `0007_m2_task_events.sql` | Append-only `task_events` audit table |
| 0008 | `0008_m2_task_writes_rls.sql` | Phase-2 RLS: tighten task writes to creator/initiator/doer/admin |

**Prerequisite:** the RLS policies in 0004/0005/0008 reference Firebase UIDs through `current_setting('request.jwt.claims', true)::jsonb ->> 'sub'`. This only works if you wired Supabase's Third-Party Auth (Firebase) integration in Step 1.5 — otherwise reads will be blocked for everyone. If `db:migrate` succeeds but `/` returns a blank dashboard for a signed-in admin, suspect the TPA wiring first.

## Step 6 — Bootstrap the first admin

The app is invite-only — so there is a chicken-and-egg on a fresh DB. The bootstrap script breaks it once per environment.

```bash
cp .env.local .env.bootstrap     # bootstrap script reads from .env.bootstrap, not .env.local
pnpm bootstrap-admin --email heteshvichare927@gmail.com --name "Hetesh Vichare"
```

> **pnpm 10 note:** older docs showed `pnpm bootstrap-admin -- --email ...` with a `--` separator. Drop the `--` on pnpm 10 — it's now passed through as a literal positional and `parseArgs` rejects it with `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL`.

`scripts/bootstrap-admin.ts` does three things in order:

1. Creates a Firebase user with `emailVerified: true` and stamps `{role: "authenticated"}` as a custom claim (belt-and-suspenders alongside the Cloud Function).
2. Inserts an `employees` row with `isAdmin: true`, `isActive: true`, `firebaseUid` linked.
3. Generates a Firebase password-reset link pointing at `${NEXT_PUBLIC_SITE_URL}/welcome` and emails it via Resend. If Resend isn't configured, the link prints to stdout — share it out of band.

You'll receive an email like "Reset your Altus Corp password." Click through to `/set-password`, set a password, land on `/welcome`.

**Then delete `.env.bootstrap`** — it contains the service-role key. Full runbook with troubleshooting at `docs/runbooks/bootstrap-first-admin.md`.

## Step 7 — Seed dummy data (optional)

If you want a populated dashboard for demos rather than a welcome-hero empty state:

```bash
pnpm seed            # ~20 employees, ~1200 tasks, ~20 archived — see scripts/seed.ts
pnpm seed:firebase   # mirrors every seeded employee into the Firebase emulator with password "dev1234"
```

- `pnpm seed` writes only to Supabase. It populates `employees` (3 named — Dhruv, Hetesh, Mishtie — plus 17 faker rows) and `tasks` (1200 active + 20 archived, distributed across all 9 statuses and 4 priorities).
- `pnpm seed:firebase` runs *after* `pnpm seed`. It finds every employee with a null `firebase_uid`, creates the corresponding emulator user with password `dev1234`, and writes the new UID back to the row. **This script refuses to run unless `FIREBASE_AUTH_EMULATOR_HOST` is set** — it is dev-only. After this, you can sign in at `/login` as any seeded email with `dev1234`.
- `pnpm seed:reset` truncates `tasks` and `employees` back to empty. You will need to re-bootstrap the admin (or re-seed) afterwards.

## Step 8 — Run the dev server

If you set the emulator vars in `.env.local`:

```bash
pnpm dev:full        # runs Next dev + Firebase emulator concurrently
```

This is the recommended path — fast iteration, no live Firebase calls, free password resets. Open <http://localhost:3000>.

If you are pointing at live Firebase (no emulator vars set):

```bash
pnpm dev             # Next dev only
```

Either way you should see a `/login` page if not signed in, or the dashboard if your `__session` cookie is valid.

## Step 9 — Smoke the lifecycle

Once you can sign in as the admin you bootstrapped:

1. `/` — dashboard renders (welcome hero if no seed, full 6-section view if seeded).
2. `/admin/employees` — invite a second employee (sends them a Resend email).
3. `/tasks/new` — create a task assigned to that employee.
4. `/tasks/[id]` — exercise the workflow row actions (start, complete, approve, reassign, transfer, cancel, comment) and watch the audit feed populate.

For the detailed click-through, see the admin-perspective walkthrough alongside this file.

## Common pitfalls

- **`FIREBASE_PRIVATE_KEY` newline escaping.** This is the #1 cause of "Admin SDK init threw: invalid PEM" failures. The value in `.env.local` must use literal `\n` two-character sequences (not real newlines) and must be wrapped in double-quotes. `pnpm verify:env` catches this.
- **Cookie-secret rotation.** `COOKIE_SECRET_CURRENT` and `COOKIE_SECRET_PREVIOUS` are both honored by middleware — when you rotate, move the old current to previous and put a fresh value in current; existing sessions survive one rotation cycle. Both must be ≥32 chars; both must be present even on first install (use two different random values).
- **Migrations 0006–0008 snapshots missing from `db/migrations/meta/`.** The `_journal.json` lists all 9 tags, but only the first 6 snapshot JSONs are present. This is a known follow-up — it does **not** block `pnpm db:migrate` (Drizzle reads the `.sql` files directly), only `pnpm db:generate` for new migrations on top of 0008. If you need to author migration 0009, regenerate the snapshots first by running `pnpm db:generate` against a database already at 0008 and committing the resulting `meta/0006…0008_snapshot.json` files.
- **`next lint` is currently broken on Next 16** (`eslint-config-next` was not yet updated for the v16 lint runner when this stack was assembled). Skip it for now; `pnpm typecheck` + `pnpm test` cover the gap. CI runs `pnpm typecheck` and `pnpm test:visual` instead.
- **Supabase Realtime not enabled.** The "Live" indicator in the header silently stays on "Connecting…" — enable `tasks` in the `supabase_realtime` publication (Step 1.4).
- **Supabase Third-Party Auth not wired.** RLS policies block reads even for signed-in admins. The `auth.jwt() ->> 'sub'` claim must be a Firebase UID — without TPA it will be a Supabase UUID and `app.current_employee_id()` returns null.
- **Resend domain unverified.** Invites will only deliver to the email you signed up with. Verify your domain in Resend before inviting real teammates. Until then, you can hand out the reset link the bootstrap script prints to stdout.
- **`.env.bootstrap` left on disk.** It contains the service-role key. Delete it the moment the bootstrap script finishes.
