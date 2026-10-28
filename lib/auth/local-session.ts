import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { retryOnDroppedConnection } from "@/lib/db/with-timeout";
import { employees, type Employee } from "@/db/schema";
import { headers } from "next/headers";
import { DEV_BYPASS_EMPLOYEE, devAuthBypassEnabled } from "@/lib/auth/dev-bypass";

/**
 * Determines whether the current request is from localhost / 127.0.0.1 or local bypass mode.
 * Double-gated against production:
 * - Vercel deployments (VERCEL/VERCEL_ENV) always return false.
 * - NODE_ENV === "production" builds always return false (unless explicitly overridden).
 */
export async function isLocalhostSession(): Promise<boolean> {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCALHOST_BYPASS !== "true") return false;
  if (localSessionEnabled() || devAuthBypassEnabled()) return true;

  try {
    const h = await headers();
    if (h.get("x-localhost-bypass") === "1") return true;
    const rawHost = h.get("x-forwarded-host") || h.get("host") || "";
    const host = (rawHost.split(":")[0] ?? "").toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * The ONE switch for the no-login local session.
 *
 * `DISABLE_AUTH="true"` in `.env.local` skips the /login wall for local
 * development.
 */
export function localSessionEnabled(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DISABLE_AUTH === "true";
}

/** Reopen every workspace room locally, regardless of real department. */
export function localAllWorkspaces(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

/**
 * Who the no-login session signs you in as: the `DEV_USER_EMAIL` employee,
 * falling back to active admin, and gracefully falling back to a mock admin
 * if database credentials are not configured or offline.
 */
export async function localSessionEmployee(): Promise<Employee> {
  const devEmail = (process.env.DEV_USER_EMAIL?.trim() || "omjadhav.altuscorp@gmail.com").toLowerCase();
  const fallbackEmployee: Employee = {
    ...DEV_BYPASS_EMPLOYEE,
    id: "00000000-0000-0000-0000-000000000000",
    email: devEmail,
    name: devEmail.split("@")[0] || "Om Jadhav",
    isAdmin: true,
    isActive: true,
    department: "HR",
  };

  try {
    const match = await retryOnDroppedConnection(
      () =>
        db.query.employees.findFirst({
          where: or(
            sql`lower(${employees.email}) = ${devEmail}`,
            sql`lower(${employees.officialEmail}) = ${devEmail}`,
          ),
        }),
      "local-session",
    ).catch(() => null);
    if (match) return match;

    const admin = await db.query.employees.findFirst({
      where: and(eq(employees.isActive, true), eq(employees.isAdmin, true)),
      orderBy: [asc(employees.name)],
    }).catch(() => null);
    if (admin) return admin;

    const anyActive = await db.query.employees.findFirst({
      where: eq(employees.isActive, true),
      orderBy: [asc(employees.name)],
    }).catch(() => null);
    if (anyActive) return anyActive;
  } catch (err) {
    console.warn(
      "[local-session] Database query failed — safely using dev preview employee:",
      err,
    );
  }

  return fallbackEmployee;
}
