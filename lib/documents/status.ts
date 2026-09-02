import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentSignatures } from "@/db/schema";
import type { DocKind, SignatureStatus } from "@/lib/documents/signing";

/**
 * Documents · signature-status read layer for the HR admin lists (Letters +
 * Agreements). Returns the LATEST signature row's status per source document so
 * the list UIs can render a Pending / Verified / Signed pill + link to the
 * signed PDF.
 *
 * ⚠ Resilience: migration 0151 (document_signatures) may be UNAPPLIED in a given
 * environment. Every read here is wrapped so a missing table degrades to "no
 * signatures" (empty map) instead of throwing — the list pages must never 500
 * because signing hasn't been switched on yet. Masked Aadhaar is never touched
 * here; this layer only surfaces status + the archived-PDF path.
 */

export interface SignatureStatusLite {
  signatureId: string;
  status: SignatureStatus;
  signedPdfPath: string | null;
  signedAt: string | null;
}

/**
 * Latest signature (by created_at) for each of `docIds` within one docKind.
 * Documents with no signature row simply won't appear in the map.
 */
export async function signatureStatusMap(
  docKind: DocKind,
  docIds: string[],
): Promise<Map<string, SignatureStatusLite>> {
  const out = new Map<string, SignatureStatusLite>();
  const ids = Array.from(new Set(docIds.filter(Boolean)));
  if (ids.length === 0) return out;

  try {
    const rows = await db
      .select({
        id: documentSignatures.id,
        docId: documentSignatures.docId,
        status: documentSignatures.status,
        signedPdfPath: documentSignatures.signedPdfPath,
        signedAt: documentSignatures.signedAt,
      })
      .from(documentSignatures)
      .where(
        and(
          eq(documentSignatures.docKind, docKind),
          inArray(documentSignatures.docId, ids),
        ),
      )
      .orderBy(desc(documentSignatures.createdAt))
      .limit(2000);

    // rows are newest-first → the first row seen per docId wins.
    for (const r of rows) {
      if (out.has(r.docId)) continue;
      out.set(r.docId, {
        signatureId: r.id,
        status: r.status,
        signedPdfPath: r.signedPdfPath,
        signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      });
    }
  } catch {
    // Table not applied yet (or transient) → no signatures known.
    return new Map();
  }
  return out;
}
