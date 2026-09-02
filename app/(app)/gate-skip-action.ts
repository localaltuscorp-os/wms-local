"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { istYmd } from "@/lib/weekly-goals/week";
import { SA_SKIP_COOKIE } from "@/lib/auth/gate-skip";

/**
 * Set the super-admin gate-skip cookie for today (super-admins only). The layout
 * re-verifies `isSuperAdmin` before honouring it, so this is safe to expose.
 */
export async function skipGatesForToday(): Promise<{ ok: boolean }> {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return { ok: false };
  (await cookies()).set(SA_SKIP_COOKIE, istYmd(new Date()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return { ok: true };
}
