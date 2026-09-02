import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Goals Cascade workspace (`/goals`).
 *
 * The `goals` workspace is an OPEN room — every active employee may enter and
 * manage their own cascade; managers reach their downline and admins/Manan reach
 * everyone (that per-target authority is enforced by `lib/goals/scope.ts`, which
 * wraps the mature weekly-goals hierarchy). `isAdmin` here means "org-wide reach /
 * may review-accept anyone" — an app admin OR a super-admin (Manan/Hetesh).
 *
 * Mirrors `lib/monthly-events/access.ts` shape: re-assert in EVERY page (layout
 * gates are unreliable on prod — an in-page redirect() reads 200 to fetch).
 */
export interface GoalsAccess {
  me: Employee;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function goalsAccess(): Promise<GoalsAccess> {
  const me = await requireUser();
  const superAdmin = isSuperAdmin(me.email);
  return { me, isAdmin: superAdmin || me.isAdmin, isSuperAdmin: superAdmin };
}

/** For pages: returns access (any signed-in active employee). */
export async function requireGoalsAccess(): Promise<GoalsAccess> {
  return goalsAccess();
}

/** For the workspace surface — currently identical to `requireGoalsAccess`
 *  (open room). Kept as a distinct name so a future room-level restriction has a
 *  single choke-point without touching every caller. */
export async function requireGoalsWorkspace(): Promise<GoalsAccess> {
  const access = await goalsAccess();
  // Open room today; if the room is ever department/role-gated, bounce here.
  if (!access.me.isActive) redirect("/hub" as Route);
  return access;
}
