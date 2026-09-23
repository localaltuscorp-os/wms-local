"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { INCENTIVE_STATUS_LABELS, INCENTIVE_TYPE_LABELS, INCENTIVE_TYPES } from "@/db/enums";
import { INCENTIVE_DATE_KEY, incentiveDetailPairs } from "@/lib/incentive-fields";
import {
  requestIntroducerName,
  requestProductCodes,
  requestProspectName,
} from "@/lib/incentive/request-display";
import { defaultIncentiveAmount } from "@/lib/incentive-amount";
import { formatPct } from "@/lib/incentive/split";
import {
  availableDecisions,
  canResubmit,
  isContentReviewRequest,
  needsReview,
} from "@/lib/incentive/workflow";
import { INCENTIVE_REVIEWER_NAME } from "@/lib/auth/incentive-permissions";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatDMonY, formatInr } from "@/lib/format";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { IncentiveStatusPill } from "./incentive-status-pill";
import { IncentiveHistory, formatIncentiveDateTime } from "./incentive-history";
import { IncentiveDecisionPanel } from "./incentive-decision-panel";
import { IncentiveFormDialog } from "./incentive-form-dialog";
import { IncentiveBadge } from "./ui/badges";
import { IncentiveEmptyState } from "./ui/states";
import { toneFill, toneInk } from "./ui/tone";

/**
 * INCENTIVE REQUESTS — three views of one list.
 *
 *   · The REVIEWER (Manan Vasa): "Needs your review" first — every request
 *     Pending Approval, Due or Not Due — then everything else. Opening a request
 *     shows the whole submission, its links, its split and its history, and
 *     only then the decision panel.
 *   · ADMINS: everyone's requests, read-only. Admins used to have Approve and
 *     Reject here; deciding is now Manan's alone, and the server refuses anyone
 *     else regardless of what renders.
 *   · EMPLOYEES: their own requests. A Not Approved or Revision Requested one
 *     shows the reason, when it was decided, and Justify & Resubmit.
 *
 * ── CARDS BECAME ROWS (2026-09-16) ─────────────────────────────────────────
 * Every one of those three views is the same job — find the request you need
 * among many — and the card list gave it no search, no sort and no filter, at
 * about 150px per request. It is the shared `DataTable` now, with the request's
 * WHOLE expansion (submitted fields, links, split, history and, for the
 * reviewer, the decision panel) moved verbatim into the expanded row.
 *
 * Two things deliberately did NOT move into the expansion, because they are
 * what the employee has to act on and they must be visible without opening
 * anything: the resubmission callout with its reason, and its Justify &
 * Resubmit button. They render under the table as a standing band.
 */
export function IncentiveList({
  rows,
  isAdmin,
  canReview,
  me,
  employees,
  products,
  productCodes = {},
  shiftTypes = [],
  monthlyCtc,
  defaultShift,
  focusRequestId = null,
}: {
  rows: IncentiveRequestRow[];
  isAdmin: boolean;
  /** The signed-in user is the incentive reviewer. Presentation only — the
   *  decision action checks this again on the server. */
  canReview: boolean;
  me: { id: string; name: string };
  employees: EmployeeOption[];
  products: string[];
  /** NAME → short code from Admin → Products, for the Product Code column. */
  productCodes?: Record<string, string>;
  /** Active shift names (Admin → Shift Types) — the Sales Pitch Shift field. */
  shiftTypes?: string[];
  /** The viewer's own CTC ÷ 12, formatted — shown read-only on the form. */
  monthlyCtc?: string;
  /** The viewer's own shift name, offered as the Shift default. */
  defaultShift?: string | null;
  /** Opened from a notification: this request starts expanded and in view. */
  focusRequestId?: string | null;
}) {
  const showEmployee = isAdmin || canReview;

  /** Rows waiting on THIS person: the reviewer's queue, or my resubmissions. */
  const mine = React.useMemo(
    () => rows.filter((r) => r.employeeId === me.id && canResubmit(r.status)),
    [rows, me.id],
  );
  const queueCount = React.useMemo(
    () => (canReview ? rows.filter((r) => needsReview(r.status)).length : 0),
    [rows, canReview],
  );

  /**
   * THE REVIEWER'S QUEUE STILL COMES FIRST.
   *
   * It used to be a separate "Needs your review" section above "All other
   * requests". With one table it is the DEFAULT ORDER instead: waiting requests
   * on top, newest first within each group. Sorting a column replaces it, which
   * the two fixed sections never allowed.
   */
  const ordered = React.useMemo(() => {
    if (!canReview) return rows;
    return [...rows].sort((a, b) => {
      const qa = needsReview(a.status) ? 0 : 1;
      const qb = needsReview(b.status) ? 0 : 1;
      return qa - qb || b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [rows, canReview]);

  /**
   * PROSPECT · INTRODUCER · PRODUCT CODE, read from the request's own details.
   *
   * These three used to exist only inside the expanded row, which meant the
   * question a reader actually opens the list with — "who was this for, who
   * brought it in, and what did we sell" — cost a click per row. They are in
   * the table now, and the detail panel keeps the whole submission.
   *
   * Product Code is the SHORT form from the Product Master (PS, BSS, 2-Day);
   * a product the admin has not coded prints its name rather than a blank.
   */
  // The three lookups are shared with the salary slip's incentive statement
  // (lib/incentive/request-display.ts), so the table and the PDF read one
  // request the same way.
  const productCodesFor = (r: IncentiveRequestRow) => requestProductCodes(r, productCodes);

  const columns: DataTableColumn<IncentiveRequestRow>[] = [
    ...(showEmployee
      ? [
          {
            key: "employee",
            label: "Employee",
            sortValue: (r: IncentiveRequestRow) => r.employeeName.toLowerCase(),
            render: (r: IncentiveRequestRow) => (
              <span className="text-[13.5px] font-bold text-ink-strong">{r.employeeName}</span>
            ),
          },
        ]
      : []),
    {
      key: "type",
      label: "Incentive",
      sortValue: (r) => INCENTIVE_TYPE_LABELS[r.type] ?? r.type,
      render: (r) => {
        const happiness = r.type === "client_happiness" ? r.details?.happiness_type : undefined;
        return (
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold text-ink-strong">
              {INCENTIVE_TYPE_LABELS[r.type] ?? r.type}
            </span>
            {happiness && <span className="text-[12px] text-ink-subtle">{happiness}</span>}
          </span>
        );
      },
    },
    {
      key: "date",
      label: "Incentive date",
      sortValue: (r) => r.details?.[INCENTIVE_DATE_KEY] ?? r.createdAt.toISOString(),
      render: (r) => {
        const d = r.details?.[INCENTIVE_DATE_KEY];
        return (
          <span className="flex flex-col text-[13px] tabular-nums">
            <span>{d ? formatDMonY(d) : formatDate(r.createdAt)}</span>
            {!d && <span className="text-[11.5px] text-ink-subtle">filed</span>}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortValue: (r) => defaultIncentiveAmount(r.type, r.details ?? {}),
      render: (r) => {
        const amount = defaultIncentiveAmount(r.type, r.details ?? {});
        return amount > 0 ? (
          <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(amount)}</span>
        ) : (
          <span
            className="text-[12.5px] text-ink-subtle"
            title="The Incentive Master prices this scheme per batch, so a single request has no amount until Accounts records one."
          >
            Not set
          </span>
        );
      },
    },
    {
      key: "prospect",
      label: "Prospect",
      sortValue: (r) => requestProspectName(r),
      render: (r) => {
        const name = requestProspectName(r);
        const org = (r.details?.organisation ?? "").trim();
        return name ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink-strong">{name}</span>
            {org && <span className="truncate text-[12px] text-ink-subtle">{org}</span>}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-subtle">—</span>
        );
      },
    },
    {
      key: "introducer",
      label: "Introducer",
      sortValue: (r) => requestIntroducerName(r),
      render: (r) => {
        const name = requestIntroducerName(r);
        return name ? (
          <span className="text-[13px] font-semibold text-ink-strong">{name}</span>
        ) : (
          <span className="text-[12.5px] text-ink-subtle">—</span>
        );
      },
    },
    {
      key: "productCode",
      label: "Product Code",
      sortValue: (r) => productCodesFor(r).join(", "),
      render: (r) => {
        const codes = productCodesFor(r);
        if (codes.length === 0) return <span className="text-[12.5px] text-ink-subtle">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {codes.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={{
                  borderColor: "var(--color-hairline-strong)",
                  color: "var(--color-ink-strong)",
                }}
                title={c}
              >
                {c}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => INCENTIVE_STATUS_LABELS[r.status] ?? r.status,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <IncentiveStatusPill status={r.status} />
          {canReview && isContentReviewRequest(r.type, r.details) && (
            <IncentiveBadge tone="amber">Content review</IncentiveBadge>
          )}
        </span>
      ),
    },
    {
      key: "submission",
      label: "Submission",
      align: "right",
      sortValue: (r) => r.submissionNo,
      render: (r) => (
        <span className="flex flex-col items-end">
          <span className="text-[13px] font-semibold tabular-nums text-ink-soft">#{r.submissionNo}</span>
          {r.resubmittedAt && (
            <span className="text-[11.5px] text-ink-subtle">re-sent {formatDate(r.resubmittedAt)}</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-review-queue={canReview ? "" : undefined}>
      {/* The employee's rejection / revision experience — ABOVE the table and
          never behind a disclosure, because it is the thing they must act on. */}
      {mine.map((row) => (
        <ResubmitCallout
          key={row.id}
          row={row}
          me={me}
          employees={employees}
          products={products}
          shiftTypes={shiftTypes}
          monthlyCtc={monthlyCtc}
          defaultShift={defaultShift}
        />
      ))}

      {canReview && (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
          <Inbox size={15} strokeWidth={2.3} aria-hidden />
          {queueCount === 0
            ? "Nothing is waiting for your review."
            : `${queueCount} ${queueCount === 1 ? "request is" : "requests are"} waiting for your review — they sort to the top.`}
        </p>
      )}

      <DataTable
        rows={ordered}
        columns={columns}
        getRowKey={(r) => r.id}
        searchText={(r) =>
          [
            r.employeeName,
            INCENTIVE_TYPE_LABELS[r.type] ?? r.type,
            INCENTIVE_STATUS_LABELS[r.status] ?? r.status,
            ...Object.values(r.details ?? {}),
          ]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Local search — employee, type or detail"
        /* For the reviewer the rows arrive queue-first (see `ordered`), so no
           initial sort is imposed — clicking a header still takes over. */
        initialSort={canReview ? undefined : { key: "date", dir: "desc" }}
        stickyFirstColumn
        dense
        pageSize={25}
        initiallyExpandedKeys={focusRequestId ? [focusRequestId] : undefined}
        filters={[
          {
            label: "Status",
            options: Object.entries(INCENTIVE_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
            match: (r, v) => r.status === v,
          },
          {
            label: "Type",
            options: INCENTIVE_TYPES.map((t) => ({ value: t, label: INCENTIVE_TYPE_LABELS[t] })),
            match: (r, v) => r.type === v,
          },
          ...(showEmployee
            ? [
                {
                  label: "Scope",
                  options: [
                    { value: "mine", label: "Mine" },
                    ...(canReview ? [{ value: "queue", label: "Needs my review" }] : []),
                  ],
                  match: (r: IncentiveRequestRow, v: string) =>
                    v === "mine" ? r.employeeId === me.id : needsReview(r.status),
                },
              ]
            : []),
        ]}
        renderRowDetail={(r) => (
          <RequestDetail row={r} canReview={canReview} isOwner={r.employeeId === me.id} />
        )}
        emptyState={
          <IncentiveEmptyState
            icon={Inbox}
            title="No incentive requests yet"
            body='File the first one with "New request" in the bar above — the form adapts to the incentive you pick.'
          />
        }
      />
    </div>
  );
}

/**
 * The expanded row — the card's whole contents, unchanged: every submitted
 * field with links live, the amount, the split, the full history, and the
 * decision panel for the one person who may decide.
 */
function RequestDetail({
  row,
  canReview,
  isOwner,
}: {
  row: IncentiveRequestRow;
  canReview: boolean;
  isOwner: boolean;
}) {
  const pairs = incentiveDetailPairs(row.type, row.details);
  const decidable = canReview && availableDecisions(row.type, row.details, row.status).length > 0;
  const amount = defaultIncentiveAmount(row.type, row.details ?? {});

  return (
    <div className="space-y-4" data-request={row.id} data-status={row.status}>
      {row.decidedAt && row.decidedByName && (
        <p className="text-[12.5px] text-ink-subtle">
          {INCENTIVE_STATUS_LABELS[row.status] ?? row.status} by {row.decidedByName} ·{" "}
          {formatIncentiveDateTime(row.decidedAt)}
        </p>
      )}

      {/* A reason on a request that is NOT waiting on the employee (Reversed,
          or a note left with any other decision) is still theirs to read. */}
      {row.decisionNote && !canResubmit(row.status) && (isOwner || canReview) && (
        <div className="rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            {row.status === "reversed"
              ? "Negative payable adjustment — reason"
              : "Decision note"}
          </span>
          <p className="whitespace-pre-wrap break-words text-[13.5px] text-ink-strong">
            {row.decisionNote}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 max-md:grid-cols-1">
        {pairs.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-ink-strong">
              {isLink(value) ? (
                <a
                  href={value.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-altus-red underline-offset-2 hover:underline"
                >
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
        {amount > 0 && (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Amount</dt>
            <dd className="mt-0.5 text-[13.5px] tabular-nums text-ink-strong">{formatInr(amount)}</dd>
          </div>
        )}
        {row.split && row.split.length > 0 && (
          <div className="col-span-full">
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Split</dt>
            <dd className="mt-0.5 break-words text-[13.5px] text-ink-strong">
              {row.split.map((s) => `${s.name} ${formatPct(s.pct)}%`).join(" · ")}
            </dd>
          </div>
        )}
      </dl>

      <div className="border-t pt-3" style={{ borderColor: "var(--color-hairline)" }}>
        <IncentiveHistory
          key={`${row.id}:${row.submissionNo}:${row.status}`}
          requestId={row.id}
          currentSubmissionNo={row.submissionNo}
          currentStatus={row.status}
        />
      </div>

      {decidable && <IncentiveDecisionPanel key={`${row.id}:${row.status}`} row={row} />}
    </div>
  );
}

/** Not Approved / Revision Requested, and it is mine to fix. */
function ResubmitCallout({
  row,
  me,
  employees,
  shiftTypes = [],
  monthlyCtc,
  defaultShift,
  products,
}: {
  row: IncentiveRequestRow;
  me: { id: string; name: string };
  employees: EmployeeOption[];
  products: string[];
  shiftTypes?: string[];
  monthlyCtc?: string;
  defaultShift?: string | null;
}) {
  const rejected = row.status === "rejected";
  return (
    <div
      className="rounded-2xl px-4 py-3"
      data-resubmit-callout
      style={{
        background: toneFill(rejected ? "red" : "amber", 7),
        border: `1px solid ${toneFill(rejected ? "red" : "amber", 30)}`,
      }}
    >
      <p className="text-[13.5px] font-bold" style={{ color: toneInk(rejected ? "red" : "amber") }}>
        {rejected
          ? `${INCENTIVE_REVIEWER_NAME} did not approve your ${INCENTIVE_TYPE_LABELS[row.type] ?? row.type}.`
          : `${INCENTIVE_REVIEWER_NAME} asked for your ${INCENTIVE_TYPE_LABELS[row.type] ?? row.type} to be revised.`}
      </p>
      {row.decisionNote && (
        <div className="mt-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            {rejected ? "Reason" : "Revision note"}
          </span>
          <p className="whitespace-pre-wrap break-words text-[13.5px] text-ink-strong">
            {row.decisionNote}
          </p>
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-subtle">
          Decided {formatIncentiveDateTime(row.decidedAt)}. Your submission is kept — resubmitting adds
          a new one.
        </span>
        <IncentiveFormDialog
          products={products}
          employees={employees}
          shiftTypes={shiftTypes}
          monthlyCtc={monthlyCtc}
          defaultShift={defaultShift}
          me={me}
          resubmit={{
            id: row.id,
            type: row.type,
            details: row.details ?? {},
            split: row.split,
            status: row.status,
            reason: row.decisionNote,
            decidedAt: row.decidedAt,
            decidedByName: row.decidedByName,
            submissionNo: row.submissionNo,
          }}
        />
      </div>
    </div>
  );
}

function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v.trim());
}
