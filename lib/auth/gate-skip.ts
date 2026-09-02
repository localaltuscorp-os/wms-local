import "server-only";
import { cookies } from "next/headers";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { istYmd } from "@/lib/weekly-goals/week";

/**
 * Super-admin gate skip. A super-admin can dismiss the day's gate chain (weekly
 * planning, daily checklist, manager gates, DCC) with a "Skip for today" button.
 * The skip is a day-scoped cookie that ONLY takes effect for a super-admin — the
 * layout re-checks `isSuperAdmin` server-side, so a normal user forging the
 * cookie gains nothing.
 */
export const SA_SKIP_COOKIE = "sa_gate_skip";

export async function gateSkipActive(me: { email: string }, now: Date = new Date()): Promise<boolean> {
  if (!isSuperAdmin(me.email)) return false;
  try {
    const c = (await cookies()).get(SA_SKIP_COOKIE)?.value;
    return c === istYmd(now);
  } catch {
    return false;
  }
}
