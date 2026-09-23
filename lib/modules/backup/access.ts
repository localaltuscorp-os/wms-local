import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Employee } from "@/db/schema";
import { isMasterAdmin } from "@/lib/security/capability-grants";
import { moduleBackupGrants } from "./schema";

/**
 * WHO MAY EXPORT A MODULE.
 *
 * Asked for on 21 Sep: "Manual download allowed only to Manan and Rutvisha and
 * no other person — or I can set module wise who is allowed."
 *
 * So both: these two always may, and anyone else is given a module at a time
 * from the Module Backups page (module_backup_grants), without a deploy.
 *
 * ── WHY THIS IS NOT "CAN THE PERSON OPEN THE MODULE" ───────────────────────
 * Everyone can open Attendance. An export of Attendance is every employee's
 * every punch in one file that leaves the building — a different thing from
 * reading today's screen. The HR records export draws the same line
 * (lib/hr/records-export/access.ts) and for the same reason.
 */

/** Legacy export owners may still export assigned modules; management is role-only. */
export const MODULE_BACKUP_OWNERS: readonly string[] = [
  "manan@unleashed.in",
  "rutvishamehta.altuscorp@gmail.com",
];

function isOwner(email: string | null | undefined): boolean {
  return MODULE_BACKUP_OWNERS.includes((email ?? "").trim().toLowerCase());
}

/** May this person export THIS module? */
export async function canExportModule(me: Employee, moduleId: string): Promise<boolean> {
  if (isOwner(me.email) || (await isMasterAdmin(me.email))) return true;
  const [grant] = await db
    .select({ id: moduleBackupGrants.id })
    .from(moduleBackupGrants)
    .where(and(eq(moduleBackupGrants.moduleId, moduleId), eq(moduleBackupGrants.employeeId, me.id)))
    .limit(1);
  return !!grant;
}

/** The modules this person may export — for showing the button, and the page. */
export async function exportableModules(me: Employee, all: readonly string[]): Promise<Set<string>> {
  if (isOwner(me.email) || (await isMasterAdmin(me.email))) return new Set(all);
  const rows = await db
    .select({ moduleId: moduleBackupGrants.moduleId })
    .from(moduleBackupGrants)
    .where(eq(moduleBackupGrants.employeeId, me.id));
  return new Set(rows.map((r) => r.moduleId));
}

/**
 * May this person change who exports what, and the schedule? Super-admins only.
 * Export grants and Drive credentials are administrative controls, so this is
 * deliberately independent from ordinary module export access.
 */
export async function canManageModuleBackups(me: Employee): Promise<boolean> {
  return isMasterAdmin(me.email);
}
