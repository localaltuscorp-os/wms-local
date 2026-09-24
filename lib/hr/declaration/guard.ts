import "server-only";
import type { Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import {
  canManageDeclarations,
  canReadDeclarationScan,
  DECLARATION_REFUSAL,
} from "@/lib/hr/declaration/access";

/**
 * Server guards for the signed declarations. The allow-list itself, and why it
 * is narrower than admin, live in ./access.ts.
 *
 * Every read and write path calls one of these. The client predicates exist to
 * hide controls; these are what decide.
 */
export {
  DECLARATION_ADMINS_BY_EMAIL,
  DECLARATION_ADMIN_NAMES,
  DECLARATION_REFUSAL,
  canManageDeclarations,
  canReadDeclarationScan,
} from "@/lib/hr/declaration/access";

/** The custodian check, for the tracker and every upload. */
export async function requireDeclarationAdmin(): Promise<Employee> {
  const me = await requireUser();
  if (!canManageDeclarations(me, DUMMY_MODE)) {
    // Actions return a typed refusal rather than redirecting — the caller is a
    // form, not a navigation.
    throw new Error(DECLARATION_REFUSAL);
  }
  return me;
}

/** May the caller open THIS person's scan? Returns them, or throws. */
export async function requireScanReader(employeeId: string): Promise<Employee> {
  const me = await requireUser();
  if (!canReadDeclarationScan(me, employeeId, DUMMY_MODE)) {
    throw new Error("You are not authorized to open that declaration.");
  }
  return me;
}
