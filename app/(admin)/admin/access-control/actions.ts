"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, settingsEvents, visibilityGrants } from "@/db/schema";
import { requireAdmin, getSignedInEmployee } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capability-grants";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auditAction } from "@/lib/logs/audit";
import type { VisibilityDomain } from "@/lib/access/visibility";

/**
 * ACCESS CONTROL — granting ELEVATED visibility, per domain.
 *
 * Two domains, one rule and one table: `tasks` (whose work a person may read)
 * and `incentive` (whose earnings). Both modules are scoped to the signed-in
 * person plus their downline; a row here widens that. `targetId` NULL is the
 * whole organisation, a target is that person AND their downline.
 *
 * ── WHO MAY WRITE ─────────────────────────────────────────────────────────
 * A master admin — the same two people who administer the permission matrix
 * (lib/security/capabilities.ts), and the answer the brief gives: the person who
 * grants this is Manan, found in the capability registry rather than named in a
 * branch here. Being an ordinary admin is deliberately not enough, which is the
 * whole distinction the feature rests on: if any admin could widen their own
 * view, "admin ≠ sees everything" would be a sentence rather than a rule.
 *
 * ── WHY A SEPARATE TABLE FROM module_permissions ──────────────────────────
 * The matrix can only NARROW — that is its documented, tested invariant (see
 * lib/permissions/resolve.ts). A grant that WIDENS cannot be expressed there
 * without inverting it, and inverting a shared authorization layer to serve one
 * module is how a second, conflicting permission system is born. So the widening
 * lives in its own table, with its own audit rows, and the matrix keeps its
 * meaning.
 */

const NODE = "admin.access-control";
const PATH = "/admin/access-control";

const DOMAINS: readonly VisibilityDomain[] = ["tasks", "incentive"];

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** The signed-in master admin, or the refusal sentence. */
async function requireMasterAdmin(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  await requireAdmin();
  // The signed-in person, NOT the delegated identity: someone inside a borrowed
  // session must not be able to widen the account they borrowed.
  const me = await getSignedInEmployee();
  if (!me) return { ok: false, error: "Sign in again to change access." };
  if (!(await isMasterAdmin(me.email))) {
    return {
      ok: false,
      error: "Only a master admin can change visibility grants.",
    };
  }
  await requireModuleEdit(NODE);
  return { ok: true, id: me.id };
}

function parseDomain(raw: FormDataEntryValue | null): VisibilityDomain | null {
  const value = String(raw ?? "").trim();
  return DOMAINS.includes(value as VisibilityDomain) ? (value as VisibilityDomain) : null;
}

async function audit(
  actorId: string,
  eventType: string,
  note: string,
): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "visibility_grants",
      targetId: null,
      actorId,
      eventType,
      fromValue: null,
      toValue: null,
      note,
    });
  } catch (err) {
    console.warn("[access-control] audit write failed", err);
  }
}

/** Domain-specific cache invalidation — each module caches its own reads. */
function invalidate(domain: VisibilityDomain): void {
  if (domain === "tasks") {
    updateTag(CACHE_TAGS.tasks);
    revalidatePath("/tasks");
    return;
  }
  // The incentive dashboard, the entries ledger and the Accounts payable screen
  // all read the scope, so each is revalidated rather than left to its 30s
  // window — a grant that took a minute to appear reads as a broken grant.
  revalidatePath("/incentive");
  revalidatePath("/accounts/incentive-payments");
  revalidatePath("/salary/incentive-payout");
}

/** Grant `employeeId` visibility of the organisation, or of one branch. */
export async function grantVisibility(form: FormData): Promise<ActionResult> {
  const actor = await requireMasterAdmin();
  if (!actor.ok) return actor;
  const limited = rateLimitOrError(actor.id, "write");
  if (limited) return limited;

  const domain = parseDomain(form.get("domain"));
  if (!domain) return { ok: false, error: "Pick what this grant applies to." };

  const employeeId = String(form.get("employeeId") ?? "").trim();
  const targetRaw = String(form.get("targetId") ?? "").trim();
  const targetId = targetRaw === "" || targetRaw === "all" ? null : targetRaw;
  const noteRaw = String(form.get("note") ?? "").trim();
  const note = noteRaw ? noteRaw.slice(0, 300) : null;

  if (!employeeId) return { ok: false, error: "Pick the person this applies to." };
  if (targetId === employeeId) {
    return { ok: false, error: "Seeing their own records needs no grant." };
  }

  const [person] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!person) return { ok: false, error: "That employee could not be found." };

  let targetName = "the whole organisation";
  if (targetId) {
    const [t] = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.id, targetId))
      .limit(1);
    if (!t) return { ok: false, error: "That person could not be found." };
    targetName = `${t.name} and their team`;
  }

  try {
    // Idempotent: re-granting an existing pair updates its note rather than
    // failing on the unique index, so the button is safe to press twice.
    const existing = await db
      .select({ id: visibilityGrants.id })
      .from(visibilityGrants)
      .where(
        and(
          eq(visibilityGrants.domain, domain),
          eq(visibilityGrants.employeeId, employeeId),
          targetId === null
            ? isNull(visibilityGrants.targetId)
            : eq(visibilityGrants.targetId, targetId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(visibilityGrants)
        .set({ note, grantedById: actor.id })
        .where(eq(visibilityGrants.id, existing[0]!.id));
    } else {
      await db.insert(visibilityGrants).values({
        domain,
        employeeId,
        targetId,
        note,
        grantedById: actor.id,
      });
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  await audit(actor.id, "visibility_granted", `${domain}: ${person.name} → ${targetName}`);
  auditAction({
    eventType: "CONFIG_CHANGE",
    employeeId: actor.id,
    route: "/admin/access-control",
    module: "Admin Panel",
    page: "Access Control",
    resourceType: "visibility_grant",
    resourceName: `${domain}: ${person.name} → ${targetName}`,
    action: "grant",
    status: "SUCCESS",
  });
  revalidatePath(PATH);
  invalidate(domain);
  return { ok: true };
}

/** Remove a grant by id. */
export async function revokeVisibility(
  grantId: string,
  domain: VisibilityDomain,
): Promise<ActionResult> {
  const actor = await requireMasterAdmin();
  if (!actor.ok) return actor;
  const limited = rateLimitOrError(actor.id, "write");
  if (limited) return limited;

  if (!grantId) return { ok: false, error: "Nothing to remove." };
  if (!DOMAINS.includes(domain)) return { ok: false, error: "Unknown grant type." };

  try {
    const [row] = await db
      .select({
        employeeId: visibilityGrants.employeeId,
        targetId: visibilityGrants.targetId,
        domain: visibilityGrants.domain,
      })
      .from(visibilityGrants)
      .where(and(eq(visibilityGrants.id, grantId), eq(visibilityGrants.domain, domain)))
      .limit(1);
    if (!row) return { ok: false, error: "That grant is already gone." };

    await db.delete(visibilityGrants).where(eq(visibilityGrants.id, grantId));
    await audit(
      actor.id,
      "visibility_revoked",
      `${row.domain}: ${row.employeeId} → ${row.targetId ?? "organisation"}`,
    );
    auditAction({
      eventType: "CONFIG_CHANGE",
      employeeId: actor.id,
      route: "/admin/access-control",
      module: "Admin Panel",
      page: "Access Control",
      resourceType: "visibility_grant",
      resourceName: `${row.domain}: ${row.employeeId} → ${row.targetId ?? "organisation"}`,
      action: "revoke",
      status: "SUCCESS",
    });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath(PATH);
  invalidate(domain);
  return { ok: true };
}
