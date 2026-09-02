"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAuth } from "@/lib/firebase/client";

/**
 * Browser-side Supabase client.
 * Hands a fresh Firebase ID token to PostgREST/Realtime on every request so
 * Supabase Third-Party Auth can evaluate RLS policies against the Firebase JWT.
 *
 * Singleton — safe because the accessToken callback is invoked fresh per request,
 * and the Firebase SDK auto-refreshes tokens internally.
 */
let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => {
        const user = getFirebaseAuth().currentUser;
        if (!user) return null;
        return await user.getIdToken();
      },
    },
  );
  return cachedClient;
}
