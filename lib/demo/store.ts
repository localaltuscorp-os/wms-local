/**
 * DEMO MODE — a live, in-memory stand-in for tables that do not exist yet.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Migrations in this repo are applied BY HAND in Supabase, so a module can be
 * finished, merged and deployed while its tables are still absent. Until now
 * that window rendered a "run migration 0221" card: correct, and completely
 * unshowable. Nobody can review a screen they cannot open.
 *
 * So when the tables are missing the page falls back to a seeded in-memory
 * dataset and stays FULLY INTERACTIVE — every action writes here instead of to
 * Postgres. The page says so in a banner, because a demo that does not announce
 * itself is just a lie with nicer typography.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 * Not a seed script and not a fixture. It never touches the database, so it
 * cannot corrupt the live one (this checkout talks to the REAL Supabase), and
 * it disappears the moment 0221/0222 are applied — the pages stop catching,
 * the store is never activated, and the real rows take over with no code
 * change anywhere.
 *
 * ── LIFETIME ─────────────────────────────────────────────────────────────
 * Process memory, held on `globalThis` so Next's dev HMR does not reset your
 * ticks on every save. A server restart clears it, and a multi-instance deploy
 * would give each instance its own copy — both acceptable for a demo, neither
 * acceptable for real data, which is exactly why this is gated on the tables
 * being ABSENT rather than on a flag someone could set in production.
 */

/** Keyed on a symbol so two bundles of this module share one store. */
const KEY = Symbol.for("altus.demo.store.v1");

interface Cell<T> {
  active: boolean;
  data: T | null;
}

type Registry = Record<string, Cell<unknown>>;

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry>;
  if (!g[KEY]) g[KEY] = {};
  return g[KEY];
}

function cell<T>(name: string): Cell<T> {
  const r = registry();
  if (!r[name]) r[name] = { active: false, data: null };
  return r[name] as Cell<T>;
}

/**
 * The store for one module, created on first use.
 *
 * `seed` runs ONCE per process. It is lazy because building the dataset costs
 * nothing when the migration has been applied and this is never reached.
 */
export function demoStore<T>(name: string, seed: () => T) {
  return {
    /** Read (and create) the dataset. Marks the module as running on demo data. */
    get(): T {
      const c = cell<T>(name);
      if (c.data === null) c.data = seed();
      c.active = true;
      return c.data;
    },
    /**
     * True once a page in this process has fallen back.
     *
     * Actions consult this so a click writes to the same place the page read
     * from. It cannot be true unless a read already failed with 42P01, so an
     * action can never divert a write away from a table that exists.
     */
    isActive(): boolean {
      return cell<T>(name).active;
    },
  };
}

/** Stable, readable ids — `demo-run-1` beats a uuid nobody can match by eye. */
export function demoId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/** Today in Asia/Kolkata, as YYYY-MM-DD — the same clock the rest of the app uses. */
export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shift a YYYY-MM-DD by whole days without going near a timezone. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
