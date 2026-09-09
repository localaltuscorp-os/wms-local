"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { LEAVE_KIND_LABELS, LEAVE_KINDS, type LeaveStatus } from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import {
  LEAVE_INPUT_CLASS,
  LEAVE_INPUT_RING,
  LeaveStatusChip,
  prettyDate,
} from "./leave-ui";
import { ReviewLeavePanel, type ReviewBalance } from "./review-leave-panel";

/** The four states the segmented control offers, in queue order. */
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export interface LeaveRequestsClientProps {
  rows: LeaveRow[];
  /** Paid-balance facts keyed by employee id, for the review panel. */
  balances: Record<string, ReviewBalance>;
  employeeOptions: { id: string; name: string }[];
  /** Departments to offer. Empty for a manager — see LeaveRequestFilters. */
  departmentOptions: { id: string; name: string }[];
  /** Current filter values, mirrored from the URL by the server page. */
  filters: {
    status: string;
    employeeId: string;
    departmentId: string;
    kind: string;
    from: string;
    to: string;
  };
}

/**
 * Attendance › Leave Requests (spec §4) — the reviewer's queue.
 *
 * Filters live in the URL rather than in component state, so a manager can send
 * "here are the three pending ones for Rahul" as a link, and so the server does
 * the narrowing (the query is scoped to the reviewer's downline either way; the
 * filters just narrow it further). Every change goes through one
 * `setParam` → `router.replace` path, wrapped in a transition so the table dims
 * instead of flashing.
 *
 * ONE action per row. A pending row gets "Review", which opens the panel; a
 * decided row gets nothing, because there is nothing left to do to it. This is
 * the whole reason the panel exists — the alternative was Approve and Reject
 * buttons on every row, which puts the two most consequential actions in the
 * feature one mis-click apart in a dense table.
 */
export function LeaveRequestsClient({
  rows,
  balances,
  employeeOptions,
  departmentOptions,
  filters,
}: LeaveRequestsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingNav, startTransition] = useTransition();
  const [reviewId, setReviewId] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      // Only an EMPTY value drops the param. "all" is written explicitly,
      // because the queue's no-param default is `pending` — dropping it would
      // make the All tab bounce straight back to Pending on the next render.
      if (!value) next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      startTransition(() => {
        router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  const reviewRow = rows.find((r) => r.id === reviewId) ?? null;

  return (
    <>
      {/* ── Filters ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg p-0.5"
          role="tablist"
          aria-label="Filter by status"
          style={{
            background: "var(--color-surface-soft)",
            border: "1px solid var(--color-hairline)",
          }}
        >
          {STATUS_TABS.map((t) => {
            const active = filters.status === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParam("status", t.value)}
                className="rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors"
                style={
                  active
                    ? {
                        background: "var(--color-surface-card)",
                        color: "var(--color-ink-strong)",
                        boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
                      }
                    : { background: "transparent", color: "var(--color-ink-subtle)" }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <select
          aria-label="Filter by employee"
          value={filters.employeeId}
          onChange={(e) => setParam("employee", e.target.value)}
          className={`${LEAVE_INPUT_CLASS} w-auto min-w-[150px] py-1.5`}
          style={LEAVE_INPUT_RING}
        >
          <option value="">All employees</option>
          {employeeOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        {departmentOptions.length > 0 && (
          <select
            aria-label="Filter by department"
            value={filters.departmentId}
            onChange={(e) => setParam("dept", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} w-auto min-w-[140px] py-1.5`}
            style={LEAVE_INPUT_RING}
          >
            <option value="">All departments</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Filter by leave type"
          value={filters.kind}
          onChange={(e) => setParam("kind", e.target.value)}
          className={`${LEAVE_INPUT_CLASS} w-auto py-1.5`}
          style={LEAVE_INPUT_RING}
        >
          <option value="">All types</option>
          {LEAVE_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEAVE_KIND_LABELS[k]}
            </option>
          ))}
        </select>

        <div className="inline-flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From date"
            value={filters.from}
            onChange={(e) => setParam("from", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} w-auto py-1.5 tabular-nums`}
            style={LEAVE_INPUT_RING}
          />
          <span className="text-[12px] text-ink-subtle">to</span>
          <input
            type="date"
            aria-label="To date"
            value={filters.to}
            onChange={(e) => setParam("to", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} w-auto py-1.5 tabular-nums`}
            style={LEAVE_INPUT_RING}
          />
        </div>
      </div>

      {/* ── Queue ── */}
      {rows.length === 0 ? (
        <div
          className="rounded-[14px] px-5 py-10 text-center text-[13.5px] text-ink-subtle"
          style={{ border: "1px dashed var(--color-hairline)" }}
        >
          No leave requests match these filters.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-[14px] bg-surface-card transition-opacity"
          style={{
            border: "1px solid var(--color-hairline)",
            opacity: pendingNav ? 0.6 : 1,
          }}
        >
          <table className="min-w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-subtle">
                <Th>Employee</Th>
                <Th>Leave Type</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="right">Days</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--color-hairline)" }}>
                  <Td className="whitespace-nowrap font-medium text-ink-strong">
                    {r.employeeName}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-soft">
                    {LEAVE_KIND_LABELS[r.kind]}
                    {r.categoryName && (
                      <span className="mt-0.5 block text-[12px] text-ink-subtle">
                        {r.categoryName}
                      </span>
                    )}
                  </Td>
                  {/* The half is marked on the date it belongs to: leaving at
                      lunch and returning after lunch are opposite halves, and a
                      shared marker could not tell the reviewer which. */}
                  <Td className="whitespace-nowrap tabular-nums text-ink-soft">
                    {prettyDate(r.startDate)}
                    {r.startHalfDay && (
                      <span className="ml-1 text-[12px] text-ink-subtle">2nd half</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-ink-soft">
                    {prettyDate(r.endDate)}
                    {r.endHalfDay && (
                      <span className="ml-1 text-[12px] text-ink-subtle">1st half</span>
                    )}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink-soft">
                    {r.days}
                  </Td>
                  <Td className="max-w-[260px] truncate text-ink-soft" title={r.reason ?? ""}>
                    {r.reason || <span className="text-ink-subtle">-</span>}
                  </Td>
                  <Td>
                    <LeaveStatusChip status={r.status as LeaveStatus} />
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setReviewId(r.id)}
                      className="wg-btn whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink-strong"
                      style={{ border: "1px solid var(--color-hairline)" }}
                    >
                      {r.status === "pending" ? "Review" : "View"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReviewLeavePanel
        key={reviewRow?.id ?? "none"}
        row={reviewRow}
        balance={reviewRow ? (balances[reviewRow.employeeId] ?? null) : null}
        onClose={() => setReviewId(null)}
      />
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`px-4 py-2.5 align-middle ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
