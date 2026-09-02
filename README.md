# Altus Corp Dashboard

Internal work-management dashboard for the Altus Corp team. Tracks tasks, status, performance, and accountability across the team in one editorial, status-coded surface.

## Quickstart

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase / Firebase / Resend values
pnpm db:generate                    # generate first migration
pnpm db:migrate                     # apply schema to your dev Supabase
pnpm seed                           # populate fake data (~20 emp, ~1200 tasks)
pnpm dev                            # http://localhost:3000
```

The dashboard renders an empty-state welcome hero until at least one task or employee exists. `pnpm seed:reset` wipes everything; `pnpm seed` repopulates.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript strict |
| `pnpm test` | Vitest unit tests on transforms |
| `pnpm test:visual` | Playwright visual smoke tests (Chromium, desktop + mobile viewport) |
| `pnpm db:generate` | Generate SQL migration from Drizzle schema |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |
| `pnpm seed` | Seed dev DB with realistic data |
| `pnpm seed:reset` | Truncate seeded data |

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind v4 + custom CSS · Supabase Postgres · Drizzle ORM · TanStack Table · Recharts · Motion · Radix primitives · Vercel.

## Authentication & Environments

Auth is **invite-only**. New employees are created by an admin from `/admin/employees`; they receive a branded email and set their password on `/set-password`. There is no public sign-up.

### Identity stack

- **Firebase Auth** issues identity (email + password, password-reset emails).
- A 5-day `__session` cookie carries the verified session, created by `admin.auth().createSessionCookie()` after the client signs in.
- **`next-firebase-auth-edge`** middleware verifies the cookie on every request with `checkRevoked: true`, so deactivated employees lose access immediately.
- **Supabase Postgres** is the data store. Firebase ID tokens are passed to `supabase-js` via its `accessToken` callback so RLS policies (using Third-Party Auth) evaluate `auth.jwt() ->> 'sub'` against Firebase UIDs.

### Environments

| Env | Supabase | Firebase | Notes |
|---|---|---|---|
| Local dev | `supabase start` | Firebase Auth Emulator (port 9099) | Run `pnpm dev:full` to start both + Next. Seed users have password `dev1234`. |
| Preview / Production | (to be created when production Altus Corp Firebase project is set up) | (to be created when production Altus Corp Firebase project is set up) | First admin is created via `pnpm bootstrap-admin` — see `docs/runbooks/bootstrap-first-admin.md`. |

### Local quick-start

```bash
# Once per machine
pnpm dlx firebase login
pnpm install

# Each session
pnpm dev:full        # Next + emulator + (start Supabase separately if local)
pnpm seed            # seed Supabase
pnpm seed:firebase   # mirror seeded users into the emulator
```

Then sign in at http://localhost:3000/login with any seeded email + password `dev1234`.

### Bootstrap the first admin

```bash
cp .env.local .env.bootstrap     # copy and add SUPABASE_SERVICE_ROLE_KEY
pnpm bootstrap-admin --email heteshvichare927@gmail.com --name "Hetesh Vichare"
```

Then delete `.env.bootstrap`. Full runbook at `docs/runbooks/bootstrap-first-admin.md`.

### Resetting state

```bash
pnpm seed:reset      # truncates tables back to empty (no users)
```

After a reset, run `pnpm bootstrap-admin` to recreate the first admin in dev, or rerun `pnpm seed && pnpm seed:firebase` to repopulate.
