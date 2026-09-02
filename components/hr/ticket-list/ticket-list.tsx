import Link from "next/link";
import type { Route } from "next";
import { Lock } from "lucide-react";
import {
  HR_TICKET_CATEGORY_LABELS,
  HR_TICKET_STATUS_LABELS,
  HR_TICKET_STATUS_EMPLOYEE_LABELS,
  type HrTicketStatus,
} from "@/db/enums";
import { STATUS_TONE, PRIORITY_TONE, CATEGORY_GLYPH, relTime } from "@/lib/hr/ticket-ui";
import type { TicketListRow } from "@/lib/queries/hr-support";

function StatusBadge({ status, employeeView }: { status: HrTicketStatus; employeeView: boolean }) {
  const tone = STATUS_TONE[status];
  const label = employeeView ? HR_TICKET_STATUS_EMPLOYEE_LABELS[status] : HR_TICKET_STATUS_LABELS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
      {label}
    </span>
  );
}

/**
 * Presentational ticket list. `handlerView` = HR queue (shows requester +
 * assignee + priority); otherwise the employee "my requests" list.
 */
export function TicketList({
  rows,
  handlerView,
  empty,
}: {
  rows: TicketListRow[];
  handlerView: boolean;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-card px-6 py-12 text-center text-[14px] font-medium text-ink-muted">
        {empty ?? "Nothing here yet."}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const prio = PRIORITY_TONE[t.priority];
        return (
          <li key={t.id}>
            <Link
              href={`/support/${t.id}` as Route}
              className="group flex items-center gap-3.5 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 transition hover:border-[var(--color-altus-red)] hover:shadow-sm"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[16px]"
                style={{ background: "var(--color-surface-subtle, #f6f6f7)" }}
                aria-hidden
              >
                {t.confidential ? <Lock size={15} className="text-[var(--color-altus-red)]" /> : CATEGORY_GLYPH[t.category]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[12px] font-bold text-ink-muted">#{t.ticketNo}</span>
                  <span className="truncate text-[14.5px] font-semibold text-ink-strong">
                    {t.confidential && handlerView ? "Confidential grievance" : t.subject}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-muted">
                  <span>{HR_TICKET_CATEGORY_LABELS[t.category]}</span>
                  {handlerView && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{t.requesterName ?? "—"}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>{relTime(t.updatedAt)}</span>
                  {t.source === "query" && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-semibold text-ink-muted">Ask HR</span>
                    </>
                  )}
                </div>
              </div>
              {handlerView && (
                <span className="hidden shrink-0 text-[11.5px] font-bold sm:inline" style={{ color: prio.fg }}>
                  {prio.label}
                </span>
              )}
              {handlerView && t.assigneeName && (
                <span className="hidden max-w-[120px] shrink-0 truncate text-[12px] font-medium text-ink-muted md:inline">
                  {t.assigneeName}
                </span>
              )}
              <StatusBadge status={t.status} employeeView={!handlerView} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
