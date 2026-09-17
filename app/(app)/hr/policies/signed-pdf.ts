import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures } from "@/db/schema";
import { POLICY_CARDS, isPolicyKey } from "@/lib/hr/policies/registry";

/**
 * The ARCHIVED signed-PDF paths for firm policies, the download half of signing.
 *
 * When an employee signs a policy, finalizeSignature() renders the policy with
 * their signature into a PDF and archives it to `document_signatures.signed_pdf_path`
 * (private `documents` bucket). Downloading "the policy with their signature"
 * means serving that archived file — it is the exact document they signed, never
 * a re-render that could drift from what they put their name to.
 */

export interface SignedPolicyPdf {
  key: string;
  title: string;
  signedPdfPath: string;
  signedAt: string | null;
}

/**
 * Every firm policy the employee has a SIGNED (and archived) PDF for, newest
 * first. A policy signed only on an older version still returns its archive —
 * the archive is the record of what they actually signed, which is the point.
 */
export async function listSignedPolicyPdfs(employeeId: string): Promise<SignedPolicyPdf[]> {
  const keys = POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key)).map(
    (c) => c.key,
  );
  if (keys.length === 0) return [];

  const rows = await db
    .select({
      typeKey: documentInstances.typeKey,
      signedPdfPath: documentSignatures.signedPdfPath,
      signedAt: documentSignatures.signedAt,
    })
    .from(documentInstances)
    .innerJoin(
      documentSignatures,
      and(
        eq(documentSignatures.docId, documentInstances.id),
        eq(documentSignatures.docKind, "letter"),
        eq(documentSignatures.status, "signed"),
      ),
    )
    .where(
      and(eq(documentInstances.employeeId, employeeId), inArray(documentInstances.typeKey, keys)),
    )
    .orderBy(desc(documentSignatures.signedAt));

  const titleByKey = new Map(POLICY_CARDS.map((c) => [c.key, c.title]));
  return rows
    .filter((r) => r.signedPdfPath)
    .map((r) => ({
      key: r.typeKey,
      title: titleByKey.get(r.typeKey) ?? r.typeKey,
      signedPdfPath: r.signedPdfPath!,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    }));
}

/** The signed-PDF path for ONE policy, or null when there is no signed archive. */
export async function getSignedPolicyPdfPath(employeeId: string, key: string): Promise<string | null> {
  const all = await listSignedPolicyPdfs(employeeId);
  return all.find((r) => r.key === key)?.signedPdfPath ?? null;
}
