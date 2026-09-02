/**
 * Pure boolean predicates for permission checks.
 * No DB, no I/O — safe to call anywhere.
 */

export type EmployeeView = {
  id: string;
  isAdmin: boolean;
  isActive: boolean;
};

export function canAccessAdminArea(emp: EmployeeView | null): boolean {
  if (!emp) return false;
  if (!emp.isActive) return false;
  return emp.isAdmin;
}

export function canInviteEmployees(emp: EmployeeView | null): boolean {
  return canAccessAdminArea(emp);
}
