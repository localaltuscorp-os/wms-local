/**
 * One-shot local-Postgres prep for the LAN-server deploy. Run BEFORE
 * `pnpm db:migrate` on a fresh install.
 *
 * What it does:
 *   1. Creates the application database (e.g. "altus_corp") if missing.
 *   2. Creates the `authenticated` + `anon` roles the Supabase migrations
 *      reference. They are empty placeholders — RLS is effectively
 *      disabled on local Postgres anyway since the app connects as a
 *      superuser which bypasses RLS.
 *   3. Creates the `app` schema and `app.is_admin()` function the migrations
 *      reference. Always returns false; admin enforcement happens at the
 *      route handler layer in app code, not via RLS.
 *
 * Requires DATABASE_URL to point at a Postgres superuser account (the
 * built-in `postgres` user is fine). Idempotent — safe to re-run.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/setup-local-postgres.ts
 */

import postgres from "postgres";

function parseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
    rebuild(db: string) {
      const next = new URL(url);
      next.pathname = `/${db}`;
      return next.toString();
    },
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set — copy .env.local.example to .env.local first");
  }
  const parsed = parseUrl(databaseUrl);

  // Step 1 — create the app database if missing. Connect to the built-in
  // `postgres` admin database to issue CREATE DATABASE (you cannot create
  // a database from inside itself).
  const adminUrl = parsed.rebuild("postgres");
  console.log(`▸ Connecting to ${parsed.host}:${parsed.port} as ${parsed.user} (admin)…`);
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${parsed.database}`;
    if (rows.length === 0) {
      console.log(`▸ Creating database "${parsed.database}"…`);
      await admin.unsafe(`CREATE DATABASE "${parsed.database}"`);
      console.log(`  ✓ Database created`);
    } else {
      console.log(`  · Database "${parsed.database}" already exists`);
    }
  } finally {
    await admin.end();
  }

  // Step 2 — connect to the app database and create the Supabase-compat
  // shim (roles + schema + dummy is_admin function).
  console.log(`▸ Preparing Supabase-compat shim inside "${parsed.database}"…`);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
      END $$;
    `);
    console.log(`  ✓ role "authenticated"`);

    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
      END $$;
    `);
    console.log(`  ✓ role "anon"`);

    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS app`);
    console.log(`  ✓ schema "app"`);

    // app.is_admin() — referenced by RLS policies in migration 0011 and
    // similar. Returns false because RLS is effectively a no-op on local
    // Postgres (superuser bypasses it) and admin checks happen at the
    // route handler layer via the employees.is_admin column.
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
      LANGUAGE plpgsql STABLE AS $func$
      BEGIN
        RETURN false;
      END
      $func$;
    `);
    console.log(`  ✓ function app.is_admin()`);
  } finally {
    await sql.end();
  }

  console.log(`\n✓ Local Postgres ready. Next:`);
  console.log(`    pnpm db:migrate`);
  console.log(`    pnpm bootstrap-admin -- --email <your-email> --name "<Your Name>"`);
}

main().catch((err) => {
  console.error("\nsetup-local-postgres failed:", err?.message ?? err);
  process.exit(1);
});
