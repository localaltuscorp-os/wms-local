"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LifeBuoy, X } from "lucide-react";
import type { InboxNotificationRow as NotificationRowData } from "@/lib/queries/notifications";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { NotificationRow, ROW_GRID } from "./notification-row";

/**
 * The notification list plus the selection it owns.
 *
 * Selection exists for one reason: RAISE A TICKET. Tick the notifications you
 * want HR to look at, hit the button, and you land on the existing HR composer
 * (`/support/new`) with the context already filled in. The ids travel in the
 * URL — `/support/new?n=<id>,<id>` — and the composer page re-reads them from
 * the database, scoped to you, so the ticket describes the real notification
 * rather than whatever a hand-edited query string claimed.
 *
 * There is NO new ticketing code here. This is a deep link into the HR feature
 * that already exists, carrying context.
 */
export function InboxList({
  rows,
  statusLabels,
  statusTones,
}: {
  rows: NotificationRowData[];
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());

  // Rows change when you filter by category or page backwards. Rather than
  // pruning the stored set in an effect (a cascading render, and a race with a
  // click landing mid-navigation), the selection is INTERSECTED with what is on
  // screen at read time. Nothing off-screen can ever reach the action bar.
  const active = React.useMemo(
    () => rows.map((r) => r.id).filter((id) => selected.has(id)),
    [rows, selected],
  );

  const onSelect = React.useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && active.length === rows.length;
  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const on = rows.filter((r) => prev.has(r.id)).length;
      return on === rows.length ? new Set() : new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  /** Hand off to the HR composer with the chosen notifications as context. */
  const raiseTicket = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      router.push(`/support/new?n=${ids.join(",")}` as Route);
    },
    [router],
  );

  const count = active.length;

  return (
    <>
      {/* Selection action bar — only present when there is something to act on,
          so the resting state of the page is just the list. */}
      {count > 0 && (
        // Deliberately NOT sticky: the category bar already owns the
        // `sticky-below-topbar` offset, and a second sticky strip at the same
        // offset would sit on top of it.
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-[color-mix(in_srgb,var(--color-altus-red)_5%,white)] px-4 py-2 max-md:px-3">
          <span className="text-[12.5px] font-bold text-ink-strong">
            {count} selected
          </span>
          <button
            type="button"
            onClick={() => raiseTicket(active)}
            className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white transition hover:brightness-110"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            <LifeBuoy size={14} /> Raise a Ticket
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* Column header. Same grid template as the rows, imported rather than
          re-typed, so a column can never be added to one and not the other. */}
      <div
        className={`${ROW_GRID} border-b border-hairline bg-[rgba(15,23,42,0.02)] px-4 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle max-md:px-3`}
      >
        <span className="flex items-center justify-center py-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label={allSelected ? "Clear selection" : "Select all notifications"}
            className="size-[15px] cursor-pointer accent-[var(--color-altus-red)]"
          />
        </span>
        <span className="py-2 pl-3.5">Date</span>
        {/* Two columns now, not one "Category / Source" cell. Both carry
            `max-lg:hidden` to match their cells in NotificationRow — the narrow
            grid templates drop exactly this pair. */}
        <span className="py-2 max-lg:hidden">Category</span>
        <span className="py-2 max-lg:hidden">Source</span>
        <span className="py-2">Notification</span>
        <span className="py-2 max-lg:hidden">Period</span>
        <span className="py-2 text-right max-md:hidden">Days ago</span>
        <span className="py-2 text-right">
          <span className="sr-only">Actions</span>
          <span aria-hidden>···</span>
        </span>
      </div>

      <ol className="w-full">
        {rows.map((n) => (
          <NotificationRow
            key={n.id}
            row={n}
            statusLabels={statusLabels}
            statusTones={statusTones}
            selected={selected.has(n.id)}
            onSelect={onSelect}
            onRaiseTicket={(id) => raiseTicket([id])}
          />
        ))}
      </ol>
    </>
  );
}
