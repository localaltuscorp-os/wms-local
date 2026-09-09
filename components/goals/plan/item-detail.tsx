"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, ArrowRight, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { PRIORITY_LABELS } from "@/db/enums";
import { endHhmm, minToHhmm, rangeFromHhmm } from "@/lib/goals/plan-time";
import { istYmd } from "@/lib/weekly-goals/week";
import type { PlanItem, SourceItem } from "./types";
import { SourceTag, fmtYmd } from "./source-tag";
import { overdueLabel } from "./wms-filters";

/**
 * The shared "full item" surface for the planner — one field set rendered two
 * ways: a wide HOVER preview and a ¾-screen double-click POP-OUT.
 *
 * Sir's rule 3: a card shows ~3 lines of the task and nothing else; the REST of
 * the content lives here, one hover away. So this panel carries the untruncated
 * task text and only the facts that help you act on it — priority, how late it
 * is, when it's scheduled. No task id, no company, no internal WMS status.
 */

const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

/** Weekday + date labels for the planner days, computed from the local date. */
const TC_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const TC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * How far ahead "Move to another day" reaches: a fortnight (Sir).
 *
 * A week was not enough — moving something into NEXT week meant leaving the
 * review and finding a date picker. Fourteen days ahead means the whole of this
 * week and the whole of the next are one click away. The server already files
 * work up to PLAN_MAX_DAY_OFFSET (+27), so nothing here needs it to agree.
 */
const TRANSFER_DAYS_AHEAD = 27;
/** One page of the strip — a week, exactly like the board's own day strip. */
const TRANSFER_PAGE = 7;

/**
 * The next {@link TRANSFER_DAYS_AHEAD} days, plus today, built fresh on every
 * render — nothing is hard-coded, so the list re-labels itself the moment the
 * date rolls over.
 *
 * The base day is IST, not the BROWSER's day: an offset is only meaningful
 * against the same clock the server files plan_date on, and a laptop set to a
 * different timezone would otherwise offer a list shifted by one. The day
 * arithmetic then runs on UTC midnight, exactly as `ymdForOffset` does on the
 * server, so a date can never slip either side of a timezone boundary.
 */
function transferDays(): { off: number; label: string; date: string }[] {
  const [y, m, d] = istYmd(new Date()).split("-").map(Number);
  return Array.from({ length: TRANSFER_DAYS_AHEAD + 1 }, (_, i) => {
    const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + i));
    return {
      off: i,
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : i === 2
              ? "Day After"
              : (TC_WEEKDAYS[dt.getUTCDay()] ?? ""),
      date: `${dt.getUTCDate()} ${TC_MONTHS[dt.getUTCMonth()] ?? ""}`,
    };
  });
}

/**
 * "Move to another day" — the long tail beyond the two one-click buttons every
 * card carries (Tomorrow / Day After). Opens a list of the planner days so work
 * can be pushed to ANY visible future day.
 */
export function TransferControl({
  onTransfer,
  variant = "icon",
  currentOffset,
  portal = false,
}: {
  onTransfer: (off: number) => void;
  variant?: "icon" | "button";
  /** The day this item is on — omitted from the menu (you can't move it to
   *  where it already is). */
  currentOffset?: number;
  /**
   * Render the day menu into `<body>` instead of positioning it against this
   * component.
   *
   * Needed when an ancestor clips overflow — the plan review TABLE is
   * `overflow-x-auto`, which establishes a clipping context, so the default
   * `absolute` menu gets cut off at the table's edge. Opt-in so the two
   * card call-sites keep their existing (working) behaviour.
   */
  portal?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  // Where to pin the portalled menu — measured off the trigger when it opens.
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Measure on open, and follow scroll/resize — the menu is `fixed`, so a page
  // scroll would otherwise leave it floating where the button used to be.
  React.useEffect(() => {
    if (!open || !portal) return;
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const MENU_W = 176; // w-44
      setPos({
        top: r.bottom + 4,
        // Right-align to the trigger, then clamp inside the viewport.
        left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, portal]);

  const pick = (off: number) => {
    setOpen(false);
    onTransfer(off);
  };
  const days = transferDays();
  const pages = Math.ceil(days.length / TRANSFER_PAGE);
  /**
   * Which week the strip is showing (Sir) — ‹ / › step through it exactly as the
   * board's day strip does, so "next week" is one arrow rather than a scroll.
   *
   * The item's own day is DISABLED in place rather than filtered out: dropping
   * it would slide every later date one column left, and a strip whose columns
   * shift under you is not a strip you can aim at.
   */
  const [page, setPage] = React.useState(0);
  const shown = days.slice(page * TRANSFER_PAGE, page * TRANSFER_PAGE + TRANSFER_PAGE);

  const menuItems = days.map((d) => (
    <button
      key={d.off}
      type="button"
      onClick={() => pick(d.off)}
      className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] font-semibold text-ink-strong hover:bg-surface-soft"
    >
      <span>→ {d.label}</span>
      <span className="text-[10.5px] font-medium tabular-nums text-ink-subtle">{d.date}</span>
    </button>
  ));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setPage(0);
          setOpen((o) => !o);
        }}
        aria-label="Move to another day"
        title="Move to another day"
        className={
          variant === "button"
            ? "inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:border-altus-red hover:text-ink-strong"
            : "inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-2"
        }
      >
        <CalendarClock size={13} />
        {variant === "button" ? "Move" : null}
      </button>
      {/* A WEEK AT A TIME, STACKED (Sir). One week of days down the menu with
          ‹ / › to step to the next — so the whole week is on screen with no
          scrolling, and next week is one press away. Vertical because that is
          how a menu hanging off a card reads: a wide strip had to spill sideways
          across the rows either side of it. */}
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-hairline-strong bg-surface-card p-1 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
          {/* Which week you are looking at, and the way to the next one. */}
          <div className="flex items-center justify-between gap-1 border-b border-hairline pb-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous week"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-25"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {shown[0]?.date} – {shown[shown.length - 1]?.date}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              aria-label="Next week"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-25"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mt-1 flex flex-col">
            {shown.map((d) => (
              <button
                key={d.off}
                type="button"
                onClick={() => pick(d.off)}
                disabled={d.off === currentOffset}
                title={d.off === currentOffset ? "Already on this day" : `Move to ${d.label}, ${d.date}`}
                className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <span className="truncate">→ {d.label}</span>
                <span className="shrink-0 text-[10.5px] font-medium tabular-nums text-ink-subtle">{d.date}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {open && portal && pos
        ? createPortal(
            // `fixed` + measured coords: escapes the table's overflow clip.
            // `ref` still wraps it via the parent div's contains() check? No —
            // a portalled node is OUTSIDE ref.current, so the mousedown handler
            // would close the menu the instant you clicked an option. Stopping
            // propagation here keeps that handler from ever seeing the click.
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="z-[80] max-h-64 w-44 overflow-y-auto rounded-lg border border-hairline-strong bg-surface-card p-1 shadow-[0_12px_30px_rgba(15,23,42,0.18)]"
              style={{ position: "fixed", top: pos.top, left: pos.left }}
            >
              {menuItems}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** A labelled field row; renders nothing when the value is empty. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="flex gap-3">
      <div className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] font-medium text-ink-strong">{children}</div>
    </div>
  );
}

/** The shared body — reused by the hover panel and the modal. */
export function ItemDetailBody({ item, today }: { item: SourceItem; today: string }) {
  const late = overdueLabel(item.dueYmd, today);
  const dueToday = item.dueYmd === today;
  const kindTag = item.kind === "unfinished" ? (item.originKind ?? "unfinished") : item.kind;
  // The card clamps to 3 lines; a description longer than the title is the
  // "more content" this panel exists to show in full.
  const body = item.description?.trim() && item.description.trim() !== item.title.trim() ? item.description.trim() : null;

  return (
    <div className="flex flex-col gap-3">
      <SourceTag kind={kindTag} />

      <div className="text-[15px] font-bold leading-[1.35] text-ink-strong" style={{ overflowWrap: "anywhere" }}>
        {item.title}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        {item.priority ? (
          <Field label="Priority">
            <span
              style={
                item.priority === "imp_urgent"
                  ? { color: RISK }
                  : item.priority === "imp_not_urgent"
                    ? { color: WARN }
                    : undefined
              }
            >
              {PRIORITY_LABELS[item.priority]}
            </span>
          </Field>
        ) : null}
        {item.dueYmd ? (
          <Field label="Due">
            <span className="tabular-nums">{fmtYmd(item.dueYmd)}</span>
            {late ? (
              <span className="ml-2 font-bold" style={{ color: RISK }}>
                · {late}
              </span>
            ) : dueToday ? (
              <span className="ml-2 font-bold" style={{ color: WARN }}>
                · due today
              </span>
            ) : null}
          </Field>
        ) : null}
        {item.timeLabel ? <Field label="Time">{item.timeLabel}</Field> : null}
        {item.fromYmd ? <Field label="Planned">on {fmtYmd(item.fromYmd)}</Field> : null}
        {item.meta ? <Field label="Progress">{item.meta}</Field> : null}
      </div>

      {body ? (
        <div className="border-t border-hairline pt-3">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-ink-soft">{body}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A wide hover preview anchored to the card. Opens on hover (short delay),
 * portal'd to <body>, clamped to a readable width and kept on-screen.
 */
/**
 * The hover shell — positioning, the delay, the portal. Anything can go inside
 * it, which is what lets a WMS source card and a planned card share ONE popover
 * instead of drifting into two that look almost-but-not-quite alike.
 */
export function HoverPanel({
  content,
  disabled,
  children,
}: {
  content: React.ReactNode;
  /** Suppress while dragging or mid-edit — a panel that follows a dragged card is noise. */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (disabled) return;
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(460, Math.max(300, Math.round(vw * 0.28)));
      // Prefer the LEFT of the card; flip right if it would overflow.
      let left = r.left - width - 12;
      if (left < 12) left = Math.min(r.right + 12, vw - width - 12);
      // A LONG TASK MUST BE READABLE IN FULL (Sir). The panel lines up with the
      // card, but never starts so far down the screen that there's no room left
      // — then it takes every remaining pixel. No measuring pass needed, and a
      // genuinely enormous description still scrolls (the panel accepts the
      // mouse now, so scrolling actually works).
      const top = Math.max(12, Math.min(r.top, Math.round(vh * 0.22)));
      const maxHeight = vh - top - 16;
      setPos({ top, left, width, maxHeight });
    }, 500);
  }, [disabled]);

  // Closing is delayed a beat so the pointer can cross the gap from the card
  // onto the panel to scroll it, instead of the panel vanishing en route.
  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPos(null), 180);
  }, []);

  const keepOpen = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const closeNow = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPos(null);
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} className="min-w-0">
      {children}
      {pos && !disabled && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              onMouseEnter={keepOpen}
              onMouseLeave={closeNow}
              className="fixed z-[60] overflow-auto overscroll-contain rounded-xl border border-hairline-strong bg-surface-card p-3 shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
              style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** The WMS / goal source card's hover — the full item, one hover away. */
export function ItemHoverCard({
  item,
  today,
  children,
}: {
  item: SourceItem;
  today: string;
  children: React.ReactNode;
}) {
  return <HoverPanel content={<ItemDetailBody item={item} today={today} />}>{children}</HoverPanel>;
}

/**
 * The PLANNED card's hover (Sir: "I want the same when I take it on my plans").
 *
 * Same shell, same shape — but a planned card's questions are different from a
 * source card's: it already IS on a day, so what you want on hover is the whole
 * task text, WHAT TIME you said you'd do it, and whether it's still open.
 */
export function PlanItemDetailBody({ item }: { item: PlanItem }) {
  const late = item.overdueDays != null && item.overdueDays > 0 ? item.overdueDays : null;
  return (
    <div className="flex flex-col gap-3">
      <SourceTag kind={item.kind} />

      <div className="text-[15px] font-bold leading-[1.35] text-ink-strong" style={{ overflowWrap: "anywhere" }}>
        {item.title}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <Field label="Time">
          {item.timeLabel ? (
            <span className="tabular-nums">{item.timeLabel}</span>
          ) : (
            <span className="text-ink-muted">Anytime — no time set</span>
          )}
        </Field>
        {item.priority ? (
          <Field label="Priority">
            <span
              style={
                item.priority === "imp_urgent"
                  ? { color: RISK }
                  : item.priority === "imp_not_urgent"
                    ? { color: WARN }
                    : undefined
              }
            >
              {PRIORITY_LABELS[item.priority]}
            </span>
          </Field>
        ) : null}
        {item.dueYmd ? (
          <Field label="Due">
            <span className="tabular-nums">{fmtYmd(item.dueYmd)}</span>
            {late ? (
              <span className="ml-2 font-bold" style={{ color: RISK }}>
                · {late} day{late === 1 ? "" : "s"} overdue
              </span>
            ) : null}
          </Field>
        ) : late ? (
          <Field label="Due">
            <span className="font-bold" style={{ color: RISK }}>
              {late} day{late === 1 ? "" : "s"} overdue
            </span>
          </Field>
        ) : null}
        <Field label="Status">
          {item.done ? (
            <span style={{ color: "var(--color-green-deep)" }}>Done</span>
          ) : item.pending ? (
            <span style={{ color: WARN }}>Pending — moved to Unfinished</span>
          ) : (
            "To do"
          )}
        </Field>
      </div>
    </div>
  );
}

export function PlanItemHoverCard({
  item,
  disabled,
  children,
}: {
  item: PlanItem;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <HoverPanel content={<PlanItemDetailBody item={item} />} disabled={disabled}>
      {children}
    </HoverPanel>
  );
}

/** The ¾-screen double-click pop-out: the same body + actions. */
export function ItemDetailModal({
  item,
  today,
  onClose,
  onAdd,
  addLabel,
}: {
  item: SourceItem;
  today: string;
  onClose: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fullHref =
    item.kind === "task" && (item.taskId || item.id) ? `/tasks/${item.taskId ?? item.id}` : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[70vw] max-w-[760px] flex-col overflow-hidden rounded-3xl border border-hairline-strong bg-surface-card shadow-[0_40px_100px_rgba(15,23,42,0.35)] max-md:w-[94vw]"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Details</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <ItemDetailBody item={item} today={today} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          {fullHref ? (
            <a
              href={fullHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-bold text-ink-strong hover:border-altus-red"
            >
              <ExternalLink size={14} /> Open full page
            </a>
          ) : null}
          {onAdd && !item.added ? (
            <button
              type="button"
              onClick={() => {
                onAdd();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              <ArrowRight size={14} /> {addLabel ?? "Add to plan"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A planned card's full view on a SINGLE click — and the place you EDIT it (Sir).
 *
 * What's editable here is what the PLANNER owns: the task text, and the time you
 * intend to do it. Priority and due date are shown read-only because they belong
 * to the WMS task itself — changing those from a day planner would quietly move a
 * date other people are working to.
 *
 * The editable field IS the display, so the task text is not printed twice the
 * way it was. Nothing commits until Save: title and time go together, so a
 * half-finished edit can be abandoned with Close (or Escape) and the card is
 * left exactly as it was.
 */
export function PlanItemDetailModal({
  item,
  onClose,
  onRename,
  onSetTime,
}: {
  item: PlanItem;
  onClose: () => void;
  onRename?: (id: string, title: string) => void;
  onSetTime?: (item: PlanItem, time: { startMin: number | null; durationMin: number | null }) => void;
}) {
  const [title, setTitle] = React.useState(item.title);
  const [at, setAt] = React.useState(item.startMin != null ? minToHhmm(item.startMin) : "");
  const [until, setUntil] = React.useState(endHhmm(item.startMin, item.durationMin));

  const range = rangeFromHhmm(at, until);
  const nextStart = range.startMin;
  const nextDur = range.durationMin;
  const titleChanged = title.trim().length >= 2 && title.trim() !== item.title;
  const timeChanged = nextStart !== (item.startMin ?? null) || nextDur !== (item.durationMin ?? null);
  const canEdit = !item.done;
  const dirty = canEdit && range.ok && (titleChanged || timeChanged);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (titleChanged) onRename?.(item.id, title.trim());
    if (timeChanged) onSetTime?.(item, { startMin: nextStart, durationMin: nextStart == null ? null : nextDur });
    onClose();
  };

  const late = item.overdueDays != null && item.overdueDays > 0 ? item.overdueDays : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-[60vw] max-w-[720px] flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-[0_40px_100px_rgba(15,23,42,0.35)] max-md:w-[94vw]"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
            Task details
            <SourceTag kind={item.kind} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="mb-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">Task</div>
            {canEdit && onRename ? (
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={Math.min(10, Math.max(3, Math.ceil(title.length / 60)))}
                maxLength={280}
                aria-label="Task"
                className="w-full resize-y rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[14px] font-semibold leading-[1.45] text-ink-strong focus:border-hairline-strong focus:outline-none"
              />
            ) : (
              <p
                className="text-[14px] font-semibold leading-[1.45] text-ink-strong"
                style={{ overflowWrap: "anywhere" }}
              >
                {item.title}
              </p>
            )}
          </div>

          {/* WHEN — editable, because when you do the work is the planner's call. */}
          <div className="mb-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">Time</div>
            {canEdit && onSetTime ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  aria-label="Start time"
                  className="h-9 rounded-lg border border-hairline bg-surface-card px-2 text-[13px] font-semibold tabular-nums text-ink-strong focus:border-hairline-strong focus:outline-none"
                />
                <span className="text-[13px] text-ink-muted">to</span>
                <input
                  type="time"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  aria-label="End time"
                  disabled={!at}
                  className="h-9 rounded-lg border bg-surface-card px-2 text-[13px] font-semibold tabular-nums text-ink-strong disabled:opacity-45 focus:outline-none"
                  style={{ borderColor: range.error ? "var(--color-red-edge)" : "var(--color-hairline)" }}
                />
                {at ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAt("");
                      setUntil("");
                    }}
                    className="text-[12px] font-bold text-ink-muted hover:text-ink-strong"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-[12.5px] text-ink-muted">Anytime — no time set</span>
                )}
              </div>
            ) : (
              <p className="text-[13px] font-medium text-ink-strong">{item.timeLabel ?? "Anytime — no time set"}</p>
            )}
            {range.error ? (
              <p className="mt-1 text-[12px] font-semibold" style={{ color: RISK }}>
                {range.error}
              </p>
            ) : null}
          </div>

          {/* Read-only — these belong to the WMS task, not to the plan. */}
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            {item.priority ? (
              <Field label="Priority">
                <span
                  style={
                    item.priority === "imp_urgent"
                      ? { color: RISK }
                      : item.priority === "imp_not_urgent"
                        ? { color: WARN }
                        : undefined
                  }
                >
                  {PRIORITY_LABELS[item.priority]}
                </span>
              </Field>
            ) : null}
            {item.dueYmd ? (
              <Field label="Due">
                <span className="tabular-nums">{fmtYmd(item.dueYmd)}</span>
                {late ? (
                  <span className="ml-2 font-bold" style={{ color: RISK }}>
                    · {late} day{late === 1 ? "" : "s"} overdue
                  </span>
                ) : null}
              </Field>
            ) : null}
            <Field label="Status">
              {item.done ? (
                <span style={{ color: "var(--color-green-deep)" }}>Done</span>
              ) : item.pending ? (
                <span style={{ color: WARN }}>Pending — moved to Unfinished</span>
              ) : (
                "To do"
              )}
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-bold text-ink-soft hover:border-altus-red"
          >
            Close
          </button>
          {canEdit ? (
            <button
              type="button"
              disabled={!dirty}
              onClick={save}
              className="inline-flex items-center rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
