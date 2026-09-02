import "server-only";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employeeDocuments, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { policyCategoryMeta, type PolicyCategory } from "@/lib/hr/policy-types";
import { LETTER_DOCTYPE_PREFIX, letterTypeMeta, type LetterType } from "@/lib/hr/letter-types";

/**
 * HR Sections read layer (Policies + Letters). Both reuse existing, already-
 * applied tables so no migration is needed:
 *   - Policies → the generic `documents` table, scoped by the storage prefix
 *     `hr-policies/<category>/…` (company-wide; admin uploads, everyone reads).
 *   - Letters  → the dossier `employee_documents` table with letter-scoped
 *     docTypes (prefix `letter_`) so a person's letters live with their file.
 *
 * ⚠ The `documents` table carries 0142 columns (goal_id / weekly_goal_id) that
 * may be UNAPPLIED in prod — every select here uses an EXPLICIT column list and
 * never `.select()`/star, so it is safe against a DB without 0142.
 */

/** Storage prefix that scopes `documents` rows to HR policies. */
export const POLICY_STORAGE_PREFIX = "hr-policies/";

/** Build the storage path for a policy upload: hr-policies/<category>/<uuid>/<name>. */
export function policyStoragePath(category: PolicyCategory, uuid: string, safeFileName: string): string {
  return `${POLICY_STORAGE_PREFIX}${category}/${uuid}/${safeFileName}`;
}

/** Parse the category segment out of a policy storage path (fallback "other"). */
function categoryFromPath(path: string): PolicyCategory {
  const seg = path.slice(POLICY_STORAGE_PREFIX.length).split("/")[0] ?? "";
  return policyCategoryMeta(seg).key;
}

async function signPaths(paths: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (paths.length === 0) return out;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const row of data ?? []) out.set(row.path ?? "", row.signedUrl ?? null);
  } catch {
    /* best-effort — rows render without a link on signing failure */
  }
  for (const p of paths) if (!out.has(p)) out.set(p, null);
  return out;
}

export interface PolicyRow {
  id: string;
  title: string;
  description: string | null;
  category: PolicyCategory;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  signedUrl: string | null;
  uploadedAt: string;
}

/** Every policy document (newest first), category parsed from the storage path. */
export async function listPolicies(): Promise<PolicyRow[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(like(documents.storagePath, `${POLICY_STORAGE_PREFIX}%`))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  const signed = await signPaths(rows.map((r) => r.storagePath));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: categoryFromPath(r.storagePath),
    fileName: r.storagePath.split("/").pop() ?? r.title,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    storagePath: r.storagePath,
    signedUrl: signed.get(r.storagePath) ?? null,
    uploadedAt: String(r.createdAt),
  }));
}

/** Group policies by category, preserving newest-first order within a group and
 *  by title so successive uploads of the same policy read as versions. */
export interface PolicyGroup {
  category: PolicyCategory;
  label: string;
  accent: string;
  hint: string;
  policies: PolicyRow[];
}
export function groupPolicies(rows: PolicyRow[]): PolicyGroup[] {
  const byCat = new Map<PolicyCategory, PolicyRow[]>();
  for (const r of rows) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const groups: PolicyGroup[] = [];
  for (const [category, policies] of byCat) {
    const meta = policyCategoryMeta(category);
    groups.push({ category, label: meta.label, accent: meta.accent, hint: meta.hint, policies });
  }
  // Keep a stable, sensible order.
  const order = ["code_of_conduct", "leave_attendance", "payroll_benefits", "it_security", "workplace_safety", "hr_general", "other"];
  groups.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return groups;
}

export interface LetterRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  letterType: LetterType;
  letterLabel: string;
  title: string;
  effectiveDate: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  notes: string | null;
  signedUrl: string | null;
  uploadedAt: string;
}

function toLetterRow(
  r: {
    id: string;
    employeeId: string;
    employeeName: string | null;
    docType: string;
    title: string;
    effectiveDate: string | Date | null;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    notes: string | null;
    storagePath: string;
    createdAt: Date;
  },
  signed: Map<string, string | null>,
): LetterRow {
  const meta = letterTypeMeta(r.docType);
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    letterType: meta.key,
    letterLabel: meta.label,
    title: r.title,
    effectiveDate: r.effectiveDate ? String(r.effectiveDate).slice(0, 10) : null,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    notes: r.notes,
    signedUrl: signed.get(r.storagePath) ?? null,
    uploadedAt: String(r.createdAt),
  };
}

/** All letters across every employee (admin view), newest first. */
export async function listAllLetters(): Promise<LetterRow[]> {
  const rows = await db
    .select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      employeeName: employees.name,
      docType: employeeDocuments.docType,
      title: employeeDocuments.title,
      effectiveDate: employeeDocuments.effectiveDate,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      sizeBytes: employeeDocuments.sizeBytes,
      notes: employeeDocuments.notes,
      storagePath: employeeDocuments.storagePath,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .leftJoin(employees, eq(employees.id, employeeDocuments.employeeId))
    .where(
      and(
        eq(employeeDocuments.archived, false),
        like(employeeDocuments.docType, `${LETTER_DOCTYPE_PREFIX}%`),
      ),
    )
    .orderBy(desc(employeeDocuments.effectiveDate), desc(employeeDocuments.createdAt))
    .limit(1000);
  const signed = await signPaths(rows.map((r) => r.storagePath));
  return rows.map((r) => toLetterRow(r, signed));
}

/** One employee's own letters (self view). */
export async function listMyLetters(employeeId: string): Promise<LetterRow[]> {
  const rows = await db
    .select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      employeeName: employees.name,
      docType: employeeDocuments.docType,
      title: employeeDocuments.title,
      effectiveDate: employeeDocuments.effectiveDate,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      sizeBytes: employeeDocuments.sizeBytes,
      notes: employeeDocuments.notes,
      storagePath: employeeDocuments.storagePath,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .leftJoin(employees, eq(employees.id, employeeDocuments.employeeId))
    .where(
      and(
        eq(employeeDocuments.employeeId, employeeId),
        eq(employeeDocuments.archived, false),
        like(employeeDocuments.docType, `${LETTER_DOCTYPE_PREFIX}%`),
      ),
    )
    .orderBy(desc(employeeDocuments.effectiveDate), desc(employeeDocuments.createdAt))
    .limit(500);
  const signed = await signPaths(rows.map((r) => r.storagePath));
  return rows.map((r) => toLetterRow(r, signed));
}

/** Active-employee roster for the Letters upload picker (admin surface). */
export async function listActiveRoster(): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}
