import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { localAllWorkspaces } from "@/lib/auth/local-session";

/**
 * DCC visibility scope. Employees see only their own KPIs; a manager sees their
 * own + their (transitive) downline via employees.manager_id; super-admins see
 * everyone. Computed from a single employees fetch (no per-row queries).
 */
export interface DccScope {
  me: Employee;
  isSuper: boolean;
  isManager: boolean;
  /** Employee ids whose KPIs this viewer may SEE (includes self). */
  visibleIds: Set<string>;
}

export async function loadDccScope(me: Employee): Promise<DccScope> {
  /* DEV_ALL_WORKSPACES widens the LOCAL session, exactly as it already does for
     every room (lib/auth/workspace-access) and for the HR module
     (lib/hr/access). DCC was the one module that read `isSuperAdmin` alone, and
     the consequence was worse than a shut door: a developer whose own account
     has one compliance and no reports saw every DCC screen render EMPTY and had
     no way to tell that apart from the feature being broken. The temptation
     then is to point DEV_USER_EMAIL at a super-admin, which is impersonation —
     it puts somebody else's name on every write.
     `localAllWorkspaces()` requires DISABLE_AUTH and is dead under
     NODE_ENV=production or on Vercel, so no deployment reaches this. */
  if (isSuperAdmin(me.email) || localAllWorkspaces()) {
    const all = await db.select({ id: employees.id }).from(employees);
    return { me, isSuper: true, isManager: true, visibleIds: new Set(all.map((a) => a.id)) };
  }
  const all = await db
    .select({ id: employees.id, managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.isActive, true));
  const childrenOf = new Map<string, string[]>();
  for (const e of all) {
    if (!e.managerId) continue;
    const list = childrenOf.get(e.managerId);
    if (list) list.push(e.id);
    else childrenOf.set(e.managerId, [e.id]);
  }
  const visible = new Set<string>([me.id]);
  const stack = [me.id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf.get(cur) ?? []) {
      if (!visible.has(c)) {
        visible.add(c);
        stack.push(c);
      }
    }
  }
  return { me, isSuper: false, isManager: visible.size > 1, visibleIds: visible };
}

/** Employees fill only their own; super-admins may fill on anyone's behalf. */
export function canFillFor(scope: DccScope, ownerId: string): boolean {
  return scope.isSuper || ownerId === scope.me.id;
}
/** Managers author their downline's KPIs; super-admins author anyone's. */
export function canManageItemsFor(scope: DccScope, ownerId: string): boolean {
  return scope.isSuper || (ownerId !== scope.me.id ? scope.visibleIds.has(ownerId) : true);
}
/** Managers review their downline (not themselves); super-admins review anyone. */
export function canReviewFor(scope: DccScope, ownerId: string): boolean {
  return scope.isSuper || (ownerId !== scope.me.id && scope.visibleIds.has(ownerId));
}
export function canViewFor(scope: DccScope, ownerId: string): boolean {
  return scope.visibleIds.has(ownerId);
}
