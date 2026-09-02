import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for use inside Server Actions, Route Handlers,
 * and Server Components.
 *
 * Caller passes the verified Firebase ID token (extracted from the session
 * cookie via lib/auth helpers). The client forwards it to PostgREST/Realtime
 * via the accessToken callback so RLS policies can evaluate against the JWT.
 *
 * NOT cached — bound to per-request identity.
 */
export function getServerSupabase(idToken?: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => idToken ?? null,
    },
  );
}
