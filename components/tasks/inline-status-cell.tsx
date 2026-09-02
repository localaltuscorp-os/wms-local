"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import {
  USER_TASK_STATUSES,
  ADMIN_TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { STATUS_TONES_FALLBACK } from "@/lib/format";

interface Props {
  taskId: string;
  status: TaskStatus;
  updatedAt: Date;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  /** Admin can move to any value, including the legacy verdict statuses.
   *  Non-admins are limited to USER_TASK_STATUSES. */
  isAdmin: boolean;
}

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
  isAdmin,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  // Track the optimistic value so the chip flips immediately while the
  // server confirms; rolls back on error.
  const [shown, setShown] = React.useState<TaskStatus>(status);
  React.useEffect(() => setShown(status), [status]);

  // Non-admins get the curated lifecycle list; admins see everything so
  // they can recover legacy rows or force a state.
  const options: readonly TaskStatus[] = isAdmin
    ? ADMIN_TASK_STATUSES
    : USER_TASK_STATUSES;

  // `||` (not `??`) so an empty/blank token also falls back to the
  // canonical per-status colour — guarantees every status renders coloured.
  const tone = tones[shown] || STATUS_TONES_FALLBACK[shown];

  async function pick(next: TaskStatus) {
    setOpen(false);
    if (next === shown) return;
    const prev = shown;
    setShown(next);
    setPending(true);
    try {
      const res = await setTaskStatus(
        taskId,
        next,
        updatedAt.toISOString(),
      );
      if (!res.ok) {
        setShown(prev);
        const msg =
          res.error === "forbidden"
            ? "Not allowed to make that transition."
            : res.error === "stale"
              ? "This row was changed elsewhere — refreshing."
              : res.message ?? "Could not update status.";
        fireToast({ message: msg });
        if (res.error === "stale") router.refresh();
      } else {
        fireToast({ message: `Status set to ${labels[next]}.` });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
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
          aria-label={`Status: ${labels[shown] ?? shown}. Click to change.`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-bold tabular-nums transition-colors"
          style={{
            background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
            color: `var(--color-${tone}-deep)`,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
          }}
        >
          {labels[shown] ?? shown}
          {pending ? (
            <Loader2
              size={12}
              strokeWidth={2.4}
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} />
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
          <ul role="listbox" aria-label="Set task status">
            {options.map((s) => {
              const sel = s === shown;
              const t = tones[s] || STATUS_TONES_FALLBACK[s];
              return (
                <li
                  key={s}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => {
                    e.stopPropagation();
                    void pick(s);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] cursor-pointer transition-colors"
                  style={{
                    background: sel ? "var(--vp-cyan-tint)" : "transparent",
                    fontWeight: sel ? 700 : 500,
                  }}
                  onMouseEnter={(e) => {
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
                      background: `var(--color-${t})`,
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
                      style={{ color: "rgb(var(--vp-cyan-deep))" }}
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
