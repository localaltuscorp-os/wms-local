import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { canExportModule } from "@/lib/modules/backup/access";
import { moduleBackup } from "@/lib/modules/backup/registry";
import { ModuleExportButton } from "./module-export-button";

/**
 * The Export button, or nothing.
 *
 * Server-side, so a person who may not export this module never receives the
 * button — and the route checks again anyway, because a hidden button is not a
 * permission. Drop this into a module's landing page and it appears only for
 * Manan, Rutvisha, super-admins, and whoever was granted that module on the
 * Module Backups page.
 */
export async function ModuleExportSlot({
  moduleId,
  className,
}: {
  moduleId: string;
  className?: string;
}) {
  const def = moduleBackup(moduleId);
  if (!def) return null;
  const me = await getCurrentEmployee();
  if (!me || isCandidateAccount(me)) return null;
  if (!(await canExportModule(me, moduleId))) return null;
  return (
    <ModuleExportButton moduleId={moduleId} moduleLabel={def.label} className={className} />
  );
}
