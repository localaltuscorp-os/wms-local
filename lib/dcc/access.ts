import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { localAllWorkspaces } from "@/lib/auth/local-session";
import { hasCapabilityGrant } from "@/lib/security/capability-grants";

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

/**
 * MAY THIS PERSON SEE AND MAINTAIN EVERY EMPLOYEE'S WCC AND MCC?
 *
 * A row in `capability_grants` (migration 0248), granted by an admin from the
 * employee editor — the same shape as `hr.letters.issue`, and for the same
 * reason: running the compliance rosters is a real job, it belongs to a named
 * person rather than to the org chart, and handing it over should not need a
 * deploy.
 *
 * The org chart is the wrong lever even though it is the one that works today:
 * making somebody the manager of everyone also decides who approves their
 * attendance and who may hand them tasks, and it records a reporting line that
 * is not true.
 *
 * Fails CLOSED. An unknown address is not a coordinator.
 */
export async function isComplianceCoordinator(email: string | null | undefined): Promise<boolean> {
  return hasCapabilityGrant(email, "dcc.coordinator");
}

export interface ComplianceScope extends DccScope {
  /**
   * THE REPORTING CHAIN ALONE — never widened, not even for a coordinator.
   *
   * `visibleIds` answers "who may I see, and give work to"; this answers "whose
   * manager am I", which is what decides whether a ruling (Approved / Not
   * Approved) may be written on somebody's row.
   *
   * They are different questions and a coordinator satisfies only the first.
   * Collapsing them would hand a roster-keeper the power to overrule every
   * manager's verdict in the company — silently, as a side effect of visibility
   * that was granted for an entirely different purpose.
   */
  chainIds: ReadonlySet<string>;
  /** Whether the reach above came from the coordinator grant rather than from
   *  being a super-admin. The boards need the difference: a super-admin may fill
   *  in anyone's row by definition, a coordinator has to be told so explicitly. */
  isCoordinator: boolean;
}

/**
 * THE WCC / MCC SCOPE — `loadDccScope`, widened to everyone for a coordinator.
 *
 * Used by the two checklists and by the ROSTER write paths — `guardItemWrite`
 * (edit / remove a compliance) and the Mins box — and DELIBERATELY nothing else.
 * The DCC board, the call log, the Masters screen, the attendance confirmations
 * and the mobile team dashboard all keep the plain `loadDccScope`: a coordinator
 * runs the weekly and monthly checklists, and nothing else follows from it.
 */
export async function loadComplianceScope(me: Employee): Promise<ComplianceScope> {
  const chain = await loadDccScope(me);
  // Already everyone — a super-admin, or the local dev session. Nothing to add.
  if (chain.isSuper) {
    return { ...chain, chainIds: chain.visibleIds, isCoordinator: false };
  }
  if (!(await isComplianceCoordinator(me.email))) {
    return { ...chain, chainIds: chain.visibleIds, isCoordinator: false };
  }

  const all = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.isActive, true));
  return {
    me,
    isSuper: true,
    isManager: true,
    visibleIds: new Set(all.map((a) => a.id)),
    // Still the chain alone. SEEING everyone is not being everyone's manager.
    chainIds: chain.visibleIds,
    isCoordinator: true,
  };
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
