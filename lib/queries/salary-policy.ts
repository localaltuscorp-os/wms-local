import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, salaryPolicies, salaryPolicyConsents } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface CurrentPolicy {
  id: string;
  version: string;
  storagePath: string;
  uploadedById: string | null;
  createdAt: Date;
  /** Short-lived signed URL for the policy PDF (null if signing failed). */
  url: string | null;
}

/**
 * The current salary policy (`is_current = true`), newest first, with a fresh
 * 1-hour signed URL for its PDF. Returns null if no policy is published yet.
 */
export async function getCurrentPolicy(): Promise<CurrentPolicy | null> {
  const [row] = await db
    .select({
      id: salaryPolicies.id,
      version: salaryPolicies.version,
      storagePath: salaryPolicies.storagePath,
      uploadedById: salaryPolicies.uploadedById,
      createdAt: salaryPolicies.createdAt,
    })
    .from(salaryPolicies)
    .where(eq(salaryPolicies.isCurrent, true))
    .orderBy(desc(salaryPolicies.createdAt))
    .limit(1);

  if (!row) return null;

  let url: string | null = null;
  const { data, error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl(row.storagePath, 3600);
  if (!error && data) url = data.signedUrl;

  return {
    id: row.id,
    version: row.version,
    storagePath: row.storagePath,
    uploadedById: row.uploadedById ?? null,
    createdAt: row.createdAt,
    url,
  };
}

export interface MyConsent {
  id: string;
  policyVersion: string;
  signedAt: Date;
  signatureKind: string;
  signaturePath: string;
}

/** The consent row for (employee, version), or null if not yet signed. */
export async function getMyConsent(
  employeeId: string,
  version: string,
): Promise<MyConsent | null> {
  const [row] = await db
    .select({
      id: salaryPolicyConsents.id,
      policyVersion: salaryPolicyConsents.policyVersion,
      signedAt: salaryPolicyConsents.signedAt,
      signatureKind: salaryPolicyConsents.signatureKind,
      signaturePath: salaryPolicyConsents.signaturePath,
    })
    .from(salaryPolicyConsents)
    .where(
      and(
        eq(salaryPolicyConsents.employeeId, employeeId),
        eq(salaryPolicyConsents.policyVersion, version),
      ),
    )
    .limit(1);

  return row ?? null;
}

export interface ConsentStatusRow {
  employeeId: string;
  name: string;
  consented: boolean;
  signedAt: Date | null;
}

/**
 * For every active employee, whether they have consented to the given policy
 * version. Left-joins consents on (employee, version) so non-signers still
 * appear. For the admin overview.
 */
export async function listConsentStatus(version: string): Promise<ConsentStatusRow[]> {
  const rows = await db
    .select({
      employeeId: employees.id,
      name: employees.name,
      signedAt: salaryPolicyConsents.signedAt,
    })
    .from(employees)
    .leftJoin(
      salaryPolicyConsents,
      and(
        eq(salaryPolicyConsents.employeeId, employees.id),
        eq(salaryPolicyConsents.policyVersion, version),
      ),
    )
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  return rows.map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    consented: r.signedAt != null,
    signedAt: r.signedAt ?? null,
  }));
}
