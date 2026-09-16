import "server-only";
import type { Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";

/**
 * People who may use Records Backup whatever their admin flag or department —
 * added by name when asked for. Grants THIS feature only (the per-person ZIP and
 * the Drive save settings), nothing else. Lower-case.
 */
export const HR_RECORDS_EXTRA_ACCESS: readonly string[] = ["mohitgupta.altuscorp@gmail.com"];

export function hasExtraRecordsAccess(email: string | null | undefined): boolean {
  return HR_RECORDS_EXTRA_ACCESS.includes((email ?? "").trim().toLowerCase());
}

/**
 * Who may download a person's complete HR record or manage the Drive save.
 *
 * The named people above, plus HR staff who are ALSO admins (or super-admins).
 * The admin bar is the one the document vault already sets: the export carries
 * Aadhaar and PAN scans and signed letters, which the dossier keeps admin-only
 * (canAccessEmployeeDossier), and an export must not become the side door
 * around it. HR Record's Documents card uses the same test
 * (`me.isAdmin || isSuperAdmin(me.email)`) to show the vault.
 *
 * A predicate, not a redirecting guard: the routes that use it answer `fetch`
 * calls, and a redirect would be followed and saved as the ZIP.
 */
export async function canExportHrRecords(me: Employee): Promise<boolean> {
  if (hasExtraRecordsAccess(me.email)) return true;
  if (!(me.isAdmin || isSuperAdmin(me.email))) return false;
  return isHrStaff(me);
}
