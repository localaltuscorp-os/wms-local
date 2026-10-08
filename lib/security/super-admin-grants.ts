import "server-only";
import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  superAdminGrantEvents,
  superAdminGrants,
} from "@/db/schema";
import { dbErrorAdvice, logDbError } from "@/lib/db/error";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type SuperAdminGrantResult = { ok: true } | { ok: false; error: string };

/**
 * Database-only super-admin membership. It is intentionally not wired into the
 * synchronous `isSuperAdmin` guard yet: that guard has many synchronous callers
 * and changing it without a complete async migration could silently alter access.
 */
export const hasDatabaseSuperAdminGrant = cache(
  async (employeeId: string): Promise<boolean> => {
    try {
      const [row] = await db
        .select({ id: superAdminGrants.id })
        .from(superAdminGrants)
        .where(eq(superAdminGrants.employeeId, employeeId))
        .limit(1);
      return Boolean(row);
    } catch (error) {
      // This is an optional recovery-path check. A database that is offline or
      // has not received the grants migration must deny the database-backed
      // grant, but it must not turn every protected page render into a Next.js
      // error overlay. Keep an actionable, parameter-free server warning.
      console.warn("[super-admin-grants] membership read unavailable; denying database-backed grant:", dbErrorAdvice(error));
      return false;
    }
  },
);

/**
 * Controlled data-layer write for a future internal operator path. There is no
 * page or route for this yet. The last database-backed super admin cannot be
 * revoked through this function.
 */
export async function setDatabaseSuperAdminGrant(input: {
  employeeId: string;
  employeeEmail: string;
  grant: boolean;
  actorEmployeeId: string | null;
}): Promise<SuperAdminGrantResult> {
  const employeeEmail = normalizeEmail(input.employeeEmail);
  try {
    if (input.grant) {
      await db
        .insert(superAdminGrants)
        .values({
          employeeId: input.employeeId,
          employeeEmail,
          grantedById: input.actorEmployeeId,
        })
        .onConflictDoNothing({ target: superAdminGrants.employeeId });
      await db.insert(superAdminGrantEvents).values({
        employeeId: input.employeeId,
        employeeEmail,
        action: "granted",
        actorEmployeeId: input.actorEmployeeId,
      });
      return { ok: true };
    }

    const [grantCountRow] = await db
      .select({ count: count(superAdminGrants.id) })
      .from(superAdminGrants);
    // A missing aggregate result is treated as zero: fail closed rather than
    // risking removal when the database answer is incomplete.
    if ((grantCountRow?.count ?? 0) <= 1) {
      return { ok: false, error: "The last database-backed Super Admin cannot be removed." };
    }

    await db
      .delete(superAdminGrants)
      .where(eq(superAdminGrants.employeeId, input.employeeId));
    await db.insert(superAdminGrantEvents).values({
      employeeId: input.employeeId,
      employeeEmail,
      action: "revoked",
      actorEmployeeId: input.actorEmployeeId,
    });
    return { ok: true };
  } catch (err) {
    logDbError("super-admin-grants", err);
    return { ok: false, error: `Could not save Super Admin: ${dbErrorAdvice(err)}` };
  }
}
