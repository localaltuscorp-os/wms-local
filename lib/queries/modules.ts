import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, moduleSubmissions } from "@/db/schema";
import type { ModuleKey } from "@/lib/forms/modules";

export interface ModuleSubmissionRow {
  id: string;
  module: string;
  employeeId: string;
  employeeName: string;
  fields: Record<string, string>;
  adminFields: Record<string, string>;
  status: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/**
 * Submissions for a module, newest first — everyone's for admins, mine only
 * otherwise. Archived rows excluded unless requested.
 */
export async function listModuleSubmissions(opts: {
  module: ModuleKey;
  employeeId: string;
  isAdmin: boolean;
  archived?: boolean;
}): Promise<ModuleSubmissionRow[]> {
  const rows = await db
    .select({
      id: moduleSubmissions.id,
      module: moduleSubmissions.module,
      employeeId: moduleSubmissions.employeeId,
      employeeName: employees.name,
      fields: moduleSubmissions.fields,
      adminFields: moduleSubmissions.adminFields,
      status: moduleSubmissions.status,
      decidedAt: moduleSubmissions.decidedAt,
      createdAt: moduleSubmissions.createdAt,
    })
    .from(moduleSubmissions)
    .innerJoin(employees, eq(moduleSubmissions.employeeId, employees.id))
    .where(
      and(
        eq(moduleSubmissions.module, opts.module),
        eq(moduleSubmissions.archived, opts.archived ?? false),
        opts.isAdmin ? undefined : eq(moduleSubmissions.employeeId, opts.employeeId),
      ),
    )
    .orderBy(desc(moduleSubmissions.createdAt))
    .limit(300);

  return rows.map((r) => ({ ...r, decidedByName: null }));
}
