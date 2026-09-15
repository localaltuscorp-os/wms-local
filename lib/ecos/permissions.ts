import "server-only";
import type { Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";

/**
 * BROADCASTS — who may do what.
 *
 * The module used to be HR-staff-only end to end (`isHrStaff` on every action,
 * query and page). That was the wrong shape for what broadcasts are actually
 * for: the request that opened this up was explicitly "everyone should be able
 * to send broadcasts to everyone, a group, a few selected people, or one
 * person" — the motivating example being an engineer taking HR Records down for
 * two hours and needing to say so, right now, without going through HR.
 *
 * So there are exactly TWO tiers here, and only two:
 *
 *   SENDER   — every active employee. Compose, target anyone, publish,
 *              schedule, duplicate, archive THEIR OWN, and read the full
 *              analytics for the broadcasts they sent.
 *
 *   ADMIN    — super-admins + the HR department. Everything a sender can do,
 *              plus: see and manage EVERY broadcast in the org, the org-wide
 *              analytics dashboard, and the one genuinely dangerous control —
 *              the app-lock gate (`requireLock`), which freezes the entire app
 *              for every recipient until they acknowledge. That stays admin-only
 *              on purpose: it is the single control in this module that one
 *              mistaken click can use to lock the whole company out of the app,
 *              and nothing in the brief asked for it to be widened.
 */

/** Every active employee may send a broadcast. */
export function canSendBroadcast(_me: Employee): boolean {
  return true;
}

/**
 * Broadcast ADMIN — super-admins + HR. Sees every broadcast in the org, not
 * just their own, and owns the org-wide dashboard.
 */
export async function isBroadcastAdmin(me: Employee): Promise<boolean> {
  if (isSuperAdmin(me.email)) return true;
  return isHrStaff(me);
}

/**
 * May this person manage (pause / archive / resend / re-target) THIS broadcast?
 * Its author always can; admins can manage anyone's.
 */
export async function canManageBroadcast(
  me: Employee,
  authorId: string | null,
): Promise<boolean> {
  if (authorId && authorId === me.id) return true;
  return isBroadcastAdmin(me);
}

/**
 * May this person raise the full-screen app-lock gate? Admins only — see the
 * module note above.
 */
export async function canUseAppLock(me: Employee): Promise<boolean> {
  return isBroadcastAdmin(me);
}
