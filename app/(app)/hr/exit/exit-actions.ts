"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employees, designations, departments } from "@/db/schema";
import {
  exitRecords,
  type ExitRosterEmployee,
  type ExitInterviewData,
  type ExitHandoverData,
  type ExitRecordData,
} from "@/lib/hr/exit/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { recordHrFormSubmission, forgetHrFormSubmission } from "@/lib/hr/forms/record";
import { mailSubmittedFormToHr } from "@/lib/hr/forms/notify";
import { afterResponse } from "@/lib/after";
import { exitResponsesFor, exitFormKey } from "@/lib/hr/forms/exit-responses";
import { validateExitSubmission } from "@/lib/hr/exit/validate";
import { hrFormSubmissions, asHrFormStatus, type HrFormStatus } from "@/lib/hr/forms/schema";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const KINDS = ["interview", "handover"] as const;

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  kind: z.enum(KINDS),
  // The whole form payload. Cap the serialized size defensively (jsonb),
  // and keep it a plain object.
  data: z.record(z.string(), z.unknown()).default({}),
  /** "draft" = autosave / Save Draft; "submitted" = the Submit button. Defaults
   *  to draft so the form's 1.4s autosave can never submit on the user's behalf. */
  status: z.enum(["draft", "submitted"]).default("draft"),
});

/**
 * Create-or-update an exit record for an employee + form kind. Re-saving the
 * same record (by id) keeps one row; a first save creates it. Rate-limited and
 * HR-gated.
 */
export async function saveExitRecord(input: z.input<typeof SaveSchema>): Promise<Result<{ id: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  const v = parsed.data;

  // Guard against absurd payloads (keeps a rogue client from writing megabytes).
  if (JSON.stringify(v.data).length > 200_000) return { ok: false, error: "Form is too large to save." };

  // A SUBMIT has to be a real, attributable form; a draft has no bar at all
  // (it is unfinished by definition, and the 1.4s autosave must never fail on
  // it). Checked here rather than only in the client because the client check is
  // a convenience — this is the rule. Without it a blank Submit wrote an empty
  // index row and mailed HR a PDF reading "No answers were recorded".
  if (v.status === "submitted") {
    const check = validateExitSubmission(v.kind, v.data as ExitRecordData);
    if (!check.ok) return { ok: false, error: check.error };
  }

  try {
    let recordId: string;
    // WHOSE form this was before this save. The submissions index is keyed by
    // (form, employee, source row), so re-pointing a record at a different
    // employee strands the old employee's index row on someone else's record —
    // and it stays readable by them. Read it before the update overwrites it.
    let priorEmployeeId: string | null = null;
    if (v.id) {
      const [prev] = await db
        .select({ employeeId: exitRecords.employeeId })
        .from(exitRecords)
        .where(eq(exitRecords.id, v.id))
        .limit(1);
      // A caller-supplied id that matches nothing used to UPDATE zero rows and
      // then happily index a record that does not exist.
      if (!prev) return { ok: false, error: "This exit record no longer exists." };
      priorEmployeeId = prev.employeeId;
      await db
        .update(exitRecords)
        .set({ data: v.data as Record<string, unknown>, employeeId: v.employeeId, kind: v.kind, updatedAt: new Date() })
        .where(eq(exitRecords.id, v.id));
      recordId = v.id;
    } else {
      const [row] = await db
        .insert(exitRecords)
        .values({ employeeId: v.employeeId, kind: v.kind, data: v.data as Record<string, unknown>, createdById: me.id })
        .returning({ id: exitRecords.id });
      if (!row) return { ok: false, error: "Could not save the form." };
      recordId = row.id;
    }

    // Index the submission for My/All Filled Forms — AFTER exit_records is
    // written, never before. That table stays the source of truth: if indexing
    // fails the form is still saved, and the next save repairs the index. Doing
    // it first would let the list advertise a submission that was never stored.
    //
    // A DRAFT failure here is deliberately NOT surfaced as a save error — the
    // user's form did save, and telling them otherwise would push them to
    // re-enter it. A SUBMIT failure is different; see below.
    const formKey = exitFormKey(v.kind);

    // Re-parented to a different employee: drop the previous owner's index row
    // before writing the new one, or they keep a readable entry pointing at what
    // is now somebody else's exit record.
    if (priorEmployeeId && priorEmployeeId !== v.employeeId) {
      await forgetHrFormSubmission({ formKey, employeeId: priorEmployeeId, sourceId: recordId });
    }

    const indexed = await recordHrFormSubmission({
      formKey,
      employeeId: v.employeeId,
      submittedById: me.id,
      status: v.status,
      responses: exitResponsesFor(v.kind, v.data as ExitInterviewData | ExitHandoverData),
      sourceId: recordId,
    });
    if (!indexed.ok) {
      console.error("[exit] form saved but indexing failed:", indexed.error);
      // On a SUBMIT the index IS the deliverable: an unindexed submission never
      // reaches My Filled Forms and never mails the HR desk. Staying quiet would
      // leave the user believing they had filed it. The form itself is safely
      // saved either way, so re-pressing Submit is a cheap, correct repair.
      if (v.status === "submitted") {
        return { ok: false, error: "Saved, but the submission couldn't be filed. Press Submit again." };
      }
    } else if (indexed.newlySubmitted) {
      // Submit — not Save Draft, and not a later edit of an already-submitted
      // form — mails the completed PDF to the HR desk. `newlySubmitted` is what
      // makes that exactly-once; see recordHrFormSubmission. Deferred past the
      // response so rendering a PDF never slows the save, and it cannot fail the
      // save either (mailSubmittedFormToHr never throws).
      const submissionId = indexed.id;
      afterResponse(() => mailSubmittedFormToHr(submissionId));
    }

    revalidatePath("/hr/exit");
    revalidatePath("/hr/my-forms");
    revalidatePath("/hr/all-forms");
    return { ok: true, id: recordId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export interface ExitRecordState {
  id: string;
  employeeId: string | null;
  kind: (typeof KINDS)[number];
  data: Record<string, unknown>;
  updatedAt: Date;
  /**
   * Whether this record has been SUBMITTED, not just saved.
   *
   * `exit_records` has no status column — submission is a fact about the index,
   * so it is read from there. Without it the form defaulted to "not submitted"
   * on every open, so re-opening a filed exit interview showed "Draft saved" and
   * a live Submit button over work that had already gone to HR.
   */
  status: HrFormStatus;
}

/**
 * Latest saved record for an employee + kind (so re-opening the form resumes
 * exactly where it was left). Returns null when nothing is saved yet.
 */
export async function getExitRecord(
  employeeId: string,
  kind: (typeof KINDS)[number],
): Promise<ExitRecordState | null> {
  await requireHrStaff();
  if (!z.string().uuid().safeParse(employeeId).success) return null;
  if (!(KINDS as readonly string[]).includes(kind)) return null;
  const [r] = await db
    .select({
      id: exitRecords.id,
      employeeId: exitRecords.employeeId,
      kind: exitRecords.kind,
      data: exitRecords.data,
      updatedAt: exitRecords.updatedAt,
    })
    .from(exitRecords)
    .where(and(eq(exitRecords.employeeId, employeeId), eq(exitRecords.kind, kind)))
    .orderBy(desc(exitRecords.updatedAt))
    .limit(1);
  if (!r) return null;

  // One indexed lookup on the same key the recorder writes under. A record with
  // no index row yet (saved before 0181, or an index write that failed) reads as
  // a draft — the safe direction: it offers Submit rather than claiming a filing
  // that never happened.
  const [sub] = await db
    .select({ status: hrFormSubmissions.status })
    .from(hrFormSubmissions)
    .where(
      and(
        eq(hrFormSubmissions.formKey, exitFormKey(kind)),
        eq(hrFormSubmissions.employeeId, employeeId),
        eq(hrFormSubmissions.sourceId, r.id),
      ),
    )
    .limit(1);

  return {
    id: r.id,
    employeeId: r.employeeId,
    kind: r.kind as (typeof KINDS)[number],
    data: (r.data ?? {}) as Record<string, unknown>,
    updatedAt: r.updatedAt,
    status: asHrFormStatus(sub?.status),
  };
}

export interface ExitRecordRow {
  id: string;
  employeeId: string | null;
  employeeName: string;
  kind: (typeof KINDS)[number];
  updatedAt: Date;
}

/** Recent exit submissions (both kinds) for the workspace history list. */
export async function listExitRecords(): Promise<ExitRecordRow[]> {
  await requireHrStaff();
  const rows = await db
    .select({
      id: exitRecords.id,
      employeeId: exitRecords.employeeId,
      kind: exitRecords.kind,
      updatedAt: exitRecords.updatedAt,
      employeeName: employees.name,
    })
    .from(exitRecords)
    .leftJoin(employees, eq(exitRecords.employeeId, employees.id))
    .orderBy(desc(exitRecords.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName ?? "—",
    kind: r.kind as (typeof KINDS)[number],
    updatedAt: r.updatedAt,
  }));
}

/**
 * Rich active-employee roster for the Exit forms: each row carries the
 * manager's name (self-join on `manager_id`), designation and department
 * (FK joins, with the legacy free-text `department` column as fallback) so the
 * forms can auto-fill Manager / Designation / Department / Employee ID on
 * selection. HR-gated; ordered by name for the searchable dropdown.
 */
export async function listExitRoster(): Promise<ExitRosterEmployee[]> {
  await requireHrStaff();
  const mgr = alias(employees, "exit_mgr");
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      designation: designations.name,
      managerName: mgr.name,
      departmentName: departments.name,
      departmentLegacy: employees.department,
    })
    .from(employees)
    .leftJoin(mgr, eq(employees.managerId, mgr.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    designation: r.designation ?? "",
    managerName: r.managerName ?? "",
    department: r.departmentName ?? r.departmentLegacy ?? "",
  }));
}
