import "server-only";

import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, visibilityGrants } from "@/db/schema";
import type { VisibilityDomain } from "@/lib/access/visibility";

/**
 * Reads for Admin Panel → Access Control: the elevated visibility grants.
 *
 * The WRITES live in that page's server actions, because they carry the
 * authorization; this module is the read side, so the screen and any future
 * report agree on what a grant row means.
 */

export interface VisibilityGrantRow {
  id: string;
  domain: VisibilityDomain;
  employeeId: string;
  employeeName: string;
  employeeEmail: string | null;
  /** NULL = the whole organisation. */
  targetId: string | null;
  targetName: string | null;
  note: string | null;
  grantedByName: string | null;
  createdAt: Date;
}

export async function listVisibilityGrants(
  domain: VisibilityDomain,
): Promise<VisibilityGrantRow[]> {
  const grantee = alias(employees, "grantee_emp");
  const target = alias(employees, "target_emp");
  const granter = alias(employees, "granter_emp");

  try {
    const rows = await db
      .select({
        id: visibilityGrants.id,
        domain: visibilityGrants.domain,
        employeeId: visibilityGrants.employeeId,
        employeeName: grantee.name,
        employeeEmail: grantee.email,
        targetId: visibilityGrants.targetId,
        targetName: target.name,
        note: visibilityGrants.note,
        grantedByName: granter.name,
        createdAt: visibilityGrants.createdAt,
      })
      .from(visibilityGrants)
      .leftJoin(grantee, eq(visibilityGrants.employeeId, grantee.id))
      .leftJoin(target, eq(visibilityGrants.targetId, target.id))
      .leftJoin(granter, eq(visibilityGrants.grantedById, granter.id))
      .where(eq(visibilityGrants.domain, domain))
      .orderBy(asc(visibilityGrants.createdAt));

    return rows.map((r) => ({
      ...r,
      employeeName: r.employeeName ?? "Unknown",
      targetName: r.targetName ?? null,
      note: r.note ?? null,
      grantedByName: r.grantedByName ?? null,
      employeeEmail: r.employeeEmail ?? null,
    }));
  } catch (err) {
    // Pre-migration or unreadable: the screen shows an empty list rather than
    // an error page, and the ENFORCEMENT side fails closed to "no grants".
    console.error(`visibility grants: ${domain} read failed`, err);
    return [];
  }
}
