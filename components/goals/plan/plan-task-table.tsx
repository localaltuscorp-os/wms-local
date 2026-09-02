"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskPriority } from "@/db/enums";
import type { PlanItem } from "./types";
import { planCategory, CATEGORY_ACCENT } from "./source-tag";
import { TransferControl } from "./item-detail";

/**
 * The post-"Start My Day" commitment list, as a full-width data table.
 *
 * Replaces the narrow centred bullet list that used to sit inside the "Your day
 * is planned" card, which showed nothing but a truncated title — you could not
 * tell a carried-over WMS task from a goal you typed in this morning.
 *
 * Columns: Client · Subject · Category · Task · Priority · Created · Due · Age.
 * Deliberately NO Doer / Doer Status: this is your own day, so every row has the
 * same doer and the column would repeat your name N times.
 *
 * Cells render an em-dash when a value is genuinely absent rather than guessing.
 * That is the common case, not an error: an ad-hoc commitment has no client, and
 * only task-backed rows carry a priority or a due date.
 */

const PRIORITY_TONE: Record<TaskPriority, { bg: string; fg: string }> = {
  imp_urgent: { bg: "#fee2e2", fg: "#991b1b" },
  imp_not_urgent: { bg: "#fef3c7", fg: "#92400e" },
  not_imp_urgent: { bg: "#e0f2fe", fg: "#075985" },
  not_imp_not_urgent: { bg: "#f1f5f9", fg: "#475569" },
};

/** Age tiers mirror the aging heatmap's: 31+ red, 15+ amber, else quiet. */
function ageTone(days: number): { bg: string; fg: string } {
  if (days >= 31) return { bg: "#fee2e2", fg: "#991b1b" };
  if (days >= 15) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#f1f5f9", fg: "#475569" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-18" → "18 Aug 2026". Date only — never a time string. */
function fmtDay(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

function Dash() {
  return <span className="text-ink-subtle">—</span>;
}

export function PlanTaskTable({
  items,
  onOpen,
  onTransfer,
  onRemove,
  busyId,
}: {
  items: PlanItem[];
  /** Row click → open the detail drawer. */
  onOpen: (item: PlanItem) => void;
  /** Move a commitment to another planner day (0-6). */
  onTransfer?: (id: string, off: number) => void;
  /** Take a commitment OFF today's plan. Does not touch the underlying task. */
  onRemove?: (id: string) => void;
  /** Row currently mid-write, for the spinner. */
  busyId?: string | null;
}) {
  // Which row the pointer is on, for the hover preview, plus where the cursor
  // is so the card can follow it. Kept here rather than per-row so only one
  // preview can ever be open.
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);
  const hasActions = Boolean(onTransfer || onRemove);

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-hairline bg-surface-card px-4 py-8 text-center text-[14px] font-semibold text-ink-muted">
        Nothing committed for today.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card">
      <table className="w-full border-collapse text-left" style={{ minWidth: 980 }}>
        <thead>
          <tr className="border-b border-hairline bg-surface-soft">
            {["Client", "Subject", "Category", "Task", "Priority", "Created", "Due", "Age"].map(
              (h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                >
                  {h}
                </th>
              ),
            )}
            {hasActions && (
              // Pinned to the right edge so Move/Remove stay on screen while
              // the 980px-min table is scrolled sideways.
              <th
                className="sticky right-0 whitespace-nowrap bg-surface-soft px-3 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                style={{ boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" }}
              >
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const category = planCategory(it.kind, it.carriedOver);
            const created = fmtDay(it.createdYmd);
            const due = fmtDay(it.dueYmd);
            const isHovered = hovered === it.id;

            return (
              <tr
                key={it.id}
                onMouseEnter={(e) => {
                  setHovered(it.id);
                  setCursor({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => {
                  setHovered((h) => (h === it.id ? null : h));
                  setCursor(null);
                }}
                onClick={() => onOpen(it)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(it);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open ${it.title}`}
                className="relative cursor-pointer border-b border-hairline transition-colors last:border-b-0 focus:outline-none"
                style={{ background: isHovered ? "var(--color-surface-soft)" : undefined }}
              >
                <td className="px-3 py-2 text-[13px] text-ink-soft">
                  {it.client ? (
                    <span className="block max-w-[150px] truncate" title={it.client}>
                      {it.client}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-3 py-2 text-[13px] text-ink-soft">
                  {it.subject ? (
                    <span className="block max-w-[150px] truncate" title={it.subject}>
                      {it.subject}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      background: "var(--color-surface-soft)",
                      color: CATEGORY_ACCENT[category],
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-1.5 rounded-full"
                      style={{ background: CATEGORY_ACCENT[category] }}
                    />
                    {category}
                  </span>
                </td>
                {/* Title truncates with an ellipsis; the full text is in the
                    hover preview below and in `title` for assistive tech. */}
                <td className="px-3 py-2">
                  <span
                    className="block max-w-[320px] truncate text-[13.5px] font-semibold text-ink-strong"
                    title={it.title}
                  >
                    {it.taskNo ? (
                      <span className="mr-1 font-mono text-[12px] text-ink-subtle">
                        #{it.taskNo}
                      </span>
                    ) : null}
                    {it.title}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {it.priority ? (
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={PRIORITY_TONE[it.priority] && {
                        background: PRIORITY_TONE[it.priority].bg,
                        color: PRIORITY_TONE[it.priority].fg,
                      }}
                    >
                      {PRIORITY_LABELS[it.priority]}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[12.5px] tabular-nums text-ink-soft">
                  {created ?? <Dash />}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[12.5px] tabular-nums text-ink-soft">
                  {due ?? <Dash />}
                </td>
                <td className="px-3 py-2">
                  {it.ageDays != null ? (
                    <span
                      className="inline-flex min-w-[34px] justify-center rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums"
                      style={{
                        background: ageTone(it.ageDays).bg,
                        color: ageTone(it.ageDays).fg,
                      }}
                    >
                      {it.ageDays}d
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>

                {hasActions && (
                  <td
                    className="sticky right-0 px-3 py-2"
                    style={{
                      // Matches the row so the pinned cell doesn't read as a
                      // separate floating strip when the row is hovered.
                      background: isHovered
                        ? "var(--color-surface-soft)"
                        : "var(--color-surface-card)",
                      boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)",
                    }}
                  >
                    <RowActions
                      item={it}
                      busy={busyId === it.id}
                      onTransfer={onTransfer}
                      onRemove={onRemove}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Hover preview — the unabridged title, the full category and the
          description, floating just ABOVE the cursor.
          Portalled to <body> and `fixed`: the table is `overflow-x-auto`, which
          clips absolutely-positioned children, so an in-flow tooltip would be
          cut off at the table's edge. */}
      {hovered && cursor && (
        <HoverPreview item={items.find((i) => i.id === hovered)!} cursor={cursor} />
      )}
    </div>
  );
}

/**
 * Per-row Move + Remove, ALWAYS visible.
 *
 * Deliberately not the hover-revealed treatment the planning board's cards use
 * — on a table you cannot tell a row has actions until you happen to hover it,
 * which is exactly the complaint that prompted this.
 *
 * Delete is two-step (click → "Confirm", auto-reverting after 3.5s) following
 * the house `RowActions` in components/accounts/**: an always-visible
 * destructive button one stray click from dropping a commitment needs the
 * speed bump, and a modal on every removal would be tedious.
 *
 * "Remove" takes the item off TODAY'S PLAN only. The underlying WMS task or
 * goal is untouched and can be pulled back in tomorrow — which is why the label
 * says "Remove from day" rather than "Delete".
 */
function RowActions({
  item,
  busy,
  onTransfer,
  onRemove,
}: {
  item: PlanItem;
  busy: boolean;
  onTransfer?: (id: string, off: number) => void;
  onRemove?: (id: string) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  // A done commitment is history — moving or removing it would rewrite the
  // record of what was delivered. Mirrors the `!it.done` guard the old list had.
  if (item.done) {
    return <span className="block text-right text-[11.5px] font-semibold text-ink-subtle">—</span>;
  }

  return (
    // EVERY handler stops propagation: the row itself is a button that opens
    // the detail drawer, so without this a Move/Remove click also opens it.
    <div
      className="flex items-center justify-end gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {onTransfer && (
        <TransferControl
          variant="button"
          portal
          onTransfer={(off) => onTransfer(item.id, off)}
        />
      )}

      {onRemove &&
        (confirming ? (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={busy}
            title="Remove from today's plan — the task itself is untouched"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />}
            Confirm
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label="Remove from today's plan"
            title="Remove from today's plan — the task itself is untouched"
            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"
          >
            <Trash2 size={15} strokeWidth={2.2} />
          </button>
        ))}
    </div>
  );
}

function HoverPreview({
  item,
  cursor,
}: {
  item: PlanItem;
  cursor: { x: number; y: number };
}) {
  const category = planCategory(item.kind, item.carriedOver);
  const WIDTH = 460;
  const GAP = 16; // clearance so the card never sits under the pointer

  // Sits ABOVE the cursor by default and flips below only when there isn't room
  // — near the top of the viewport an always-above card would be clipped.
  const above = cursor.y > 240;
  const left = Math.max(12, Math.min(cursor.x - WIDTH / 2, window.innerWidth - WIDTH - 12));

  return createPortal(
    <div
      role="tooltip"
      // `pointer-events-none` is essential: the card tracks the cursor, so if it
      // could receive the pointer it would steal the row's mouseleave and the
      // preview would stick.
      className="pointer-events-none fixed z-[80] rounded-xl border border-hairline-strong bg-surface-card p-3.5"
      style={{
        width: WIDTH,
        left,
        top: above ? cursor.y - GAP : cursor.y + GAP,
        transform: above ? "translateY(-100%)" : undefined,
        boxShadow: "0 18px 44px -12px rgba(15,23,42,0.28)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: "var(--color-surface-soft)",
            color: CATEGORY_ACCENT[category],
          }}
        >
          {category}
        </span>
        <p className="min-w-0 text-[14px] font-bold leading-snug text-ink-strong">
          {item.title}
        </p>
      </div>
      {item.description ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-muted">
          {item.description.length > 320
            ? `${item.description.slice(0, 320)}…`
            : item.description}
        </p>
      ) : (
        <p className="mt-1.5 text-[12.5px] font-medium italic text-ink-subtle">
          No description on this commitment.
        </p>
      )}
    </div>,
    document.body,
  );
}
