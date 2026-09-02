import { redirect } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { LEAVE_KINDS, LEAVE_STATUS, type LeaveKind, type LeaveStatus } from "@/db/enums";
import {
  getLeaveBalance,
  leaveReviewScopeFor,
  listLeaveRequestsForReview,
  listReviewableEmployees,
} from "@/lib/queries/leave";
import { listActiveDepartments } from "@/lib/queries/departments";
import { LeaveRequestsClient } from "@/components/attendance/leave/leave-requests-client";
import type { ReviewBalance } from "@/components/attendance/leave/review-leave-panel";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** First value of a possibly-repeated query param. */
function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ATTENDANCE › LEAVE REQUESTS (spec §4) — where "Review Requests →" lands.
 *
 * Access is the review scope itself, not a role flag: an admin sees everyone, a
 * manager sees their downline, and anyone who manages nobody is sent back to
 * their own leave page rather than shown an empty queue they will never have a
 * reason to visit.
 *
 * Balances are loaded only for the employees who actually appear in the queue,
 * and only where paid leave is in play — the review panel needs "3 of 4 left"
 * for a paid request, and there is no point costing a query per row for unpaid
 * ones where the number means nothing.
 */
export default async function LeaveRequestsPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const scope = await leaveReviewScopeFor(me);
  if (!scope.canReview) redirect("/attendance/leave" as Route);

  const sp = await searchParams;
  const rawStatus = one(sp.status) || "pending";
  const status: LeaveStatus | "all" = (LEAVE_STATUS as readonly string[]).includes(
    rawStatus,
  )
    ? (rawStatus as LeaveStatus)
    : "all";
  const rawKind = one(sp.kind);
  const kind: LeaveKind | undefined = (LEAVE_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as LeaveKind)
    : undefined;
  const employeeId = one(sp.employee) || undefined;
  // Department is an ADMIN cut only: a manager's queue is already one team.
  const departmentId = scope.all ? one(sp.dept) || undefined : undefined;
  const from = DATE_RE.test(one(sp.from)) ? one(sp.from) : undefined;
  const to = DATE_RE.test(one(sp.to)) ? one(sp.to) : undefined;

  const [rows, employeeOptions, departmentOptions] = await Promise.all([
    listLeaveRequestsForReview(scope, {
      status,
      employeeId,
      departmentId,
      kind,
      from,
      to,
    }),
    listReviewableEmployees(scope),
    scope.all
      ? listActiveDepartments().then((ds) => ds.map((d) => ({ id: d.id, name: d.name })))
      : Promise.resolve([]),
  ]);

  const today = localDateString(me.timezone || "Asia/Kolkata");
  const paidRequesterIds = [
    ...new Set(rows.filter((r) => r.kind === "paid").map((r) => r.employeeId)),
  ];
  const balanceEntries = await Promise.all(
    paidRequesterIds.map(async (id) => {
      const b = await getLeaveBalance(id, today);
      return [
        id,
        {
          allowance: b.allowance,
          remaining: b.remaining,
          used: b.used,
          cycleLabel: b.cycleLabel,
          paidEligible: b.paidEligible,
        } satisfies ReviewBalance,
      ] as const;
    }),
  );
  const balances: Record<string, ReviewBalance> = Object.fromEntries(balanceEntries);

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell>
        <PageCommandBar
          title="Leave Requests"
          hint={
            scope.all
              ? "All employees"
              : `${scope.ids.length} ${scope.ids.length === 1 ? "person" : "people"} you manage`
          }
          actions={
            pendingCount > 0 ? (
              <span className="text-[13px] font-semibold text-ink-soft">
                {pendingCount} awaiting review
              </span>
            ) : null
          }
        />

        <LeaveRequestsClient
          rows={rows}
          balances={balances}
          employeeOptions={employeeOptions}
          departmentOptions={departmentOptions}
          filters={{
            status: status,
            employeeId: employeeId ?? "",
            departmentId: departmentId ?? "",
            kind: kind ?? "",
            from: from ?? "",
            to: to ?? "",
          }}
        />
      </PageShell>
    </>
  );
}
