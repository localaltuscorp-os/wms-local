import "server-only";

import { cache } from "react";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { scopedAccessGrants, scopedAccessRecipients, scopedAccessScopes } from "@/db/schema";
import type { ScopedAccessChoice } from "./scoped-overlay-effective";
export { applyScopedAccess } from "./scoped-overlay-effective";
export type { ScopedAccessChoice, ScopedAccessLevel } from "./scoped-overlay-effective";

/**
 * Active scoped grants are a restrictive overlay. `null` means no live grant;
 * any non-null list is an allow-list, combined with the employee's normal
 * permission answer by intersection.
 */
export const activeScopedAccess = cache(async (employeeId: string): Promise<readonly ScopedAccessChoice[] | null> => {
  try {
    const rows = await db
      .select({
        moduleKey: scopedAccessScopes.moduleKey,
        accessLevel: scopedAccessScopes.accessLevel,
        navigationKeys: scopedAccessScopes.navigationKeys,
      })
      .from(scopedAccessRecipients)
      .innerJoin(scopedAccessGrants, eq(scopedAccessGrants.id, scopedAccessRecipients.grantId))
      .innerJoin(scopedAccessScopes, eq(scopedAccessScopes.recipientId, scopedAccessRecipients.id))
      .where(
        and(
          eq(scopedAccessRecipients.employeeId, employeeId),
          isNull(scopedAccessRecipients.revokedAt),
          isNull(scopedAccessGrants.revokedAt),
          gt(scopedAccessGrants.expiresAt, new Date()),
        ),
      );
    return rows.length === 0 ? null : rows;
  } catch (error) {
    // Compatibility window: code may deploy before additive migration. Existing
    // authorization remains authoritative until this table exists.
    console.error("scoped temporary access: could not load overlay", error);
    return null;
  }
});
