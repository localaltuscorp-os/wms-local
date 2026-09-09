import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";

/**
 * The ONE switch for the no-login local session.
 *
 * `DISABLE_AUTH="true"` in `.env.local` skips the /login wall for local
 * development — useful when the Firebase keys in `.env.local` no longer match
 * the project the accounts live in, so signing in is impossible locally.
 *
 * It bypasses AUTHENTICATION ONLY. Every page still reads the real database
 * through the real employee row resolved below; nothing short-circuits to empty
 * data (a past version of this flag did, and every KPI rendered 0).
 *
 * A deployment can NEVER be opened up by a stray `DISABLE_AUTH=true` in the
 * environment: Vercel always sets `VERCEL`/`VERCEL_ENV`, and that check wins.
 * `proxy.ts` duplicates this rule inline — keep the two in lock-step.
 */
export function localSessionEnabled(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  // The NODE_ENV floor, added when this landed on main beside the two other
  // local-dev hatches (DUMMY_MODE, DEV_AUTH_BYPASS): those are both hard-false
  // under a production build, and a rule that only holds on Vercel is weaker
  // than its neighbours anywhere the app is served from somewhere else.
  // `next build` sets NODE_ENV=production, so no real deployment reaches this.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DISABLE_AUTH === "true";
}

/** Reopen every workspace room locally, regardless of real department. */
export function localAllWorkspaces(): boolean {
  return localSessionEnabled() && process.env.DEV_ALL_WORKSPACES === "true";
}

/**
 * Who the no-login session signs you in as: the `DEV_USER_EMAIL` employee
 * (matched against BOTH `email` and `official_email`, since post-joining staff
 * log in with the official address), falling back to the first active admin
 * when it's unset or matches nobody.
 *
 * The row returned is the person's REAL record — real id, department, admin
 * flag — so local behaviour matches what that person actually sees in
 * production, including being bounced out of rooms they aren't a member of.
 */
export async function localSessionEmployee(): Promise<Employee | null> {
  const wanted = process.env.DEV_USER_EMAIL?.trim().toLowerCase();

  if (wanted) {
    const match = await db.query.employees.findFirst({
      // Case-insensitive on both addresses — stored casing varies by how the
      // account was created, and a case mismatch here silently falls through
      // to "first active admin", which looks like the flag ignoring the setting.
      where: or(
        sql`lower(${employees.email}) = ${wanted}`,
        sql`lower(${employees.officialEmail}) = ${wanted}`,
      ),
    });
    if (match) return match;
    console.warn(
      `[local-session] DEV_USER_EMAIL="${wanted}" matched no employee — falling back to the first active admin.`,
    );
  }

  const admin = await db.query.employees.findFirst({
    where: and(eq(employees.isActive, true), eq(employees.isAdmin, true)),
    orderBy: [asc(employees.name)],
  });
  if (admin) return admin;

  return (
    (await db.query.employees.findFirst({
      where: eq(employees.isActive, true),
      orderBy: [asc(employees.name)],
    })) ?? null
  );
}
