import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. ONLY use inside Server Actions
 * that have already authenticated the caller (requireUser/requireAdmin).
 * Used for Storage operations (document uploads / signed download URLs) where
 * we gate access in app code rather than via storage RLS.
 */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** The private bucket backing the document library + task attachments. */
export const DOCUMENTS_BUCKET = "documents";

/** The private bucket backing /profile avatar uploads. Reads via signed URLs. */
export const AVATARS_BUCKET = "avatars";

/** Avatars signed-URL TTL: 7 days. The avatar URL is regenerated on profile read. */
export const AVATAR_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Turn a Supabase Storage error into something a user can act on.
 *
 * WHY THIS EXISTS: on 2026-09-04 this project's LEGACY API keys (the `anon` /
 * `service_role` JWTs) were disabled in the Supabase dashboard. Every storage
 * call now fails, and the raw message Storage returns is "signature
 * verification failed" — which surfaced to people uploading a file as
 * "Upload failed: signature verification failed". That reads as data corruption
 * or a broken file. It is neither: it is one setting, and no file the user
 * picked was ever at fault.
 *
 * The REST endpoint is the one that actually explains it ("Legacy API keys are
 * disabled ... Re-enable them in the Supabase dashboard, or use the new
 * publishable and secret API keys"), but Storage does not say that, so the
 * translation happens here.
 *
 * Deliberately NOT a retry or a fallback: there is no second place to put the
 * file, and pretending an upload succeeded would be worse than saying plainly
 * that it did not.
 */
export function storageErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("signature verification failed") || m.includes("legacy api keys are disabled")) {
    return "File storage is not accepting our credentials — the project's API keys need renewing. Nothing is wrong with your file. Tell the team; no upload will work until it's fixed.";
  }
  if (m.includes("bucket not found")) {
    return "The documents storage bucket is missing. Tell the team — this needs fixing in Supabase.";
  }
  if (m.includes("payload too large") || m.includes("entity too large")) {
    return "That file is too large for storage.";
  }
  return `Upload failed: ${raw}`;
}
