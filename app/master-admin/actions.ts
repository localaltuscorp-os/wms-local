"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, modulePermissionEvents, modulePermissions } from "@/db/schema";
import { requireUser, getSignedInEmployee, forbiddenError } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capabilities";
import { isPermissionNodeKey } from "@/lib/permissions/catalog";
import { isMeaningfulOverride } from "@/lib/permissions/effective";
import { rateLimitOrError } from "@/lib/rate-limit";

/**
 * MASTER ADMIN — the permission-matrix write path.
 *
 * ── EVERY ACTION RE-CHECKS `isMasterAdmin` ON THE SERVER ───────────────────
 * The layout gate is not the boundary. A server action is an HTTP endpoint; it
 * is reachable by anybody signed in, with any arguments, whether or not a page
 * ever rendered a control for it. So the capability is re-read here, from
 * `employees.email` via the capability registry, on every call.
 *
 * That is also the entire answer to "works locally AND on os.altuscorp.com".
 * There is no host check, no env var and no `NODE_ENV` branch in this decision —
 * it is the same email test against the same table in both environments, so the
 * two cannot diverge.
 *
 * ── THE ACTOR IS THE REAL SIGNED-IN PERSON ─────────────────────────────────
 * `getSignedInEmployee()`, not `getCurrentEmployee()`. A delegated session must
 * not be able to rewrite the permission matrix using the borrowed account's
 * capabilities — and if it somehow could, the audit row must name whoever was
 * actually at the keyboard. (Privileged accounts cannot be delegated at all, so
 * this is defence in depth rather than the only guard.)
 */

const PATH = "/master-admin";

const ToggleSchema = z
  .object({
    employeeId: z.string().uuid(),
    nodeKey: z.string().min(1).max(200),
    show: z.boolean(),
    view: z.boolean(),
    edit: z.boolean(),
  })
  .strict();

export type ToggleInput = z.infer<typeof ToggleSchema>;
export type MatrixResult = { ok: true } | { ok: false; error: string };

/** The one authorization gate for this module. Throws 403 rather than
 *  redirecting: these are actions, and a redirect out of an action body
 *  silently discards the caller's error handling. */
async function requireMasterAdmin() {
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me || !isMasterAdmin(me.email)) throw forbiddenError();
  return me;
}

/**
 * Set one employee's permission on one node.
 *
 * ── AN ALL-TRUE ROW IS DELETED, NOT STORED ─────────────────────────────────
 * "Everything allowed" is indistinguishable in effect from having no row at all
 * (see `effectiveFor` — a missing row means "use the authorization the app
 * already has"). Storing it anyway would make the matrix screen show a node as
 * customised when nothing about it is, and would fill the table with rows that
 * say nothing. So switching everything back on removes the override.
 *
 * The audit row is written either way, and records the transition rather than
 * just the destination: `prev_*` NULL means "there was no override", which is a
 * different fact from `prev_* = false`.
 */
export async function setModulePermission(input: ToggleInput): Promise<MatrixResult> {
  const me = await requireMasterAdmin();

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, nodeKey } = parsed.data;

  // THE NODE MUST EXIST IN THE CATALOGUE. A typo, or a node dropped from the
  // code, would otherwise create a grant that governs nothing — a switch wired
  // to no route, reading as "denied" on screen while the module stays open.
  if (!isPermissionNodeKey(nodeKey)) {
    return { ok: false, error: `"${nodeKey}" is not a module in the permission catalogue.` };
  }

  const [target] = await db
    .select({ id: employees.id, email: employees.email, name: employees.name })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!target) return { ok: false, error: "Employee not found." };

  // A master admin is exempt from the matrix when it is ENFORCED
  // (see `governedByMatrix`), so a row against them would be stored and then
  // ignored — which is worse than refusing, because the screen would show a
  // restriction that does nothing. Refuse it, and say why.
  if (isMasterAdmin(target.email)) {
    return {
      ok: false,
      error: `${target.name} is a master administrator, so module permissions do not apply to them. Remove their master_admin.manage capability first if that should change.`,
    };
  }

  const next = {
    canShow: parsed.data.show,
    canView: parsed.data.view,
    canEdit: parsed.data.edit,
  };

  const [prev] = await db
    .select({
      canShow: modulePermissions.canShow,
      canView: modulePermissions.canView,
      canEdit: modulePermissions.canEdit,
    })
    .from(modulePermissions)
    .where(
      and(eq(modulePermissions.employeeId, employeeId), eq(modulePermissions.nodeKey, nodeKey)),
    )
    .limit(1);

  try {
    if (isMeaningfulOverride(next)) {
      await db
        .insert(modulePermissions)
        .values({ employeeId, nodeKey, ...next, updatedById: me.id })
        .onConflictDoUpdate({
          target: [modulePermissions.employeeId, modulePermissions.nodeKey],
          set: { ...next, updatedById: me.id, updatedAt: new Date() },
        });
    } else if (prev) {
      await db
        .delete(modulePermissions)
        .where(
          and(
            eq(modulePermissions.employeeId, employeeId),
            eq(modulePermissions.nodeKey, nodeKey),
          ),
        );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const stored = isMeaningfulOverride(next);
  try {
    await db.insert(modulePermissionEvents).values({
      employeeId,
      nodeKey,
      prevShow: prev?.canShow ?? null,
      prevView: prev?.canView ?? null,
      prevEdit: prev?.canEdit ?? null,
      nextShow: stored ? next.canShow : null,
      nextView: stored ? next.canView : null,
      nextEdit: stored ? next.canEdit : null,
      actorEmployeeId: me.id,
    });
  } catch (err) {
    // Not fatal: the permission change has committed and is what was asked for.
    console.error("[setModulePermission] audit write failed", err);
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Clear EVERY override for one employee — back to "the application's own
 * authorization", which is where everybody starts.
 *
 * Exists because undoing a bad configuration one node at a time across a
 * ~200-node catalogue is not a realistic recovery path, and the alternative
 * people reach for is a hand-written DELETE against production.
 */
export async function resetEmployeePermissions(employeeId: string): Promise<MatrixResult> {
  const me = await requireMasterAdmin();

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!z.string().uuid().safeParse(employeeId).success) {
    return { ok: false, error: "Invalid id" };
  }

  const rows = await db
    .select({
      nodeKey: modulePermissions.nodeKey,
      canShow: modulePermissions.canShow,
      canView: modulePermissions.canView,
      canEdit: modulePermissions.canEdit,
    })
    .from(modulePermissions)
    .where(eq(modulePermissions.employeeId, employeeId));

  if (rows.length === 0) return { ok: true };

  await db.delete(modulePermissions).where(eq(modulePermissions.employeeId, employeeId));

  // One audit row per cleared node, so the trail reads the same whether the
  // nodes were reset together or one at a time.
  try {
    await db.insert(modulePermissionEvents).values(
      rows.map((r) => ({
        employeeId,
        nodeKey: r.nodeKey,
        prevShow: r.canShow,
        prevView: r.canView,
        prevEdit: r.canEdit,
        nextShow: null,
        nextView: null,
        nextEdit: null,
        actorEmployeeId: me.id,
      })),
    );
  } catch (err) {
    console.error("[resetEmployeePermissions] audit write failed", err);
  }

  revalidatePath(PATH);
  return { ok: true };
}

/** One employee's stored overrides — loaded when the matrix screen switches
 *  person, so the page does not ship every employee's matrix at once. */
export async function fetchEmployeeMatrix(employeeId: string): Promise<
  | { ok: true; overrides: Record<string, { show: boolean; view: boolean; edit: boolean }> }
  | { ok: false; error: string }
> {
  await requireMasterAdmin();
  if (!z.string().uuid().safeParse(employeeId).success) {
    return { ok: false, error: "Invalid id" };
  }

  const rows = await db
    .select({
      nodeKey: modulePermissions.nodeKey,
      canShow: modulePermissions.canShow,
      canView: modulePermissions.canView,
      canEdit: modulePermissions.canEdit,
    })
    .from(modulePermissions)
    .where(eq(modulePermissions.employeeId, employeeId));

  const overrides: Record<string, { show: boolean; view: boolean; edit: boolean }> = {};
  for (const r of rows) {
    overrides[r.nodeKey] = { show: r.canShow, view: r.canView, edit: r.canEdit };
  }
  return { ok: true, overrides };
}

// NOTE: a "use server" module may only export async functions, so the refusal
// string and the action list are NOT re-exported from here. Clients import them
// from lib/security/capabilities and lib/permissions/catalog, both of which are
// pure and client-safe.
