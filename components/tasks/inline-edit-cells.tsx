"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2, Search } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/format";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/db/enums";
import {
  reassignDoer,
  setTaskPriority,
  rescheduleTask,
} from "@/app/(app)/tasks/actions";

// Shared urgency calc (kept in sync with task-table.tsx). Terminal tasks are
// never "overdue".
const URGENCY_TERMINAL = new Set<TaskStatus>([
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
]);
/**
 * Due-date presentation. Returns ONLY colour + weight — no label.
 *
 * The "1d overdue" / "Due today" / "in 2d" strings this used to append are gone:
 * they duplicated the Age column beside them and, worse, disagreed with it. Age
 * is `now − created`; these were `due − now`, so a row could read "Age 12d" next
 * to "1d overdue" and look like a contradiction. The Due column is now a date;
 * the Age column is an age.
 *
 * Red is applied ONLY when the task is still open AND the due date has passed —
 * `URGENCY_TERMINAL` covers done/approved/not_approved/cancelled/transferred, so
 * finished work never reads as on fire.
 */
function dueColor(dueAt: Date | null, status: TaskStatus): { color: string; strong: boolean } {
  if (!dueAt || URGENCY_TERMINAL.has(status)) return { color: "var(--color-ink-muted)", strong: false };
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt as unknown as string);
  if (Number.isNaN(d.getTime())) return { color: "var(--color-ink-muted)", strong: false };
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return { color: "#dc2626", strong: true };   // overdue — red-600
  if (days === 0) return { color: "var(--color-orange-deep)", strong: true };
  return { color: "var(--color-ink-muted)", strong: false };
}

function safeDate(value: Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as unknown as string);
  return Number.isNaN(d.getTime()) ? "—" : formatDate(d);
}
function toYmd(value: Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as unknown as string);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd");
}

/**
 * PRIORITY PILLS — one colour per level, so urgency is readable at a glance
 * down a long column instead of having to be read word by word (Sir):
 *
 *   Critical → red · Urgent → orange · Important → green · Normal → blue
 *
 * Note the enum names do NOT match the labels — `not_imp_urgent` is "Urgent"
 * and `imp_not_urgent` is "Important" — so the colours are keyed off the enum
 * value, never off the label string. Getting that backwards would paint the
 * two middle levels each other's colour, which is exactly the mistake this
 * comment exists to prevent.
 *
 * Only the LABEL is coloured, on a soft tint of the same hue with a matching
 * border — the same construction as CriticalBadge above, so the four read as
 * one family. The deep text-on-tint pairing keeps contrast well past 4.5:1;
 * colour is never the only signal, since each pill still spells out its level.
 *
 * The underlying priority values, ordering and sort logic are untouched.
 */
const PRIORITY_TONE: Record<TaskPriority, { bg: string; fg: string; ring: string }> = {
  // Critical is rendered by <CriticalBadge/> (it has a flame icon); kept here so
  // the map stays exhaustive and any future caller gets the same red.
  imp_urgent: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)", ring: "var(--color-red)" },
  not_imp_urgent: { bg: "#FFF4E5", fg: "#B45309", ring: "#F59E0B" }, // Urgent → orange
  imp_not_urgent: { bg: "#E9F7EF", fg: "#15803D", ring: "#22C55E" }, // Important → green
  not_imp_not_urgent: { bg: "#EAF2FE", fg: "#1D4ED8", ring: "#3B82F6" }, // Normal → blue
};

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5"
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid color-mix(in srgb, ${tone.ring} 30%, transparent)`,
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ── Doer ───────────────────────────────────────────────────────────────────
/**
 * A brief "saved" tint on the cell that was just edited.
 *
 * The toast confirms the write, but it appears in a corner far from the cell
 * the user is looking at — on a wide table that is easy to miss entirely. This
 * marks the change AT the point of interaction, then fades, so the row does not
 * accumulate permanent decoration.
 */
function useSavedFlash(ms = 1400): [boolean, () => void] {
  const [on, setOn] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flash = React.useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, flash];
}

/** Shared styling for the saved flash — a soft green seat, no layout shift. */
const savedStyle = (on: boolean) =>
  on
    ? {
        background: "color-mix(in srgb, #16a34a 14%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, #16a34a 45%, transparent)",
      }
    : undefined;

export function InlineDoerCell({
  taskId,
  doerId,
  doerName,
  employees,
  editable,
}: {
  taskId: string;
  doerId: string;
  doerName: string | null;
  employees: { id: string; name: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [name, setName] = React.useState(doerName);
  React.useEffect(() => setName(doerName), [doerName]);

  // Text name only — no initials avatar chip (the column reads cleaner, and the
  // 32px circle was pure decoration next to a name that's already spelled out).
  // `truncate` + `title`: the column is narrow, so a long name clips and the
  // full spelling comes back on hover.
  const display = name ? (
    <span className="block truncate text-ink-strong font-bold" title={name} style={{ fontSize: 15 }}>
      {name}
    </span>
  ) : (
    <span className="text-ink-subtle">—</span>
  );

  if (!editable) return display;

  const filtered = q.trim()
    ? employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    : employees;

  async function pick(id: string, nm: string) {
    setOpen(false);
    setQ("");
    if (id === doerId) return;
    const prev = name;
    setName(nm);
    setPending(true);
    try {
      const res = await reassignDoer(taskId, id);
      if (!res.ok) {
        setName(prev);
        fireToast({ message: res.error || "Could not reassign." });
      } else {
        fireToast({ message: `Reassigned to ${nm}.` });
        // The cell already shows the new doer. Reconcile server-derived fields
        // in ONE coalesced background pass rather than re-fetching the whole
        // view per edit — see lib/client/reconcile.
        scheduleReconcile(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          // min-w-0 + max-w-full: without them the flex item refuses to shrink
          // below its content, so the name inside would never actually clip.
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-pill px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{ cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1 }}
          aria-label="Reassign doer"
        >
          <span className="min-w-0 truncate">{display}</span>
          {pending ? (
            <Loader2 size={12} className="shrink-0" style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[240px] rounded-chip border bg-surface-card p-1.5"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <div className="relative mb-1.5">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" strokeWidth={2.2} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 pl-8 pr-2 rounded-chip border border-hairline bg-surface-soft text-[14px] outline-none focus:border-altus-red"
            />
          </div>
          <ul role="listbox" className="max-h-[260px] overflow-y-auto">
            {filtered.map((e) => {
              const sel = e.id === doerId;
              return (
                <li
                  key={e.id}
                  role="option"
                  aria-selected={sel}
                  onClick={(ev) => { ev.stopPropagation(); void pick(e.id, e.name); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-chip text-[14px] cursor-pointer hover:bg-surface-soft"
                  style={{ fontWeight: sel ? 700 : 500 }}
                >
                  <span className="flex-1 text-ink-strong">{e.name}</span>
                  {sel && <Check size={14} strokeWidth={2.6} className="text-altus-red" />}
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-3 text-center text-[13px] text-ink-subtle">No match</li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Priority ─────────────────────────────────────────────────────────────────
export function InlinePriorityCell({
  taskId,
  priority,
  editable,
}: {
  taskId: string;
  priority: TaskPriority;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<TaskPriority>(priority);
  React.useEffect(() => setShown(priority), [priority]);

  const chip = shown === "imp_urgent" ? <CriticalBadge /> : <PriorityPill priority={shown} />;
  if (!editable) return chip;

  async function pick(p: TaskPriority) {
    setOpen(false);
    if (p === shown) return;
    const prev = shown;
    setShown(p);
    setPending(true);
    try {
      const res = await setTaskPriority(taskId, p);
      if (!res.ok) {
        setShown(prev);
        fireToast({ message: res.error || "Could not change priority." });
      } else {
        fireToast({ message: `Priority set to ${PRIORITY_LABELS[p]}.` });
        scheduleReconcile(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{ cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1 }}
          aria-label="Change priority"
        >
          {chip}
          {pending ? (
            <Loader2 size={12} className="shrink-0" style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] min-w-[180px] rounded-chip border bg-surface-card p-1"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <ul role="listbox">
            {TASK_PRIORITIES.map((p) => {
              const sel = p === shown;
              return (
                <li
                  key={p}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => { e.stopPropagation(); void pick(p); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-chip text-[14px] cursor-pointer hover:bg-surface-soft"
                  style={{ fontWeight: sel ? 700 : 500 }}
                >
                  {/* The same pill the cell shows, so you pick the colour you
                      are about to see rather than a word you then have to
                      translate. */}
                  <span className="flex-1">
                    <PriorityPill priority={p} />
                  </span>
                  {sel && <Check size={14} strokeWidth={2.6} className="text-altus-red" />}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Due date ─────────────────────────────────────────────────────────────────
export function InlineDueCell({
  taskId,
  dueAt,
  status,
  editable,
}: {
  taskId: string;
  dueAt: Date | null;
  status: TaskStatus;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<Date | null>(dueAt);
  const [saved, flashSaved] = useSavedFlash();
  React.useEffect(() => setShown(dueAt), [dueAt]);

  /**
   * The draft date, held here rather than written straight through.
   *
   * THE BUG THIS FIXES: a native `<input type="date">` fires `change` the moment
   * the three segments form a valid date — so typing the day fired a save, the
   * popover closed under the cursor, and the month and year had to be set by
   * re-opening it and starting again. Editing one date meant eight passes.
   *
   * Now nothing is written until the tick (or Enter). The popover stays open,
   * every segment can be typed in any order, and the date can be changed as
   * often as you like before it counts. Escape / clicking away discards.
   *
   * Declared HERE, above the `!editable` early return — a hook after that
   * return would run only for editable cells and break the hook order.
   */
  const [draft, setDraft] = React.useState(() => toYmd(dueAt));

  const u = dueColor(shown, status);
  const display = (
    <span
      className="text-body-lg tabular-nums"
      style={{ color: u.color, fontWeight: u.strong ? 600 : undefined }}
    >
      {safeDate(shown)}
    </span>
  );
  if (!editable) return display;

  async function commit(ymd: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    setOpen(false);
    const prev = shown;
    setShown(new Date(`${ymd}T12:00:00+05:30`));
    setPending(true);
    try {
      const res = await rescheduleTask(taskId, ymd);
      if (!res.ok) {
        setShown(prev);
        fireToast({ message: res.error || "Could not reschedule." });
      } else {
        flashSaved();
        fireToast({ message: "Due date updated." });
        scheduleReconcile(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft);
  const dirty = draft !== toYmd(shown);

  // Re-seed the draft from the row each time the popover OPENS, not on every
  // render — otherwise a background refresh mid-edit would wipe what was typed.
  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) setDraft(toYmd(shown));
    setOpen(next);
  }

  function confirm() {
    if (!valid) return;
    if (!dirty) {
      setOpen(false); // nothing changed — close quietly, no write, no toast
      return;
    }
    void commit(draft);
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-chip px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            ...savedStyle(saved),
          }}
          aria-label="Reschedule due date"
        >
          {display}
          {/* Confirmation at the point of interaction, not just in a corner
              toast the eye may never reach on a wide table. */}
          {saved && (
            <Check size={13} strokeWidth={3} aria-hidden style={{ color: "#15803d" }} />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] rounded-chip border bg-surface-card p-3"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <label
            htmlFor={`due-${taskId}`}
            className="block text-[12px] font-bold text-ink-subtle uppercase tracking-[0.06em] mb-1.5"
          >
            Due date
          </label>
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              id={`due-${taskId}`}
              type="date"
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              // Enter commits, Escape discards. Both are stopped from bubbling:
              // Enter would otherwise reach the row (which opens the task) and
              // Escape is handled here so the draft is cleared on the way out.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  confirm();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setDraft(toYmd(shown));
                  setOpen(false);
                }
              }}
              className="h-10 px-3 rounded-chip border border-hairline bg-surface-soft text-[14px] outline-none focus:border-altus-red"
            />
            {/* The tick. Nothing is saved until this (or Enter) — the whole
                point of the change, so it sits beside the field rather than
                anywhere the eye has to travel to find it. */}
            <button
              type="button"
              onClick={confirm}
              disabled={!valid || pending}
              title={dirty ? "Save due date (Enter)" : "Close (nothing changed)"}
              aria-label="Save due date"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-chip border transition-colors disabled:opacity-40"
              style={{
                borderColor: dirty && valid ? "#15803d" : "var(--color-hairline-strong)",
                background:
                  dirty && valid ? "color-mix(in srgb, #16a34a 12%, transparent)" : "transparent",
                color: dirty && valid ? "#15803d" : "var(--color-ink-subtle)",
                cursor: !valid || pending ? "default" : "pointer",
              }}
            >
              {pending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Check size={17} strokeWidth={3} aria-hidden />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-ink-subtle">
            Enter or ✓ to save · Esc to cancel
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
