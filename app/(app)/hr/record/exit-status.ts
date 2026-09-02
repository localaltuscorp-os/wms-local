"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exitRecords, type ExitHandoverData } from "@/lib/hr/exit/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { resolvePersonEmployee } from "./resolve-person";
import { CLEARANCE_ROWS } from "@/lib/hr/exit/content";
import type { ExitSummary } from "./exit-status-types";

const TOTAL_CLEARANCE = CLEARANCE_ROWS.reduce((n, r) => n + r.items.length, 0);
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/**
 * Per-person Exit & Handover summary for the HR Record hub. Resolves the record's
 * person (a candidate_intake) to their employee account BY EMAIL — the same
 * pattern as the policy-signing + docket loaders — then reports whether an exit
 * interview and/or handover checklist is on file, when, and the handover
 * clearance progress. Honest: an unlinked person shows matched:false / no records.
 * Read-only + HR-gated. Load-neutral (a couple of indexed lookups).
 */
export async function getExitStatus(
  candidateId: string,
): Promise<{ ok: true; status: ExitSummary } | { ok: false; error: string }> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid person." };

  const empty: ExitSummary = {
    matched: false,
    interviewUpdatedAt: null,
    handoverUpdatedAt: null,
    handoverCleared: 0,
    handoverTotal: TOTAL_CLEARANCE,
  };

  try {
    const emp = await resolvePersonEmployee(candidateId);
    if (!emp) return { ok: true, status: empty };

    const rows = await db
      .select({ kind: exitRecords.kind, data: exitRecords.data, updatedAt: exitRecords.updatedAt })
      .from(exitRecords)
      .where(eq(exitRecords.employeeId, emp.id))
      .orderBy(desc(exitRecords.updatedAt));

    const interview = rows.find((r) => r.kind === "interview") ?? null;
    const handover = rows.find((r) => r.kind === "handover") ?? null;
    const checked = ((handover?.data as ExitHandoverData | undefined)?.checked ?? {}) as Record<string, boolean>;
    const handoverCleared = Object.values(checked).filter(Boolean).length;

    return {
      ok: true,
      status: {
        matched: true,
        interviewUpdatedAt: interview?.updatedAt ? interview.updatedAt.toISOString() : null,
        handoverUpdatedAt: handover?.updatedAt ? handover.updatedAt.toISOString() : null,
        handoverCleared,
        handoverTotal: TOTAL_CLEARANCE,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load exit status." };
  }
}
