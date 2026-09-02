"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import {
  DOER_TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import { STATUS_TONES_FALLBACK, statusBadgeStyle } from "@/lib/format";

interface Props {
  taskId: string;
  status: TaskStatus;
  updatedAt: Date;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  /** No longer changes the option list — everyone now picks from the same six
   *  DOER_TASK_STATUSES. Kept because every call site passes it and the server
   *  still branches on the actor's role when validating the transition. */
  isAdmin: boolean;
  /** When false, the cell renders a STATIC status badge (no dropdown) — the
   *  current user isn't allowed to change this task's status. */
  editable: boolean;
}

/**
 * Uniform pill geometry, shared by the editable trigger and the read-only
 * badge so a column of mixed rows reads as one column of identical chips.
 *
 * `min-w` rather than a hard `w-`: status labels are ADMIN-EDITABLE (the
 * `status_settings` table), so a fixed width would silently truncate a custom
 * label like "Waiting on client". 140px clears the longest built-in label
 * ("Not Approved") with the dot, both gaps, the chevron and the horizontal
 * padding, so in practice every stock status renders at exactly this width —
 * and an unusually long custom one grows instead of being cut off.
 */
const BADGE_WIDTH = "min-w-[140px]";
const BADGE_SHELL =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-bold tabular-nums whitespace-nowrap";

/**
 * The label takes the leftover space and centres itself INSIDE it. That is what
 * keeps the dot hard against the left padding and the chevron hard against the
 * right one at every label length — centring the whole dot+label+chevron group
 * instead (a bare `justify-center`) would slide both markers inward on short
 * labels like "Done" and they'd no longer line up down the column.
 */
const BADGE_LABEL = "flex-1 text-center";

/**
 * Click-to-edit status chip for the tasks table. Server-side action
 * `setTaskStatus` validates the transition (canTransitionTo) and the
 * optimistic-lock, so the client just needs to ship the request and
 * react to ok / error.
 */
export function InlineStatusCell({
  taskId,
  status,
  updatedAt,
  labels,
  tones,
  editable,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  // Track the optimistic value so the chip flips immediately while the
  // server confirms; rolls back on error.
  const [shown, setShown] = React.useState<TaskStatus>(status);
  React.useEffect(() => setShown(status), [status]);
  // Hold the optimistic-lock token CLIENT-SIDE so a rapid second flip uses the
  // fresh `updatedAt` the server just returned — without waiting for a full
  // refresh to re-prop it (Operation Butter P1). Re-syncs whenever the row's
  // server `updatedAt` changes (e.g. a realtime reconcile or someone else's
  // edit).
  const [lockAt, setLockAt] = React.useState(updatedAt.toISOString());
  React.useEffect(() => setLockAt(updatedAt.toISOString()), [updatedAt]);

  // ONE list for everybody — the six doer statuses. Admins used to get
  // ADMIN_TASK_STATUSES here, which mixed the worker's progress states in with
  // `on_hold` and the approval verdicts and made this chip do two unrelated
  // jobs. The manager's rulings now live in their own "Manager Status" control, so
  // this dropdown answers exactly one question: how far along is the work?
  //
  // A row already sitting on a status outside the list (a legacy `approved`,
  // say) still RENDERS it — `shown` is drawn from the row, not from `options` —
  // it just can't be re-selected here.
  const options: readonly TaskStatus[] = DOER_TASK_STATUSES;

  // Keyboard roving-focus for the hand-rolled listbox: Radix gives no roving
  // focus to arbitrary children, so we drive a single active option ourselves
  // and focus the <ul> on open (mouse behaviour is untouched).
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Seed the active option to the currently-shown status each time the menu
  // opens, then move focus into the list so arrow keys work immediately.
  React.useEffect(() => {
    if (!open) return;
    const sel = options.indexOf(shown);
    setActiveIndex(sel >= 0 ? sel : 0);
    // Focus after the portal mounts.
    requestAnimationFrame(() => listRef.current?.focus());
  }, [open, options, shown]);

  // Keep the active option in view as it moves.
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  function listKeyDown(e: React.KeyboardEvent) {
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const next = options[activeIndex];
      if (next) void pick(next);
    }
    // Esc is handled by Radix (closes + returns focus to the trigger).
  }

  // `||` (not `??`) so an empty/blank token also falls back to the
  // canonical per-status colour — guarantees every status renders coloured.
  const tone = tones[shown] || STATUS_TONES_FALLBACK[shown];
  // The four badge colours (fill / ink / hairline / dot), resolved from ONE
  // place so the trigger, the read-only badge and the menu rows below can never
  // drift apart. See STATUS_BADGE_STYLES in lib/format.ts for why these are
  // literal rather than derived from --color-<tone>.
  const badge = statusBadgeStyle(tone);

  async function pick(next: TaskStatus) {
    setOpen(false);
    if (next === shown) return;
    const prev = shown;
    setShown(next);
    setPending(true);
    try {
      const res = await setTaskStatus(taskId, next, lockAt);
      if (!res.ok) {
        setShown(prev);
        const msg =
          res.error === "forbidden"
            ? "Not allowed to make that transition."
            : res.error === "stale"
              ? "This row was changed elsewhere — refreshing."
              : res.message ?? "Could not update status.";
        fireToast({ message: msg });
        // Stale = our token is behind the row; pull the truth right away.
        if (res.error === "stale") router.refresh();
      } else {
        // Advance the lock token so a follow-up flip needs no refresh first.
        setLockAt(res.updatedAt);
        fireToast({ message: `Doer status set to ${labels[next]}.` });
        // The chip already flipped optimistically; reconcile server-derived
        // fields (late badge, stat cards) in ONE coalesced background refresh
        // instead of a full re-fetch on every click.
        scheduleReconcile(() => router.refresh());
      }
    } finally {
      setPending(false);
    }
  }

  // Not editable by this user (not admin / not their task, or terminal status)
  // → render a STATIC coloured badge. No dropdown, no chevron, not clickable.
  if (!editable) {
    return (
      <span
        aria-label={`Doer status: ${labels[shown] ?? shown}`}
        className={`${BADGE_SHELL} ${BADGE_WIDTH}`}
        style={{
          background: badge.bg,
          color: badge.ink,
          border: `1px solid ${badge.border}`,
        }}
      >
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full shrink-0"
          style={{ background: badge.dot }}
        />
        <span className={BADGE_LABEL}>{labels[shown] ?? shown}</span>
        {/* Occupies exactly the chevron's footprint so a read-only badge and an
            editable one centre their label on the same axis — the two render
            side by side in the same column. */}
        <span aria-hidden className="w-3 shrink-0" />
      </span>
    );
  }

  // Popover is rendered via Radix Portal so the menu escapes the table
  // cell's `overflow-hidden` (used for text ellipsis on long titles). The
  // earlier absolute-positioned <ul> was clipped to a sliver inside the cell.
  return (
    <Popover.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Doer status: ${labels[shown] ?? shown}. Click to change.`}
          className={`${BADGE_SHELL} ${BADGE_WIDTH} transition-all hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40`}
          style={{
            background: badge.bg,
            color: badge.ink,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            border: `1px solid ${badge.border}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        >
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full shrink-0"
            style={{ background: badge.dot }}
          />
          <span className={BADGE_LABEL}>{labels[shown] ?? shown}</span>
          {/* Both markers are 12px and `shrink-0`, so swapping the chevron for
              the spinner mid-save cannot nudge the label off-centre. */}
          {pending ? (
            <Loader2
              size={12}
              strokeWidth={2.4}
              className="shrink-0"
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} className="shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[60] min-w-[200px] max-md:min-w-[170px] max-h-[280px] overflow-y-auto rounded-chip border bg-surface-card"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Set doer status"
            tabIndex={-1}
            aria-activedescendant={`${listId}-opt-${activeIndex}`}
            onKeyDown={listKeyDown}
            className="outline-none"
          >
            {options.map((s, i) => {
              const sel = s === shown;
              const optBadge = statusBadgeStyle(tones[s] || STATUS_TONES_FALLBACK[s]);
              return (
                <li
                  key={s}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => {
                    e.stopPropagation();
                    void pick(s);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] cursor-pointer transition-colors"
                  style={{
                    background: sel
                      ? "color-mix(in srgb, var(--color-altus-red) 7%, transparent)"
                      : i === activeIndex
                        ? "var(--color-surface-soft)"
                        : "transparent",
                    fontWeight: sel ? 700 : 500,
                  }}
                  onMouseEnter={(e) => {
                    setActiveIndex(i);
                    if (!sel)
                      e.currentTarget.style.background =
                        "var(--color-surface-soft)";
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full shrink-0"
                    style={{
                      background: optBadge.dot,
                      // Inset ring keeps light tones (yellow, light-grey)
                      // visible on the white menu instead of a glow that
                      // washes them out.
                      boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.18)",
                    }}
                  />
                  <span
                    className="flex-1"
                    style={{ color: "var(--color-ink-strong)" }}
                  >
                    {labels[s] ?? s}
                  </span>
                  {sel && (
                    <Check
                      size={14}
                      strokeWidth={2.6}
                      style={{ color: "var(--color-altus-red)" }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
