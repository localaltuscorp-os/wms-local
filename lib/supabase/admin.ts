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
