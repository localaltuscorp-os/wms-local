"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after";
import { notifyCompensationApproversOfPendingApproval } from "@/lib/compensation/workflow";
import { db } from "@/lib/db";
import { fileIncentiveRequest } from "@/lib/incentive/workflow-server";
import { requiredFieldsForTemplate } from "@/lib/templates/field-config";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";
import {
  existingRequestKeys,
  parseAndPrepareBulkRequests,
  type BulkIssue,
} from "@/lib/incentive/bulk-request";

export type BulkRequestActionResult = {
  ok: boolean;
  valid: number;
  created: number;
  failed: number;
  skipped: number;
  issues?: BulkIssue[];
  error?: string;
};

async function parse(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "No .xlsx file uploaded." };
  try {
    const required = new Set(await requiredFieldsForTemplate(TEMPLATE_KEYS.incentiveEntries, "default"));
    return { ok: true as const, parsed: await parseAndPrepareBulkRequests(file, required) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Workbook could not be read." };
  }
}

export async function validateBulkIncentiveRequests(formData: FormData): Promise<BulkRequestActionResult> {
  await requireAdmin();
  const input = await parse(formData);
  if (!input.ok) return { ok: false, valid: 0, created: 0, failed: 0, skipped: 0, error: input.error };
  const existing = await existingRequestKeys(input.parsed.rows);
  const duplicateIssues = input.parsed.rows.filter((row) => existing.has(row.key)).map((row) => ({ rowNumber: row.rowNumber, field: "Duplicate", message: "An identical incentive request already exists." }));
  const issues = [...input.parsed.issues, ...duplicateIssues];
  return { ok: input.parsed.rows.length > duplicateIssues.length, valid: input.parsed.rows.length - duplicateIssues.length, created: 0, failed: issues.length, skipped: input.parsed.skipped, issues, error: issues.length ? "Review the row-level issues before importing." : undefined };
}

export async function confirmBulkIncentiveRequests(formData: FormData): Promise<BulkRequestActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, valid: 0, created: 0, failed: 0, skipped: 0, error: limited.error };
  const input = await parse(formData);
  if (!input.ok) return { ok: false, valid: 0, created: 0, failed: 0, skipped: 0, error: input.error };
  const existing = await existingRequestKeys(input.parsed.rows);
  const issues = [...input.parsed.issues];
  const rows = input.parsed.rows.filter((row) => {
    if (!existing.has(row.key)) return true;
    issues.push({ rowNumber: row.rowNumber, field: "Duplicate", message: "An identical incentive request already exists." });
    return false;
  });
  let created = 0;
  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await fileIncentiveRequest(row.values, { tx });
        created += 1;
      }
    });
  } catch (error) {
    return { ok: false, valid: rows.length, created: 0, failed: rows.length, skipped: input.parsed.skipped, issues, error: error instanceof Error ? error.message : "Import failed; no requests were created." };
  }
  revalidatePath("/incentive");
  if (created > 0) {
    afterResponse(() => notifyCompensationApproversOfPendingApproval({ kind: "incentive", actorId: me.id, employeeName: me.name }));
  }
  return { ok: created > 0, valid: rows.length, created, failed: issues.length, skipped: input.parsed.skipped, issues };
}
