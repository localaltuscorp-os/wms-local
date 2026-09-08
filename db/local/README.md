# Local dummy database

A throwaway Postgres holding **fake data**, so the app can be developed without
the live Supabase project. Nothing in here can reach production: the cluster
listens on loopback only, and `scripts/seed-dummy.ts` refuses to run against any
host that is not `127.0.0.1` / `localhost`.

Pair it with `DISABLE_AUTH="true"` in `.env.local` (see `lib/auth/local-session.ts`)
and the app opens straight on `/hub` with no sign-in.

## Where it lives

| | |
|---|---|
| Cluster data dir | `C:\Users\Vinal\Downloads\WMS\local-postgres\data` |
| Server log | `C:\Users\Vinal\Downloads\WMS\local-postgres\server.log` |
| Port | `55432` (the stock `postgresql-x64-18` service on 5432 is untouched) |
| Auth | `trust` — no password, loopback only |
| Database | `altus_corp_dev` |
| `DATABASE_URL` | `postgresql://postgres@127.0.0.1:55432/altus_corp_dev` |

It is deliberately **outside the git checkout** so a `git clean` can't wipe it.

## Start / stop

```powershell
$PG = 'C:\Program Files\PostgreSQL\18\bin'
$D  = 'C:\Users\Vinal\Downloads\WMS\local-postgres\data'
$L  = 'C:\Users\Vinal\Downloads\WMS\local-postgres\server.log'

& "$PG\pg_ctl.exe" -D $D -l $L -o "-p 55432 -c listen_addresses=127.0.0.1" start
& "$PG\pg_ctl.exe" -D $D stop
& "$PG\pg_isready.exe" -h 127.0.0.1 -p 55432      # is it up?
```

It does **not** start with Windows — start it before `pnpm dev`, or the app will
show a connection error.

## Rebuilding it from scratch

Only needed if the cluster is deleted or the schema has to be rebuilt.

```powershell
$PG = 'C:\Program Files\PostgreSQL\18\bin'
& "$PG\initdb.exe" -D 'C:\Users\Vinal\Downloads\WMS\local-postgres\data' -U postgres --auth-local=trust --auth-host=trust -E UTF8
# …start it (above), then:
& "$PG\psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d postgres -c 'CREATE DATABASE altus_corp_dev;'

pnpm tsx --env-file=.env.local scripts/setup-local-postgres.ts   # Supabase-compat roles + app schema
& "$PG\psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d altus_corp_dev -v ON_ERROR_STOP=1 -f db/local/supabase-stubs.sql
pnpm db:migrate                                                   # fails at 0206 — expected
& "$PG\psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d altus_corp_dev -v ON_ERROR_STOP=1 -f db/local/schema-gaps.sql
pnpm db:migrate                                                   # completes
pnpm seed:dummy -- --apply                                        # the fake rows
```

### Why the migration run needs two passes

Two things production has were never captured in `db/migrations/*.sql`, so a
database built purely from that set is missing them:

1. **`task_status.dont_know`** — `0024` leaves its `ALTER TYPE … ADD VALUE`
   commented out (it cannot run inside the runner's transaction) and expects
   `scripts/apply-dont-know.ts` to have run it.
2. **`mobile_devices.status` / `approved_by_id` / `approved_at` / `revoked_at`** —
   in `db/schema.ts` and read by `0206_device_kind_laptop_phone.sql`, but no
   migration file ever adds them.

`schema-gaps.sql` supplies both. It has to run after `0063` creates
`mobile_devices`, hence the two passes. **This is a real gap in the migration
set, not a local quirk** — anyone building a fresh database (a new dev, a LAN
install, a restore drill) hits it. Worth closing with a proper migration.

## Seeding

```powershell
pnpm seed:dummy            # dry run — prints what it would write
pnpm seed:dummy -- --apply # writes
```

12 employees (including the `DEV_USER_EMAIL` account as an admin), 8 clients, 90
tasks across every status and a due window straddling today, 3 weeks of weekly
goals, and a year → quarter → month goal tree per person. The generator is
seeded with a fixed PRNG, so the dataset is identical on every run — a fixture
that shifts under you makes "did my change cause that?" unanswerable.

Re-running clears the rows it owns and rewrites them; it does not accumulate.

## Going back to real data

1. Get the current connection string from Supabase → Project Settings → Database.
2. In `.env.local`, comment out the local `DATABASE_URL` and restore the
   production one with the fresh password.
3. Comment out `DISABLE_AUTH="true"` to bring the login wall back.
4. Stop the local cluster (optional — it costs nothing idle).

Nothing about the local database ever reaches a deployment: `.env.local` is
gitignored, and `localSessionEnabled()` is hard-false whenever `VERCEL` is set.
