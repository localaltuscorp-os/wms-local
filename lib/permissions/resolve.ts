import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modulePermissions, type Employee } from "@/db/schema";
import { getCurrentEmployee, forbiddenError } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capabilities";
import {
  effectiveFor,
  allowAll,
  type EffectivePermission,
  type OverrideMap,
  type PermissionOverride,
} from "./effective";
import { isPermissionNodeKey, nodeKeyForPath, type PermissionAction } from "./catalog";

/**
 * THE SERVER SIDE OF THE PERMISSION MATRIX.
 *
 * Loads a person's overrides, answers "may they show / view / edit this node",
 * and provides the guards that pages and server actions call.
 *
 * ── AN OVERRIDE CAN ONLY NARROW ────────────────────────────────────────────
 * This module NEVER grants anything. It is consulted IN ADDITION to every gate
 * the application already had — the admin flag, the workspace and department
 * rooms, the capability registry, each page's own guard — and the effective
 * answer is the AND of the two. So a master admin cannot use the matrix to hand
 * somebody payroll, a department room, or device administration; they can only
 * take away what that person could already reach.
 *
 * That is a deliberate ceiling on the feature. A matrix that could also GRANT
 * would become a second, parallel authorization system racing the first — which
 * is exactly what the brief asks not to be built ("Do not create ... parallel
 * permission systems", "preserve/extend existing authorization").
 */

/**
 * A person's stored overrides, loaded once per request.
 *
 * React-`cache()`d on the employee id, like the identity and device lookups: a
 * single request asks this question from the layout, the page, and every server
 * action inside it, and one indexed read serves them all.
 *
 * Fails OPEN on a read error. A missing table (pre-migration) or a transient
 * database hiccup must not lock the whole company out of the application; the
 * overrides are a narrowing layer, so losing them returns the app to exactly the
 * authorization it had before this feature existed — which is a safe, and
 * loudly logged, degradation.
 */
const loadOverrides = cache(async (employeeId: string): Promise<OverrideMap> => {
  try {
    const rows = await db
      .select({
        nodeKey: modulePermissions.nodeKey,
        canShow: modulePermissions.canShow,
        canView: modulePermissions.canView,
        canEdit: modulePermissions.canEdit,
      })
      .from(modulePermissions)
      .where(eq(modulePermissions.employeeId, employeeId));

    const map = new Map<string, PermissionOverride>();
    for (const r of rows) {
      map.set(r.nodeKey, { canShow: r.canShow, canView: r.canView, canEdit: r.canEdit });
    }
    return map;
  } catch (err) {
    console.error(
      "permissions: could not load module overrides; falling back to the application's own authorization",
      err,
    );
    return new Map();
  }
});

/**
 * MASTER ADMINS ARE NOT SUBJECT TO THE MATRIX.
 *
 * Not a privilege shortcut — a recoverability requirement. The matrix is edited
 * from inside the application, so if a master admin could be denied a node by a
 * row in this table, one mistaken save (their own, or the other master admin's)
 * would remove the only way to undo it. There would be no route back except a
 * hand-written SQL update against production.
 *
 * The set is two people, named in the capability registry, and it is the same
 * set that can rewrite every row here anyway — so exempting them removes no
 * meaningful restriction while removing a real way to brick the tool.
 */
function governedByMatrix(me: Employee): boolean {
  return !isMasterAdmin(me.email);
}

/** The effective permission for one node, for the CURRENT effective identity.
 *  (Under temporary delegated access that is the account being tested — the
 *  delegate sees exactly the permissions of the account, which is the point.) */
export async function modulePermission(nodeKey: string): Promise<EffectivePermission> {
  const me = await getCurrentEmployee();
  if (!me) return allowAll();
  if (!governedByMatrix(me)) return allowAll();
  if (!isPermissionNodeKey(nodeKey)) return allowAll();
  return effectiveFor(nodeKey, await loadOverrides(me.id));
}

/** For an arbitrary employee — the Master Admin screen reads this to render the
 *  matrix, and the nav reads it for the signed-in user. */
export async function modulePermissionsFor(
  employee: Pick<Employee, "id" | "email">,
): Promise<OverrideMap> {
  if (isMasterAdmin(employee.email)) return new Map();
  return await loadOverrides(employee.id);
}

/** The raw stored rows for one employee, exempt or not — what the matrix screen
 *  must render, because a master admin still has editable rows even though they
 *  are not enforced against them. */
export async function storedOverridesFor(employeeId: string): Promise<OverrideMap> {
  return await loadOverrides(employeeId);
}

export async function canShowModule(nodeKey: string): Promise<boolean> {
  return (await modulePermission(nodeKey)).show;
}

export async function canViewModule(nodeKey: string): Promise<boolean> {
  return (await modulePermission(nodeKey)).view;
}

export async function canEditModule(nodeKey: string): Promise<boolean> {
  return (await modulePermission(nodeKey)).edit;
}

/** Where a refusal sends somebody, and the node that governs it. */
const FALLBACK_ROUTE = "/hub";
const FALLBACK_NODE = "platform.hub";

/**
 * THE PAGE GUARD. Call at the top of a page or layout, after its existing gate.
 *
 * A denied VIEW redirects to the hub rather than throwing, matching how the
 * admin layout and the workspace rooms already refuse: the person is properly
 * signed in and has done nothing wrong, so the useful answer is a page they can
 * use, not an error card.
 *
 * ── EXCEPT WHEN THE HUB ITSELF IS DENIED ───────────────────────────────────
 * The hub is a governed node like any other (`platform.hub`), so a
 * configuration that switches it off would make this redirect bounce a request
 * to a page that redirects it again — an infinite loop, presenting as a hung
 * browser rather than as a permission error, on every route at once.
 *
 * So when the hub is not viewable the guard throws 403 instead. That is the
 * honest answer in that state: there is nowhere to send them, and a master
 * admin who has locked somebody out of the entire application should see it
 * reported as a refusal rather than as the app being broken.
 */
export async function requireModuleView(nodeKey: string): Promise<void> {
  if (await canViewModule(nodeKey)) return;
  // Asked about the FALLBACK, not about the node we just refused — the question
  // is "is there anywhere to send them", and it must not recurse.
  if (nodeKey === FALLBACK_NODE || !(await canViewModule(FALLBACK_NODE))) {
    throw forbiddenError();
  }
  redirect(FALLBACK_ROUTE as Route);
}

/**
 * THE WRITE GUARD. Call at the top of every server action that mutates
 * something the matrix governs.
 *
 * Throws 403 rather than redirecting — a server action has no page to send
 * anybody to, and a redirect from an action body silently discards the caller's
 * error handling.
 *
 * ── THIS IS WHERE "EDIT: NO" ACTUALLY MEANS SOMETHING ──────────────────────
 * A page that hides its Save button is a suggestion. The action behind that
 * button is what the browser POSTs to, and it is reachable whether or not the
 * button rendered. So a node with `edit: false` is only genuinely read-only once
 * this guard is in its write path.
 */
export async function requireModuleEdit(nodeKey: string): Promise<void> {
  if (!(await canEditModule(nodeKey))) throw forbiddenError();
}

/**
 * Guard by PATH rather than by node key — for a route handler that knows its own
 * URL but not which node governs it.
 *
 * An ungoverned path passes: the matrix has no opinion about it, and inventing a
 * refusal for a route nobody has classified would break surfaces at random.
 */
export async function requirePathView(pathname: string): Promise<void> {
  const key = nodeKeyForPath(pathname);
  if (key) await requireModuleView(key);
}

/**
 * Every node key the signed-in person may SEE, as a set — what the navigation
 * needs to filter itself.
 *
 * Returns null when the matrix does not govern this person at all (a master
 * admin, or nobody signed in), which the nav reads as "show everything you would
 * have shown before". A null is meaningfully different from an empty set here,
 * so callers must not conflate them.
 */
export async function hiddenModuleKeys(): Promise<ReadonlySet<string> | null> {
  const me = await getCurrentEmployee();
  if (!me || !governedByMatrix(me)) return null;
  const overrides = await loadOverrides(me.id);
  if (overrides.size === 0) return new Set();
  const hidden = new Set<string>();
  for (const key of overrides.keys()) {
    if (!effectiveFor(key, overrides).show) hidden.add(key);
  }
  return hidden;
}

export type { EffectivePermission, PermissionAction };
