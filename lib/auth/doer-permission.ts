import "server-only";
import { isManagerWithReports } from "@/lib/manager-gates";

/**
 * WHO MAY CHANGE A TASK'S DOER (Sir).
 *
 * Reassigning work is an allocation decision, so it is deliberately narrower
 * than "any admin":
 *   · every MANAGER — anyone with at least one active direct report, which is
 *     the same definition every other manager gate in this app uses
 *     (`isManagerWithReports`), so "manager" cannot mean two different things
 *     in two places;
 *   · Manan Vasa and Om Jadhav by name.
 *
 * Named people are matched on EMAIL rather than employee id: ids differ between
 * the production and any restored database, and a stale uuid here would fail
 * open-ended and silently — the person would just find the control missing with
 * no error to explain why. Emails are stable and readable.
 *
 * Note that plain `isAdmin` does NOT grant this. An admin who manages nobody
 * and is not one of the two named people cannot reassign a doer, which is the
 * point of the rule.
 */
export const DOER_EDITOR_EMAILS = [
  "manan@unleashed.in",
  "omjadhav.altuscorp@gmail.com",
] as const;

/** Pure half — the by-name allowance. Safe to call anywhere, no I/O. */
export function isNamedDoerEditor(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (DOER_EDITOR_EMAILS as readonly string[]).includes(e);
}

/**
 * The real check. Async because the manager leg needs the org chart.
 *
 * Call this in every server action that writes `tasks.doer_id` — hiding the
 * control in the table is presentation, not authorization, and the actions are
 * reachable directly. The named-editor test runs FIRST so the two people who
 * always qualify never pay for a database round-trip.
 */
export async function canChangeDoerFor(me: {
  id: string;
  email: string | null | undefined;
}): Promise<boolean> {
  if (isNamedDoerEditor(me.email)) return true;
  return isManagerWithReports(me.id).catch(() => false);
}
