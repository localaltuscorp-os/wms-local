"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  salaryProfiles,
  designations,
  payingEntities,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { readSheetValues } from "@/lib/google/read-sheet";
import {
  mapSalaryProfileRows,
  SALARY_NAME_ALIASES,
  type SalaryProfileSheetRow,
} from "@/lib/salary/profile-sheet";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// "Altus Corp Salary Payment" → Salary Breakup tab. Cols A:V cover everything
// the profile mapper reads (PT is col V); 4000 rows spans the full archive.
const SHEET_ID = "13dHs7Klp4_Eb3JUvhzTYEgQsmX-rLFfR2ZwZK9hcgrU";
const RANGE = "Salary Breakup!A1:V4000";
const PATH = "/admin/salary-profiles";

/** Collapse whitespace + lowercase — the match key against employees.name. */
function normName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

// Reviewed sheet-name → app-name aliases, pre-normalized for lookup.
const ALIAS = new Map(
  Object.entries(SALARY_NAME_ALIASES).map(([sheet, app]) => [
    normName(sheet),
    normName(app),
  ]),
);

export interface ProfileChange {
  employeeId: string;
  employeeName: string;
  month: string;
  currentCtc: number;
  annualCtc: number;
  ptExempt: boolean;
  designation: string | null;
  payingEntity: string | null;
  isNew: boolean; // no CTC profile today
  ctcChanged: boolean;
}

export interface ProfileImportPreview {
  sheetEmployees: number;
  matched: ProfileChange[];
  unmatchedNames: string[];
  newDesignations: string[];
  newEntities: string[];
}

interface Resolved {
  rows: SalaryProfileSheetRow[];
  matched: ProfileChange[];
  unmatchedNames: string[];
  newDesignations: string[];
  newEntities: string[];
}

/**
 * Read the sheet live, map to current-profile rows, and resolve each against
 * active employees + their existing CTC. DB reads only — NO writes. Shared by
 * preview and confirm so the two can never drift.
 */
async function loadAndResolve(): Promise<Resolved> {
  const matrix = await readSheetValues(SHEET_ID, RANGE);
  const rows = mapSalaryProfileRows(matrix);

  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      annualCtc: salaryProfiles.annualCtc,
    })
    .from(employees)
    .leftJoin(salaryProfiles, sql`${salaryProfiles.employeeId} = ${employees.id}`)
    .where(sql`${employees.isActive} = true`);

  const byName = new Map<string, { id: string; ctc: number | null }>();
  for (const e of empRows) {
    byName.set(normName(e.name), {
      id: e.id,
      ctc: e.annualCtc == null ? null : Number(e.annualCtc),
    });
  }

  // Existing roster names (lowercased) so we only flag genuinely-new ones.
  const [desigRows, entityRows] = await Promise.all([
    db.select({ name: designations.name }).from(designations),
    db.select({ name: payingEntities.name }).from(payingEntities),
  ]);
  const haveDesig = new Set(desigRows.map((d) => d.name.trim().toLowerCase()));
  const haveEntity = new Set(entityRows.map((e) => e.name.trim().toLowerCase()));

  const matched: ProfileChange[] = [];
  const unmatched = new Set<string>();
  const newDesig = new Set<string>();
  const newEntity = new Set<string>();

  for (const row of rows) {
    const key = normName(row.employeeName);
    const emp = byName.get(key) ?? byName.get(ALIAS.get(key) ?? "");
    if (!emp) {
      unmatched.add(row.employeeName);
      continue;
    }
    if (row.designation && !haveDesig.has(row.designation.toLowerCase())) {
      newDesig.add(row.designation);
    }
    if (row.payingEntity && !haveEntity.has(row.payingEntity.toLowerCase())) {
      newEntity.add(row.payingEntity);
    }
    const currentCtc = emp.ctc ?? 0;
    matched.push({
      employeeId: emp.id,
      employeeName: row.employeeName,
      month: row.month,
      currentCtc,
      annualCtc: row.annualCtc,
      ptExempt: row.ptExempt,
      designation: row.designation,
      payingEntity: row.payingEntity,
      isNew: emp.ctc == null,
      ctcChanged: currentCtc !== row.annualCtc,
    });
  }

  return {
    rows,
    matched: matched.sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    unmatchedNames: [...unmatched].sort(),
    newDesignations: [...newDesig].sort(),
    newEntities: [...newEntity].sort(),
  };
}

/** Preview the Salary Profiles import — reads the live sheet, no writes. */
export async function previewSalaryProfileImport(): Promise<
  ActionResult<{ preview: ProfileImportPreview }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  let r: Resolved;
  try {
    r = await loadAndResolve();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not read the sheet: ${msg}` };
  }

  if (r.rows.length === 0) {
    return {
      ok: false,
      error:
        "Parsed 0 employees from the 'Salary Breakup' tab. Check the sheet is shared with the service account and has its usual layout.",
    };
  }

  return {
    ok: true,
    preview: {
      sheetEmployees: r.rows.length,
      matched: r.matched,
      unmatchedNames: r.unmatchedNames,
      newDesignations: r.newDesignations,
      newEntities: r.newEntities,
    },
  };
}

/**
 * Confirm the import — re-reads the live sheet, creates any missing
 * designations / paying-entities, then in ONE transaction upserts each matched
 * employee's salary profile (annual CTC + PT-exempt) and stamps their
 * designation + paying entity.
 *
 * Safety / idempotency:
 *  - salary_profiles upsert sets ONLY annual_ctc + pt_exempt — it never touches
 *    tds_monthly (admin-entered; the sheet has no TDS column), so a re-run
 *    preserves any TDS already set.
 *  - designation / paying-entity on employees is set ONLY when the sheet row
 *    provides one (a blank cell never wipes an existing assignment).
 *  - Re-running with the same sheet is a no-op (same values written).
 */
export async function confirmSalaryProfileImport(): Promise<
  ActionResult<{
    updatedProfiles: number;
    createdDesignations: number;
    createdEntities: number;
    stampedDesignation: number;
    stampedEntity: number;
    skippedUnmatched: number;
  }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  let r: Resolved;
  try {
    r = await loadAndResolve();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not read the sheet: ${msg}` };
  }

  if (r.matched.length === 0) {
    return {
      ok: false,
      error: "No sheet employees matched an active employee by name.",
    };
  }

  let updatedProfiles = 0;
  let stampedDesignation = 0;
  let stampedEntity = 0;

  try {
    await db.transaction(async (tx) => {
      // 1) Create missing roster entries, then build name(lower) → id maps.
      for (const name of r.newDesignations) {
        await tx
          .insert(designations)
          .values({ name })
          .onConflictDoNothing({ target: designations.name });
      }
      for (const name of r.newEntities) {
        await tx
          .insert(payingEntities)
          .values({ name })
          .onConflictDoNothing({ target: payingEntities.name });
      }

      const [desigRows, entityRows] = await Promise.all([
        tx.select({ id: designations.id, name: designations.name }).from(designations),
        tx.select({ id: payingEntities.id, name: payingEntities.name }).from(payingEntities),
      ]);
      const desigId = new Map(desigRows.map((d) => [d.name.trim().toLowerCase(), d.id]));
      const entityId = new Map(entityRows.map((e) => [e.name.trim().toLowerCase(), e.id]));

      // 2) Per matched employee: upsert profile + stamp designation/entity.
      for (const m of r.matched) {
        await tx
          .insert(salaryProfiles)
          .values({
            employeeId: m.employeeId,
            annualCtc: m.annualCtc.toFixed(2),
            ptExempt: m.ptExempt,
          })
          .onConflictDoUpdate({
            target: salaryProfiles.employeeId,
            // Only CTC + PT-exempt. tds_monthly is deliberately untouched.
            set: {
              annualCtc: m.annualCtc.toFixed(2),
              ptExempt: m.ptExempt,
              updatedAt: new Date(),
            },
          });
        updatedProfiles += 1;

        const dId = m.designation ? desigId.get(m.designation.toLowerCase()) : undefined;
        const eId = m.payingEntity ? entityId.get(m.payingEntity.toLowerCase()) : undefined;
        if (dId || eId) {
          const patch: Record<string, unknown> = {};
          if (dId) {
            patch.designationId = dId;
            stampedDesignation += 1;
          }
          if (eId) {
            patch.payingEntityId = eId;
            stampedEntity += 1;
          }
          await tx
            .update(employees)
            .set(patch)
            .where(sql`${employees.id} = ${m.employeeId}`);
        }
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return {
    ok: true,
    updatedProfiles,
    createdDesignations: r.newDesignations.length,
    createdEntities: r.newEntities.length,
    stampedDesignation,
    stampedEntity,
    skippedUnmatched: r.unmatchedNames.length,
  };
}
