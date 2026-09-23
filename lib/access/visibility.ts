import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, visibilityGrants } from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

/**
 * THE ONE RULE FOR "WHO MAY THIS PERSON SEE".
 *
 * Two modules ask it — WMS Tasks (whose work) and Incentive (whose earnings) —
 * and they must never drift into two answers. The rule:
 *
 *   everyone        → themselves + their transitive downline (org chart)
 *   + a branch grant → that person and THEIR downline ("Mansi and her team")
 *   + an org grant   → the whole organisation
 *   nobody else      → being an admin buys nothing here
 *
 * The grants themselves are rows in `visibility_grants`, written only from
 * Admin Panel → Access Control by a master admin. This module is the read side
 * and the expansion; each domain module keeps its own vocabulary (a scope object
 * for incentives, a permitted-id list for tasks) around the answer.
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * A missing table (pre-migration) or an unreadable one answers "no grants", the
 * restrictive direction. The opposite default would turn a transient read error
 * into an organisation-wide leak.
 */

export type VisibilityDomain = "tasks" | "incentive";

/** One grant target: null = the whole organisation, else the branch root. */
export type GrantTarget = string | null;

/** The raw grant rows held by one person for one domain. Fail-closed. */
export async function visibilityGrantsFor(
  employeeId: string,
  domain: VisibilityDomain,
): Promise<GrantTarget[]> {
  try {
    const rows = await db
      .select({ targetId: visibilityGrants.targetId })
      .from(visibilityGrants)
      .where(
        and(
          eq(visibilityGrants.employeeId, employeeId),
          eq(visibilityGrants.domain, domain),
        ),
      );
    return rows.map((r) => r.targetId);
  } catch (err) {
    console.error(
      `visibility: could not read ${domain} grants; scoping to self + downline`,
      err,
    );
    return [];
  }
}

export interface PermittedPeople {
  /** True when a grant opens the whole organisation. */
  org: boolean;
  /** The people this viewer may see, always including themselves. */
  ids: Set<string>;
  /** How many people the grants added beyond the viewer's own downline. */
  grantedExtras: number;
}

/**
 * The people one person may see, for one domain: self + downline + grants.
 *
 * `org` short-circuits everything — a caller that gets it must pass NO filter
 * downstream rather than enumerating the roster, because the roster read is the
 * expensive half and an empty set means "nobody" while `org` means "everybody".
 */
export async function permittedPeopleFor(
  viewerId: string,
  domain: VisibilityDomain,
  opts: { includeSelf?: boolean } = {},
): Promise<PermittedPeople> {
  const includeSelf = opts.includeSelf ?? true;

  const [downline, grants] = await Promise.all([
    getDownlineIds(viewerId),
    visibilityGrantsFor(viewerId, domain),
  ]);

  if (grants.includes(null)) {
    return { org: true, ids: new Set(), grantedExtras: 0 };
  }

  const ids = new Set<string>();
  if (includeSelf) ids.add(viewerId);
  for (const id of downline) ids.add(id);

  const beforeGrants = ids.size;
  for (const targetId of grants) {
    if (!targetId || ids.has(targetId)) continue;
    ids.add(targetId);
    // A grant names a branch, not a person: "Mansi and her team" is what the
    // person asking for it means, and stopping one level short reads as broken.
    for (const id of await getDownlineIds(targetId)) ids.add(id);
  }

  return { org: false, ids, grantedExtras: Math.max(0, ids.size - beforeGrants) };
}

/** The label a scope shows for a granted viewer, in one place. */
export function grantedExtrasLabel(grantedExtras: number): string {
  if (grantedExtras <= 0) return "";
  return `, plus ${grantedExtras} granted ${grantedExtras === 1 ? "person" : "people"}`;
}

/** The roster a grant may target — active employees, for the Access Control form. */
export async function listGrantableEmployees(): Promise<
  { id: string; name: string; email: string | null }[]
> {
  return db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(employees.name);
}
