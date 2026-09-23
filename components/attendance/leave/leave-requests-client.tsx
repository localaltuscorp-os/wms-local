"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { CheckCircle2, CircleX, ClipboardList, Clock3, RotateCcw, SlidersHorizontal } from "lucide-react";
import { LEAVE_KIND_LABELS, LEAVE_KINDS, type LeaveStatus } from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import {
  LEAVE_INPUT_CLASS,
  LEAVE_INPUT_RING,
  LeaveStatusChip,
  prettyDate,
} from "./leave-ui";
import { ReviewLeavePanel, type ReviewBalance } from "./review-leave-panel";
import { CompactSelect } from "@/components/ui/compact-select";

export interface LeaveRequestsClientProps {
  rows: LeaveRow[];
  /** Counts across the current non-status filters, for the review queue cards. */
  statusCounts: Record<"all" | "pending" | "approved" | "rejected", number>;
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
  statusCounts,
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
  const hasExtraFilters = Boolean(
    filters.employeeId || filters.departmentId || filters.kind || filters.from || filters.to || filters.status !== "pending",
  );

  function resetFilters() {
    startTransition(() => {
      router.replace(pathname as Route, { scroll: false });
    });
  }

  const statusCards = [
    { value: "all", label: "All requests", count: statusCounts.all, Icon: ClipboardList },
    { value: "pending", label: "Awaiting review", count: statusCounts.pending, Icon: Clock3 },
    { value: "approved", label: "Approved", count: statusCounts.approved, Icon: CheckCircle2 },
    { value: "rejected", label: "Rejected", count: statusCounts.rejected, Icon: CircleX },
  ] as const;

  return (
    <>
      {/* ── Filters ── */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Leave request status summary">
        {statusCards.map((card) => {
          const active = filters.status === card.value;
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setParam("status", card.value)}
              aria-pressed={active}
              className="group relative overflow-hidden rounded-[16px] bg-surface-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_25px_-24px_rgba(15,23,42,0.65)]"
              style={{
                border: active
                  ? "1px solid var(--color-altus-red, #E10600)"
                  : "1px solid var(--color-hairline)",
                boxShadow: active ? "0 0 0 2px rgba(225,6,0,0.08)" : undefined,
              }}
            >
              <span
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg"
                style={{
                  background: active ? "#FEE2E2" : "var(--color-surface-soft)",
                  color: active ? "var(--color-altus-red-deep, #A80400)" : "var(--color-ink-soft)",
                }}
              >
                <card.Icon size={16} aria-hidden />
              </span>
              <p className="pr-10 text-[12px] font-semibold text-ink-subtle">{card.label}</p>
              <p className="mt-2 tabular-nums text-[28px] font-extrabold leading-none tracking-[-0.03em] text-ink-strong">
                {card.count}
              </p>
              <p className="mt-2 text-[12px] font-medium text-ink-subtle">
                {active ? "Current view" : "Open this queue"}
              </p>
            </button>
          );
        })}
      </section>

      <section
        className="mb-4 rounded-[16px] bg-surface-card p-3"
        style={{ border: "1px solid var(--color-hairline)" }}
        aria-label="Leave request filters"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
            <span className="grid size-7 place-items-center rounded-lg bg-surface-soft text-ink-strong">
              <SlidersHorizontal size={15} aria-hidden />
            </span>
            Filters
            <span className="font-medium text-ink-subtle">{rows.length} shown</span>
          </div>
          {hasExtraFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <RotateCcw size={13} aria-hidden />
              Reset filters
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
        <CompactSelect
          aria-label="Filter by employee"
          value={filters.employeeId}
          onChange={(value) => setParam("employee", value)}
          className={`${LEAVE_INPUT_CLASS} min-w-[180px] flex-1 py-1.5`}
          style={LEAVE_INPUT_RING}
          placeholder="All employees"
          options={employeeOptions.map((employee) => ({ value: employee.id, label: employee.name }))}
          matchTriggerWidth
        />

        {departmentOptions.length > 0 && (
          <select
            aria-label="Filter by Function"
            value={filters.departmentId}
            onChange={(e) => setParam("dept", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} min-w-[160px] flex-1 py-1.5`}
            style={LEAVE_INPUT_RING}
          >
            <option value="">All Functions</option>
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
          className={`${LEAVE_INPUT_CLASS} min-w-[150px] flex-1 py-1.5`}
          style={LEAVE_INPUT_RING}
        >
          <option value="">All types</option>
          {LEAVE_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEAVE_KIND_LABELS[k]}
            </option>
          ))}
        </select>

        <div className="flex min-w-[270px] flex-1 items-center gap-1.5">
          <input
            type="date"
            aria-label="From date"
            value={filters.from}
            onChange={(e) => setParam("from", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} min-w-0 py-1.5 tabular-nums`}
            style={LEAVE_INPUT_RING}
          />
          <span className="text-[12px] text-ink-subtle">to</span>
          <input
            type="date"
            aria-label="To date"
            value={filters.to}
            onChange={(e) => setParam("to", e.target.value)}
            className={`${LEAVE_INPUT_CLASS} min-w-0 py-1.5 tabular-nums`}
            style={LEAVE_INPUT_RING}
          />
        </div>
        </div>
      </section>

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
                    {r.reason || <span className="text-ink-subtle">—</span>}
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
