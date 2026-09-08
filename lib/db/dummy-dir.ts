import { join } from "node:path";

/**
 * Where DUMMY MODE keeps its throwaway Postgres.
 *
 * Its own module because both the setup script and the runtime db client need
 * the same path, and neither should import the other: the script pulls in
 * `node:fs` and the migration runner, the client is loaded by every server
 * render.
 *
 * Overridable with DUMMY_DB_DIR so two checkouts on one machine can hold
 * separate dummy databases. Relative to the process cwd, which for both `pnpm
 * dev` and the setup script is the `task-management/` package root.
 */
export const DUMMY_DB_DIR = process.env.DUMMY_DB_DIR ?? join(process.cwd(), ".pglite");

/**
 * Where DUMMY MODE keeps uploaded FILES.
 *
 * The database is not the only thing the real app keeps outside itself: every
 * attachment lives in a Supabase Storage bucket. Dummy mode is meant to run
 * with no Supabase at all, so leaving uploads pointed at the live project made
 * the one thing it promised — a working app with nothing external — fail on any
 * screen with a file in it, and fail with the live service's own words
 * ("signature verification failed") rather than anything a reader could act on.
 *
 * So objects go on disk here instead, laid out `<bucket>/<the same path the
 * database row stores>`, which is what lets one storage_path column address
 * both backends. Throwaway, like the PGlite directory beside it.
 */
export const DUMMY_STORAGE_DIR =
  process.env.DUMMY_STORAGE_DIR ?? join(process.cwd(), ".dummy-storage");

/**
 * Whether the app should talk to the dummy database instead of the real one.
 *
 * Development only, deliberately: this bypasses the real database AND (via
 * lib/auth/current.ts) the Firebase sign-in, so a production build must never
 * be able to switch it on by setting one environment variable. `pnpm build`
 * runs with NODE_ENV=production and gets `false` no matter what.
 */
export const DUMMY_MODE =
  process.env.DUMMY_MODE === "true" && process.env.NODE_ENV !== "production";
