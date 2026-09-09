"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Route } from "next";
import { ArrowRight, LifeBuoy } from "lucide-react";
import type { InboxNotificationRow as NotificationRowData } from "@/lib/queries/notifications";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import {
  CATEGORY_LABELS,
  categoryOfKind,
  formatDaysAgo,
  formatPeriod,
  formatShortDate,
  formatShortTime,
  notificationPeriod,
} from "@/lib/notifications/categories";
import { markNotificationRead } from "./actions";

interface Props {
  row: NotificationRowData;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
  selected: boolean;
  onSelect: (id: string, next: boolean) => void;
  /** Raise an HR ticket about just this row. */
  onRaiseTicket: (id: string) => void;
}

// Kinds that deep-link somewhere other than the related task / inbox.
const KIND_HREF: Partial<Record<string, string>> = {
  dcc_fill_reminder: "/dcc",
  ambassador_reminder: "/ambassadors",
  weekly_goals_assigned: "/goals/weekly",
  weekly_goals_fill_reminder: "/goals/weekly",
  weekly_goals_incomplete: "/goals/weekly",
  goals_commit_reminder: "/goals/commit",
  goals_approval_reminder: "/goals/approve",
  goals_committed: "/goals/weekly",
  goals_approved: "/goals/weekly",
  hr_confirmation_due: "/agreements",
  hr_ticket_created: "/support",
  hr_ticket_assigned: "/support",
  hr_ticket_replied: "/support",
  hr_ticket_status_changed: "/support",
  hr_ticket_sla_breach: "/support",
  hr_ticket_csat_request: "/support",
  // Appraisal lives inside Team Productivity now. `/appraisal` still redirects
  // here, so older unread notifications keep working; these point at the real
  // destination so a fresh one doesn't take the extra hop.
  appraisal_cycle_opened: "/productivity/appraisal",
  appraisal_self_reminder: "/productivity/appraisal",
  appraisal_manager_pending: "/productivity/appraisal",
  appraisal_management_pending: "/productivity/appraisal",
  appraisal_finalized: "/productivity/appraisal",
  // Enterprise Communications (mig 0179) — the employee's broadcast inbox.
  broadcast: "/communications",
};

/**
 * Parse the notification `body`. The body is INTERNAL JSON metadata (e.g.
 * `{"fromStatus":"approved","toStatus":"cancelled"}`) used by the Slack /
 * WhatsApp templates — it must never be shown raw. We extract a status
 * transition when present, treat genuine free text (a comment) as text, and
 * otherwise show nothing.
 */
export function parseBody(
  body: string | null,
): { from: TaskStatus | null; to: TaskStatus | null } | { text: string } | null {
  if (!body) return null;
  const t = body.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      const from = typeof o.fromStatus === "string" ? (o.fromStatus as TaskStatus) : null;
      const to = typeof o.toStatus === "string" ? (o.toStatus as TaskStatus) : null;
      if (from || to) return { from, to };
    } catch {
      /* fall through */
    }
    // JSON metadata with nothing user-facing → suppress entirely.
    return null;
  }
  return { text: t };
}

function StatusPill({
  status,
  labels,
  tones,
}: {
  status: TaskStatus;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const tone = tones[status] ?? "blue";
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 32%, transparent)`,
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

/**
 * COLUMN TEMPLATE, shared with the header strip in `inbox-list.tsx` so the two
 * can never drift:
 *
 *   [tick] Date · Category · Source · Notification · Period · Days ago · Actions
 *
 * The old row was a Gmail-style "sender — subject … when" line. It read fine but
 * it could not answer the two questions this list is actually for: WHEN was this
 * sent (as a date, not "3 days ago") and WHAT PERIOD does it cover. Those are
 * now their own columns, and the coloured per-kind icon is gone — the category
 * name says the same thing in words that match the filter bar above.
 */
// Category and Source are SEPARATE columns (Sir) — they used to share one cell,
// stacked. Splitting them costs ~70px, taken from the Notification column, which
// is `minmax(0,1fr)` and absorbs it. The two narrow breakpoints below drop both
// columns together (their cells carry `max-lg:hidden`), so the template's column
// count and the rendered cell count always agree — get that wrong and every
// column after the gap shifts one place left.
export const ROW_GRID =
  "grid items-center gap-x-3 grid-cols-[20px_78px_112px_118px_minmax(0,1fr)_186px_92px_40px] max-xl:grid-cols-[20px_78px_98px_104px_minmax(0,1fr)_150px_84px_40px] max-lg:grid-cols-[20px_78px_minmax(0,1fr)_92px_40px] max-md:grid-cols-[20px_78px_minmax(0,1fr)_40px]";

/**
 * One inbox row.
 *
 * Read / unread stays deliberately quiet: a small red dot in the leading slot
 * and a heavier title weight. No tinted row background, no left accent bar —
 * this is a dense list you scan, and a stripe on every second row turned it into
 * a barcode.
 *
 * Clicking the row marks it read and deep-links, exactly as before. The tick box
 * and the Raise-a-Ticket button sit OUTSIDE that click target so selecting a row
 * never navigates you away from the list you are selecting in.
 */
export function NotificationRow({
  row,
  statusLabels,
  statusTones,
  selected,
  onSelect,
  onRaiseTicket,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = row.readAt === null;
  const href = (KIND_HREF[row.kind] ?? (row.taskId ? `/tasks/${row.taskId}` : "/inbox")) as Route;
  const who = row.actorName ?? "System";
  const meta = parseBody(row.body);
  const category = CATEGORY_LABELS[categoryOfKind(row.kind)];
  const sharedOn = formatShortDate(row.createdAt);
  const sentAt = formatShortTime(row.createdAt);
  const period = formatPeriod(notificationPeriod(row));
  const ago = formatDaysAgo(row.createdAt);

  // When we render the status pills, strip a redundant trailing "to <Label>"
  // off the title so it doesn't repeat what the pills already say.
  let title = row.title;
  if (meta && "to" in meta && meta.to) {
    const toLabel = statusLabels[meta.to];
    if (toLabel && title.endsWith(` to ${toLabel}`)) {
      title = title.slice(0, title.length - ` to ${toLabel}`.length);
    }
  }

  function onActivate() {
    startTransition(async () => {
      if (unread) await markNotificationRead(row.id);
      router.push(href);
    });
  }

  return (
    <li
      className={`${ROW_GRID} border-b border-hairline px-4 transition-colors hover:bg-[rgba(15,23,42,0.03)] max-md:px-3`}
      style={{ opacity: isPending ? 0.6 : 1 }}
    >
      {/* Tick — the entry point to Raise a Ticket. Its own control, outside the
          navigating button, so selecting never triggers a page change. */}
      <span className="flex items-center justify-center py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(row.id, e.target.checked)}
          aria-label={`Select notification: ${title}`}
          className="size-[15px] cursor-pointer accent-[var(--color-altus-red)]"
        />
      </span>

      {/* Date shared — DD-MM-YY, ahead of the source, per spec. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="flex items-center gap-1.5 py-2 text-left"
        title={`Open — sent ${sharedOn} at ${sentAt}`}
      >
        <span aria-hidden className="flex w-2 shrink-0 justify-center">
          {unread && (
            <span
              className="inline-flex size-[6px] rounded-full"
              style={{ background: "var(--color-altus-red)" }}
            />
          )}
        </span>
        <span className="min-w-0">
          <span
            className="block whitespace-nowrap text-[12.5px] tabular-nums"
            style={{
              fontWeight: unread ? 700 : 500,
              color: unread ? "var(--color-ink-strong)" : "var(--color-ink-soft)",
            }}
          >
            {sharedOn}
          </span>
          {/* The exact SENT time, from notifications.created_at — the same
              instant the date above is derived from, so the two can never
              disagree. Set as a second line inside the existing cell rather
              than a new column: it is 11px on the row's existing leading, so
              the row does not grow. */}
          <span className="block whitespace-nowrap text-[11px] tabular-nums text-ink-subtle">
            {sentAt}
          </span>
        </span>
      </button>

      {/* CATEGORY — its own column (Sir). Same vocabulary as the filter bar
          above, spelled out; it replaced the coloured per-kind glyph. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="min-w-0 py-2 text-left max-lg:hidden"
      >
        <span className="block truncate text-[12.5px] font-semibold text-ink-strong">
          {category}
        </span>
      </button>

      {/* SOURCE — who sent it, or "System" for anything the app raised itself.
          Previously stacked under the category in one cell; it is now a column
          of its own so both can be scanned down the list independently. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="min-w-0 py-2 text-left max-lg:hidden"
        title={who}
      >
        <span className="block truncate text-[12.5px] text-ink-soft">{who}</span>
      </button>

      {/* The notification itself. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="flex min-w-0 items-baseline gap-1.5 py-2 text-left"
      >
        <span
          className="min-w-0 truncate text-[13.5px] leading-snug"
          style={{
            fontWeight: unread ? 700 : 500,
            color: unread ? "var(--color-ink-strong)" : "var(--color-ink-soft)",
          }}
        >
          {title}
        </span>

        {meta && "to" in meta && (meta.from || meta.to) && (
          <span className="hidden shrink-0 items-center gap-1 xl:inline-flex">
            {meta.from && (
              <>
                <StatusPill status={meta.from} labels={statusLabels} tones={statusTones} />
                <ArrowRight size={11} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
              </>
            )}
            {meta.to && <StatusPill status={meta.to} labels={statusLabels} tones={statusTones} />}
          </span>
        )}

        {meta && "text" in meta && (
          <span className="min-w-0 truncate text-[12.5px] font-normal text-ink-subtle max-lg:hidden">
            — {meta.text}
          </span>
        )}

        {/* Small screens lose the Category column — fold it back in here so the
            row never loses the one label that ties it to the filter bar. */}
        <span className="hidden shrink-0 text-[11px] font-semibold text-ink-subtle max-lg:inline">
          · {category}
        </span>
      </button>

      {/* Period the notification covers — a quiet dash when there isn't one. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="py-2 text-left max-lg:hidden"
      >
        <span className="block truncate whitespace-nowrap text-[12px] tabular-nums text-ink-soft">
          {period ?? <span className="text-ink-subtle">—</span>}
        </span>
      </button>

      {/* Days ago — the final time column. */}
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="py-2 text-right max-md:hidden"
      >
        <span
          className="whitespace-nowrap text-[12px] tabular-nums"
          style={{
            fontWeight: unread ? 700 : 400,
            color: unread ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
          }}
        >
          {ago}
        </span>
      </button>

      {/* Actions. */}
      <span className="flex items-center justify-end py-2">
        <button
          type="button"
          onClick={() => onRaiseTicket(row.id)}
          title="Raise a ticket to HR about this notification"
          aria-label={`Raise a ticket about: ${title}`}
          className="inline-flex size-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-[var(--color-altus-red)]"
        >
          <LifeBuoy size={15} />
        </button>
      </span>
    </li>
  );
}
