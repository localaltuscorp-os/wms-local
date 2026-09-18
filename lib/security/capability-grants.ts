import "server-only";
import { cache } from "react";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { capabilityGrantEvents, capabilityGrants, employees } from "@/db/schema";
import { emailsWithCapability } from "./capabilities";

/**
 * CAPABILITIES HELD AS DATA RATHER THAN AS CODE.
 *
 * ── WHY ONLY ONE ───────────────────────────────────────────────────────────
 * Every other capability in `lib/security/capabilities.ts` is consulted
 * SYNCHRONOUSLY — `isPrivilegedAccount` calls it inside a `.filter()`, and the
 * device guards run inside render paths. Answering those from a table would put
 * a query in the middle of a render and force those call sites async.
 *
 * `master_admin.manage` is different: its guards are a layout, three actions and
 * two roster reads, all already async. So it — and only it — becomes a row.
 *
 * `DB_BACKED_CAPABILITIES` is the one list that says which capabilities are read
 * from here. It is mirrored by a CHECK constraint in migration 0226, and a unit
 * test asserts the two agree. Adding a name to it WITHOUT making that
 * capability's guards async would produce the worst possible outcome: a grant
 * row that the application silently ignores, i.e. somebody told they hold a
 * power they do not have.
 */

export const DB_BACKED_CAPABILITIES = [
  "master_admin.manage",
  "hr.letters.issue",
] as const;
export type DbBackedCapability = (typeof DB_BACKED_CAPABILITIES)[number];

const MASTER_ADMIN: DbBackedCapability = "master_admin.manage";

/** `employees.email` is compared case- and whitespace-insensitively everywhere
 *  else in this codebase; this is that rule, in one place. */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * WHO HOLDS ONE DB-BACKED CAPABILITY — one query per capability per request.
 *
 * `cache()` on a function that takes the capability keys the memo per argument,
 * so asking about two capabilities is two statements and asking about one twice
 * is one.
 *
 * A code-baseline entry (`GRANTS` in lib/security/capabilities.ts) is included
 * on top of the rows, and is what a read failure falls back to. That matters
 * differently per capability: for master admin it guarantees the owner can never
 * be locked out of the tool that fixes it, and for letter-issuing it is simply
 * empty — nobody holds it by code, so losing the read means losing the granted
 * capability and never inventing one.
 */
export const grantsFor = cache(
  async (capability: DbBackedCapability): Promise<ReadonlySet<string>> => {
    const emails = new Set<string>(emailsWithCapability(capability).map(normalizeEmail));
    try {
      const rows = await db
        .select({ email: capabilityGrants.employeeEmail })
        .from(capabilityGrants)
        .where(eq(capabilityGrants.capability, capability));
      for (const r of rows) emails.add(normalizeEmail(r.email));
    } catch (err) {
      console.error(
        `[capability-grants] read failed for "${capability}"; using the code baseline alone`,
        err,
      );
    }
    return emails;
  },
);

/** Does this address hold this capability? The one question a guard asks. */
export async function hasCapabilityGrant(
  email: string | null | undefined,
  capability: DbBackedCapability,
): Promise<boolean> {
  if (!email) return false;
  return (await grantsFor(capability)).has(normalizeEmail(email));
}

/**
 * THE CODE BOOTSTRAP — the addresses in the `GRANTS` table in
 * `lib/security/capabilities.ts`. They are master admins no matter what the
 * database says, and this is the only reason a read failure here is survivable.
 */
const CODE_BOOTSTRAP: readonly string[] = emailsWithCapability(MASTER_ADMIN);

export interface MasterAdminSnapshot {
  emails: ReadonlySet<string>;
  employeeIds: ReadonlySet<string>;
}

/**
 * WHO IS A MASTER ADMIN — one query per request.
 *
 * `cache()` is this codebase's existing idiom for exactly this (`loadOverrides`
 * in lib/permissions/resolve.ts, `getSignedInEmployee` in lib/auth/current.ts).
 * It gives the two things a time-based cache could not: **no staleness window**
 * — a revocation takes effect on the very next request — and no invalidation to
 * forget. It also collapses the per-row calls in `app/master-admin/page.tsx`
 * into a single statement.
 *
 * ── IT FAILS CLOSED, WHICH IS THE OPPOSITE OF loadOverrides ────────────────
 * Losing the module overrides returns the application to the authorization it
 * already had, which is safe. Losing THIS read would otherwise have to mean
 * "assume nobody is a master admin" (locking the owner out of the tool that
 * fixes it) or "assume everybody is" (catastrophic). Neither. A read failure
 * returns the CODE BOOTSTRAP ALONE: a database hiccup can revoke an administered
 * grant, but it can never invent one, and the two named people always get in.
 */
export const masterAdminSnapshot = cache(async (): Promise<MasterAdminSnapshot> => {
  const emails = new Set<string>(CODE_BOOTSTRAP.map(normalizeEmail));
  const employeeIds = new Set<string>();

  try {
    const granted = await db
      .select({ id: capabilityGrants.employeeId, email: capabilityGrants.employeeEmail })
      .from(capabilityGrants)
      .where(eq(capabilityGrants.capability, MASTER_ADMIN));
    for (const r of granted) {
      employeeIds.add(r.id);
      emails.add(normalizeEmail(r.email));
    }

    // The bootstrap may hold no grant row at all — the table starts empty and
    // they are master admins by virtue of the code constant. Resolve their ids
    // so the roster shows them correctly either way. `lower(...)` because the
    // stored address is whatever the employee record holds.
    if (CODE_BOOTSTRAP.length > 0) {
      const boot = await db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(inArray(sql`lower(${employees.email})`, [...CODE_BOOTSTRAP]));
      for (const r of boot) {
        if (emails.has(normalizeEmail(r.email))) employeeIds.add(r.id);
      }
    }
  } catch (err) {
    console.error(
      "[capability-grants] read failed; falling back to the code bootstrap alone",
      err,
    );
  }

  return { emails, employeeIds };
});

/** Is this address a master admin? The one question every guard asks.
 *
 *  Delegates to the general reader rather than consulting `masterAdminSnapshot`
 *  directly, so there is ONE definition of "who holds this capability" and the
 *  snapshot below is left with a single job: resolving the ids the roster needs. */
export async function isMasterAdmin(email: string | null | undefined): Promise<boolean> {
  return hasCapabilityGrant(email, MASTER_ADMIN);
}

/**
 * The master admins' employee ids — for the roster.
 *
 * Ids, never addresses: the admin employee list already computes `superAdminIds`
 * server-side for exactly this reason, so that no allow-list reaches the
 * browser.
 */
export async function masterAdminEmployeeIds(): Promise<ReadonlySet<string>> {
  return (await masterAdminSnapshot()).employeeIds;
}

export type GrantResult = { ok: true } | { ok: false; error: string };

/**
 * GRANT OR REVOKE ONE DB-BACKED CAPABILITY — the general path.
 *
 * No policy beyond the data itself. The caller owns the authorization question
 * ("may this person hand that capability out?"), which differs per capability
 * and belongs next to the action that knows who is asking: master-admin granting
 * is super-admin-only, letter-issuing is an ordinary admin decision.
 *
 * `setMasterAdminGrant` below is NOT this function with a flag. It carries two
 * rules that are specific to that capability — a code bootstrap that cannot be
 * revoked through the database, and a last-holder guard — and folding them in
 * behind a boolean would make both invisible at the call site.
 */
export async function setCapabilityGrant(input: {
  employeeId: string;
  employeeEmail: string;
  capability: DbBackedCapability;
  grant: boolean;
  actorId: string;
  actorEmail: string;
}): Promise<GrantResult> {
  const { employeeId, employeeEmail, capability, grant, actorId, actorEmail } = input;
  const normalized = normalizeEmail(employeeEmail);

  try {
    if (grant) {
      await db
        .insert(capabilityGrants)
        .values({ employeeId, employeeEmail: normalized, capability, grantedById: actorId })
        .onConflictDoNothing({
          target: [capabilityGrants.employeeId, capabilityGrants.capability],
        });
    } else {
      await db
        .delete(capabilityGrants)
        .where(
          and(
            eq(capabilityGrants.capability, capability),
            eq(capabilityGrants.employeeId, employeeId),
          ),
        );
    }

    // Written either way, so the trail shows the attempt as well as the change.
    await db.insert(capabilityGrantEvents).values({
      employeeId,
      employeeEmail: normalized,
      capability,
      action: grant ? "granted" : "revoked",
      actorEmployeeId: actorId,
      actorEmail: normalizeEmail(actorEmail),
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save the grant: ${msg}` };
  }
}

/**
 * GRANT OR REVOKE `master_admin.manage`.
 *
 * ── THE CALLER MUST HAVE CHECKED isSuperAdmin FIRST ────────────────────────
 * This function does not check it, and deliberately: the check belongs at the
 * one place that knows who is asking (`editEmployee`, and the super-admin-only
 * screen), and duplicating a policy decision inside a data-access helper is how
 * the two copies eventually disagree. What this function DOES enforce are the
 * invariants that are about the DATA rather than about the caller:
 *
 *   1. The capability must be one whose guards actually read this table. A row
 *      for anything else would be a grant the application ignores.
 *   2. A code-bootstrap master admin cannot be revoked here, because deleting a
 *      row would not revoke them — a silent no-op is worse than a refusal. The
 *      message says where the real change belongs.
 *   3. The last remaining master admin cannot be revoked. Locking everybody out
 *      of the permission matrix is unrecoverable from inside the application.
 *
 * Grant is idempotent (`onConflictDoNothing`); revoke of a non-existent row is
 * likewise a no-op. Both write an audit row regardless, so the trail shows the
 * attempt as well as the change.
 */
export async function setMasterAdminGrant(input: {
  employeeId: string;
  employeeEmail: string;
  grant: boolean;
  actorId: string;
  actorEmail: string;
}): Promise<GrantResult> {
  const { employeeId, employeeEmail, grant, actorId, actorEmail } = input;
  const normalized = normalizeEmail(employeeEmail);

  try {
    if (grant) {
      await db
        .insert(capabilityGrants)
        .values({ employeeId, employeeEmail: normalized, capability: MASTER_ADMIN, grantedById: actorId })
        .onConflictDoNothing({
          target: [capabilityGrants.employeeId, capabilityGrants.capability],
        });
    } else {
      // A code bootstrap cannot be revoked from here — they do not need a row to
      // be a master admin. Refuse rather than delete a row and report success
      // while they keep the capability.
      if (CODE_BOOTSTRAP.includes(normalized)) {
        return {
          ok: false,
          error:
            "They are a master admin by a constant in the code, not by a grant. Removing them means editing SUPER_ADMIN/GRANTS, which needs a deploy.",
        };
      }

      const held = await db
        .select({ id: capabilityGrants.id })
        .from(capabilityGrants)
        .where(
          and(
            eq(capabilityGrants.capability, MASTER_ADMIN),
            eq(capabilityGrants.employeeId, employeeId),
          ),
        )
        .limit(1);

      // Only worth counting when there is actually a row to remove — otherwise
      // this is a no-op revoke of somebody who was never granted it.
      if (held.length > 0) {
        const [total] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(capabilityGrants)
          .where(eq(capabilityGrants.capability, MASTER_ADMIN));
        if ((total?.count ?? 0) <= 1) {
          return {
            ok: false,
            error:
              "This is the last master admin. Grant it to somebody else first — revoking it here would leave nobody able to open the permission matrix.",
          };
        }
      }

      await db
        .delete(capabilityGrants)
        .where(
          and(
            eq(capabilityGrants.capability, MASTER_ADMIN),
            eq(capabilityGrants.employeeId, employeeId),
          ),
        );
    }

    await db.insert(capabilityGrantEvents).values({
      employeeId,
      employeeEmail: normalized,
      capability: MASTER_ADMIN,
      action: grant ? "granted" : "revoked",
      actorEmployeeId: actorId,
      actorEmail: normalizeEmail(actorEmail),
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save the grant: ${msg}` };
  }
}
