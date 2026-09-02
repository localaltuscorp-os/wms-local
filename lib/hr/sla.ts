import { HR_TICKET_SLA, type HrTicketPriority } from "@/db/enums";

/**
 * SLA stamping (design brief §Priority+SLA): due-dates are STAMPED onto the
 * ticket at create / priority-change time from HR_TICKET_SLA. ONE breach cron
 * (phase 2) later compares now() vs the stamps — there is no engine.
 *
 * Business days = IST Mon–Sat (Sunday is the only weekly off). First-response
 * uses raw clock hours; resolution counts business days forward.
 */

/** Is this date a business day in IST (Mon–Sat)? Sunday (getUTCDay 0 in IST). */
function isBusinessDayIST(d: Date): boolean {
  // Shift to IST (UTC+5:30) then read the weekday.
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCDay() !== 0; // 0 = Sunday
}

/** Add N business days (Mon–Sat) to `from`, preserving the time-of-day. */
function addBusinessDays(from: Date, days: number): Date {
  let remaining = Math.max(0, Math.ceil(days));
  const cur = new Date(from.getTime());
  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (isBusinessDayIST(cur)) remaining -= 1;
  }
  return cur;
}

export interface SlaStamps {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
}

/** Compute the two SLA due-dates for a priority, from `from` (default now). */
export function computeSlaStamps(
  priority: HrTicketPriority,
  from: Date = new Date(),
): SlaStamps {
  const policy = HR_TICKET_SLA[priority];
  const firstResponseDueAt = new Date(
    from.getTime() + policy.firstResponseHours * 60 * 60 * 1000,
  );
  const resolutionDueAt = addBusinessDays(from, policy.resolutionBusinessDays);
  return { firstResponseDueAt, resolutionDueAt };
}
