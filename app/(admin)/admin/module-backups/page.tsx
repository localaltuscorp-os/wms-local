import { notFound } from "next/navigation";
import { asc, and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageModuleBackups } from "@/lib/modules/backup/access";
import { BACKUP_MODULE_IDS, createdOnlyTabs, moduleBackup } from "@/lib/modules/backup/registry";
import { moduleBackupGrants, moduleBackupModules, moduleBackupRuns } from "@/lib/modules/backup/schema";
import {
  MODULE_BACKUP_DRIVE_ACCOUNT,
  MODULE_BACKUP_ROOT_FOLDER,
  readSettings,
} from "@/lib/modules/backup/settings";
import { ModuleBackupsScreen } from "@/components/admin/module-backups-screen";

export const dynamic = "force-dynamic";

/**
 * MODULE BACKUPS — the one place that says what is being saved, where, and who
 * may take a copy.
 *
 * Not open to every admin: an export of a module is every row in it, leaving
 * the building in one file, and the page also hands that right to other people.
 * `notFound()` rather than a "forbidden" page, which would only confirm that
 * the screen exists.
 */
export default async function ModuleBackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string; as?: string }>;
}) {
  const me = await requireUser();
  if (!canManageModuleBackups(me)) notFound();

  const sp = await searchParams;
  const [settings, states, grants, recentRuns, roster] = await Promise.all([
    readSettings(),
    db.select().from(moduleBackupModules),
    db
      .select({
        moduleId: moduleBackupGrants.moduleId,
        employeeId: moduleBackupGrants.employeeId,
        name: employees.name,
        email: employees.email,
      })
      .from(moduleBackupGrants)
      .innerJoin(employees, eq(employees.id, moduleBackupGrants.employeeId)),
    db
      .select()
      .from(moduleBackupRuns)
      .orderBy(desc(moduleBackupRuns.startedAt))
      .limit(60),
    db
      .select({ id: employees.id, name: employees.name, email: employees.email })
      .from(employees)
      .where(and(eq(employees.isActive, true), ne(employees.accountType, "candidate")))
      .orderBy(asc(employees.name)),
  ]);

  const stateById = new Map(states.map((s) => [s.moduleId, s]));
  const latestByModule = new Map<string, (typeof recentRuns)[number]>();
  for (const run of recentRuns) {
    if (!latestByModule.has(run.moduleId)) latestByModule.set(run.moduleId, run);
  }

  const modules = BACKUP_MODULE_IDS.map((id) => {
    const def = moduleBackup(id)!;
    const state = stateById.get(id);
    const last = latestByModule.get(id);
    return {
      id,
      label: def.label,
      tabs: def.datasets.length,
      newRowsOnlyTabs: createdOnlyTabs(id),
      enabled: state?.enabled ?? true,
      exportedThrough: state?.exportedThrough?.toISOString() ?? null,
      lastRunAt: state?.lastRunAt?.toISOString() ?? null,
      lastFullAt: state?.lastFullAt?.toISOString() ?? null,
      lastRun: last
        ? {
            status: last.status,
            kind: last.kind,
            folderName: last.folderName,
            files: last.counts?.files ?? 0,
            skippedFiles: last.counts?.skippedFiles ?? 0,
            error: last.error,
            startedAt: last.startedAt.toISOString(),
            finishedAt: last.finishedAt?.toISOString() ?? null,
          }
        : null,
      grants: grants
        .filter((g) => g.moduleId === id)
        .map((g) => ({ employeeId: g.employeeId, name: g.name, email: g.email })),
    };
  });

  return (
    <ModuleBackupsScreen
      account={MODULE_BACKUP_DRIVE_ACCOUNT}
      rootFolder={MODULE_BACKUP_ROOT_FOLDER}
      connectedAs={settings.accountEmail}
      connectedAt={settings.connectedAt?.toISOString() ?? null}
      scheduleEnabled={settings.scheduleEnabled}
      runHourIst={settings.runHourIst}
      lastError={settings.lastError}
      modules={modules}
      roster={roster}
      driveStatus={sp.drive ?? null}
      attemptedAccount={sp.as ?? null}
    />
  );
}
