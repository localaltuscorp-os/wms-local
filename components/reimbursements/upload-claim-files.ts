"use client";

import { getSupabaseClient } from "@/lib/supabase/browser";
import {
  createClaimUploadUrl,
  uploadClaimFileDirect,
  type ClaimUploadRef,
} from "@/app/(app)/reimbursements/attachment-actions";

/**
 * Upload a claim's documents and return the refs to record against it.
 *
 * ── THE BYTES DO NOT GO THROUGH THE APP SERVER ─────────────────────────────
 * For each file: ask the server for a signed upload target (it picks the path,
 * under this employee's own prefix), then PUT the file straight to Supabase
 * Storage. Only the resulting `{ path, fileName, size }` refs travel back
 * through a Server Action, so the action body stays a few hundred bytes however
 * large the receipt is — which is what makes a 12 MB photo of a bill work on a
 * platform whose request bodies are capped in single-digit megabytes.
 *
 * Same shape as components/dossier/onboarding-form.tsx, which already uploads
 * scans this way; this is that pattern, not a second one.
 *
 * ── DUMMY_MODE ─────────────────────────────────────────────────────────────
 * With no Supabase project there is nothing to sign, so the server answers
 * `direct: false` and the file is posted through `uploadClaimFileDirect`
 * instead. That branch is refused outside DUMMY_MODE server-side, so it cannot
 * become the production path by accident.
 *
 * ── FAILURE ────────────────────────────────────────────────────────────────
 * Rejects with a message fit to show the user, on the FIRST failure. Files
 * already uploaded are left in storage unreferenced: harmless (nothing points
 * at them and nothing serves them) and much better than the alternative, which
 * is a claim recorded with only some of its evidence.
 */
export async function uploadClaimFiles(files: File[]): Promise<ClaimUploadRef[]> {
  if (files.length === 0) return [];

  const refs: ClaimUploadRef[] = [];
  for (const file of files) {
    const signed = await createClaimUploadUrl({
      fileName: file.name,
      mime: file.type || null,
      size: file.size,
    });
    if (!signed.ok) throw new Error(signed.error);

    if (signed.direct && signed.token) {
      const { error } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) throw new Error(`Couldn't upload “${file.name}”: ${error.message}`);
    } else {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("path", signed.path);
      const res = await uploadClaimFileDirect(fd);
      if (!res.ok) throw new Error(res.error);
    }

    refs.push({
      path: signed.path,
      fileName: file.name,
      mime: file.type || null,
      size: file.size,
    });
  }
  return refs;
}
