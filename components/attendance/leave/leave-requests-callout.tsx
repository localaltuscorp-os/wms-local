import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

/**
 * The Employees-module leave notice (spec §3).
 *
 * Deliberately a single low strip, not a card with a KPI in it: the Employees
 * page is a roster, and leave is a queue that happens to be waiting elsewhere.
 * One sentence of what, one link to where.
 *
 * It renders NOTHING when nothing is pending — an "0 requests" placeholder is
 * permanent furniture for a state that is true most of the time, and the whole
 * point of the strip is that its presence is the signal.
 */
export function LeaveRequestsCallout({
  requests,
  employees,
}: {
  requests: number;
  employees: number;
}) {
  if (requests <= 0) return null;

  const who =
    employees === 1
      ? "1 employee has requested leave."
      : `${employees} employees have requested leave.`;

  return (
    <section
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] bg-surface-card px-4 py-3"
      style={{ border: "1px solid var(--color-hairline)" }}
      aria-label="Pending leave requests"
    >
      <span
        aria-hidden
        className="size-[7px] shrink-0 rounded-full"
        style={{ background: "#D97706" }}
      />
      <span className="text-[13.5px] font-semibold text-ink-strong">
        Leave Requests
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-ink-soft">
        {who}
        {requests !== employees && (
          <span className="text-ink-subtle">
            {" "}
            ({requests} requests)
          </span>
        )}
      </span>
      <Link
        href={"/attendance/leave/requests" as Route}
        className="wg-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-strong transition-colors hover:text-[var(--color-altus-red-deep,#A80400)]"
        style={{ border: "1px solid var(--color-hairline)" }}
      >
        Review Requests
        <ArrowRight size={13} strokeWidth={2.6} />
      </Link>
    </section>
  );
}
