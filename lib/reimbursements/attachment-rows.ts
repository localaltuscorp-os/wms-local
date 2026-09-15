import "server-only";
import type { moduleSubmissionAttachments } from "@/db/schema";
import {
  CLAIM_MAX_FILES,
  checkClaimFile,
  employeeIdFromClaimPath,
  resolvedMimeFor,
} from "./attachment-rules";

/**
 * Vet a batch of uploaded object refs and turn them into insertable rows.
 *
 * ── WHY THIS IS NOT IN THE ACTIONS FILE ────────────────────────────────────
 * It started there and had to move. EVERY export from a `"use server"` module
 * becomes a callable endpoint, and this function takes the CALLER'S IDENTITY as
 * a parameter — so as a server action a client could invoke it with any `me` it
 * liked. It only builds rows and writes nothing, so nothing leaked, but a
 * publicly reachable function whose ownership check is an argument is a trap
 * for the next person to touch it.
 *
 * Living in `lib/` with `server-only` means it is an ordinary function: callable
 * from a Server Action or a route, never from a browser.
 *
 * Two callers, deliberately: `submitModule` records a new claim's documents
 * inside the transaction that creates it, and `attachClaimFiles` adds to an
 * existing one. Both must apply the identical checks.
 */

/** A reference to an object the browser has already uploaded. */
export interface ClaimUploadRef {
  path: string;
  fileName: string;
  mime: string | null;
  size: number;
}

export type ClaimRowsResult =
  | { ok: true; rows: (typeof moduleSubmissionAttachments.$inferInsert)[] }
  | { ok: false; error: string };

export function buildClaimAttachmentRows(
  refs: readonly ClaimUploadRef[],
  /** The AUTHENTICATED caller. Resolved by the action, never by the client. */
  me: { id: string },
  submissionId: string,
): ClaimRowsResult {
  if (refs.length === 0) return { ok: true, rows: [] };
  if (refs.length > CLAIM_MAX_FILES) {
    return { ok: false, error: `Attach at most ${CLAIM_MAX_FILES} documents.` };
  }

  const rows: (typeof moduleSubmissionAttachments.$inferInsert)[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const path = String(ref?.path ?? "");
    const fileName = String(ref?.fileName ?? "");
    const size = Number(ref?.size ?? 0);

    const check = checkClaimFile({ name: fileName, size });
    if (!check.ok) return check;

    // OWNERSHIP. The path was minted server-side for this employee, but it
    // travelled through the browser to get here, so it is re-parsed rather than
    // trusted. This is what stops a crafted submit from stapling another
    // employee's object onto its own claim — the id in the path must be the
    // caller's own. See employeeIdFromClaimPath for the shapes it refuses.
    if (employeeIdFromClaimPath(path) !== me.id) {
      return { ok: false, error: "Invalid attachment." };
    }
    if (seen.has(path)) continue; // a double-submit must not duplicate a row
    seen.add(path);

    rows.push({
      submissionId,
      storagePath: path,
      // The uploader's own name, verbatim — this is the one place it survives,
      // since the object key is a uuid.
      fileName: fileName.slice(0, 300),
      // OUR resolved type, from the extension. `ref.mime` is browser-supplied
      // and is deliberately NOT recorded: it is what an inline viewer must
      // never trust.
      mime: resolvedMimeFor(fileName),
      sizeBytes: Math.round(size),
      uploadedById: me.id,
    });
  }

  return { ok: true, rows };
}
