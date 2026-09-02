import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeDocuments, employees, designations } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/db/with-timeout";
import { docTypeMeta, type DossierDocType } from "@/lib/dossier/types";
import type { DossierAccess } from "@/lib/dossier/access";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };
const SIGNED_TTL = 3600; // 1h — regenerated on every page read

/** Batch-sign storage paths → Map(path → url). Failures map to null (the UI
 *  shows a graceful "couldn't load" rather than crashing the page). */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return out;
  try {
    const { data } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUrls(unique, SIGNED_TTL);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch {
    /* leave map empty — callers treat a missing url as "unavailable" */
  }
  return out;
}

export interface DossierEmployeeCard {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  docCount: number;
  lastUpdated: string | null;
}

/**
 * The employee roster for the "By employee" view. Admins get every active
 * employee (with a live document count); a non-admin gets only themselves.
 */
export async function listDossierEmployees(
  access: DossierAccess,
): Promise<DossierEmployeeCard[]> {
  const countExpr = sql<number>`count(${employeeDocuments.id}) filter (where ${employeeDocuments.archived} = false)`;
  const lastExpr = sql<string | null>`max(${employeeDocuments.updatedAt})`;

  const rows = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          avatarUrl: employees.avatarUrl,
          designation: designations.name,
          docCount: countExpr,
          lastUpdated: lastExpr,
        })
        .from(employees)
        .leftJoin(designations, eq(employees.designationId, designations.id))
        .leftJoin(employeeDocuments, eq(employeeDocuments.employeeId, employees.id))
        .where(
          access.isAdmin
            ? eq(employees.isActive, true)
            : eq(employees.id, access.me.id),
        )
        .groupBy(employees.id, employees.name, employees.avatarUrl, designations.name)
        .orderBy(asc(employees.name)),
    { ...RETRY, label: "dossier-employees" },
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl ?? null,
    designation: r.designation ?? null,
    docCount: Number(r.docCount ?? 0),
    lastUpdated: r.lastUpdated ? String(r.lastUpdated) : null,
  }));
}

export interface DossierDoc {
  id: string;
  docType: DossierDocType;
  title: string;
  effectiveDate: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  notes: string | null;
  archived: boolean;
  uploadedAt: string;
  signedUrl: string | null;
}

export interface EmployeeDossier {
  employee: { id: string; name: string; avatarUrl: string | null; designation: string | null };
  docs: DossierDoc[];
}

/** Every document for one employee (newest first within a type), with fresh
 *  signed URLs. `includeArchived` is admin-only in practice. */
export async function getEmployeeDossier(
  employeeId: string,
  opts?: { includeArchived?: boolean },
): Promise<EmployeeDossier | null> {
  const emp = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          avatarUrl: employees.avatarUrl,
          designation: designations.name,
        })
        .from(employees)
        .leftJoin(designations, eq(employees.designationId, designations.id))
        .where(eq(employees.id, employeeId))
        .limit(1),
    { ...RETRY, label: "dossier-employee" },
  );
  if (!emp[0]) return null;

  const rows = await withRetry(
    () =>
      db
        .select()
        .from(employeeDocuments)
        .where(
          opts?.includeArchived
            ? eq(employeeDocuments.employeeId, employeeId)
            : and(
                eq(employeeDocuments.employeeId, employeeId),
                eq(employeeDocuments.archived, false),
              ),
        )
        .orderBy(
          desc(employeeDocuments.effectiveDate),
          desc(employeeDocuments.createdAt),
        ),
    { ...RETRY, label: "dossier-docs" },
  );

  const signed = await signPaths(rows.map((r) => r.storagePath));

  return {
    employee: {
      id: emp[0].id,
      name: emp[0].name,
      avatarUrl: emp[0].avatarUrl ?? null,
      designation: emp[0].designation ?? null,
    },
    docs: rows.map((r) => ({
      id: r.id,
      docType: docTypeMeta(r.docType).key,
      title: r.title,
      effectiveDate: r.effectiveDate ? String(r.effectiveDate) : null,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      notes: r.notes,
      archived: r.archived,
      uploadedAt: String(r.createdAt),
      signedUrl: signed.get(r.storagePath) ?? null,
    })),
  };
}

export interface DossierTypeRow extends DossierDoc {
  employeeId: string;
  employeeName: string;
  employeeAvatarUrl: string | null;
}

/** Admin "By type" view — one document type across every employee. */
export async function listDossierByType(
  docType: DossierDocType,
): Promise<DossierTypeRow[]> {
  const rows = await withRetry(
    () =>
      db
        .select({
          doc: employeeDocuments,
          employeeName: employees.name,
          employeeAvatarUrl: employees.avatarUrl,
        })
        .from(employeeDocuments)
        .innerJoin(employees, eq(employees.id, employeeDocuments.employeeId))
        .where(
          and(
            eq(employeeDocuments.docType, docType),
            eq(employeeDocuments.archived, false),
          ),
        )
        .orderBy(asc(employees.name), desc(employeeDocuments.effectiveDate)),
    { ...RETRY, label: "dossier-by-type" },
  );

  const signed = await signPaths(rows.map((r) => r.doc.storagePath));

  return rows.map((r) => ({
    id: r.doc.id,
    docType: docTypeMeta(r.doc.docType).key,
    title: r.doc.title,
    effectiveDate: r.doc.effectiveDate ? String(r.doc.effectiveDate) : null,
    fileName: r.doc.fileName,
    mimeType: r.doc.mimeType,
    sizeBytes: r.doc.sizeBytes,
    notes: r.doc.notes,
    archived: r.doc.archived,
    uploadedAt: String(r.doc.createdAt),
    signedUrl: signed.get(r.doc.storagePath) ?? null,
    employeeId: r.doc.employeeId,
    employeeName: r.employeeName,
    employeeAvatarUrl: r.employeeAvatarUrl ?? null,
  }));
}

/** Live count per document type across everyone (for the "By type" nav). */
export async function dossierTypeCounts(): Promise<Record<string, number>> {
  const rows = await withRetry(
    () =>
      db
        .select({
          docType: employeeDocuments.docType,
          n: sql<number>`count(*)`,
        })
        .from(employeeDocuments)
        .where(eq(employeeDocuments.archived, false))
        .groupBy(employeeDocuments.docType),
    { ...RETRY, label: "dossier-type-counts" },
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.docType] = Number(r.n ?? 0);
  return out;
}
