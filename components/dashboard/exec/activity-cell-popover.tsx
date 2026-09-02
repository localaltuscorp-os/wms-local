"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowRight, Loader2 } from "lucide-react";
import { getActivityPreview } from "@/app/(app)/dashboard/manager-activity-actions";
import {
  PREVIEW_LIMIT,
  type ActivityCategory,
  type ActivityPreview,
  type ActivityPreviewItem,
  type ActivitySplitKey,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";

/**
 * Hover preview for one activity count on the manager board.
 *
 * The list is fetched ON HOVER, not with the board. The board renders hundreds
 * of cells and a reader points at a handful, so shipping every list up front
 * would be a few hundred wasted item queries per page view.
 *
 * Radix Tooltip, matching the Status-by-Doer cell preview beside it. Radix
 * tooltip content is hoverable by default, so the reader can move the pointer
 * INTO this list and reach its rows and its footer link — the behaviour
 * HoverCard would give, without adding a dependency the project does not have.
 */

/** Where each family's "View all" footer and cell click lead. */
const CATEGORY_ROUTE: Record<ActivityCategory, string> = {
  goals: "/goals",
  tasks: "/tasks",
  // NOT "/plan-my-day" — that route does not exist in this app. The My Day
  // surface is /my-day (app/(app)/my-day/page.tsx).
  commitments: "/my-day",
};

/**
 * The destination for a cell, carrying its full context as query params.
 *
 * Every family gets the same four params so the three destinations can read one
 * contract. /tasks additionally understands `manager`/`doer` as aliases for its
 * own initiator/assignee filters, so a Tasks click lands genuinely filtered
 * rather than merely annotated.
 */
export function activityHref(
  managerId: string,
  memberId: string,
  category: ActivityCategory,
  split: ActivitySplitKey,
): Route {
  const sp = new URLSearchParams({
    manager: managerId,
    member: memberId,
    category,
    type: split === "delegate" ? "A_delegate" : split === "counterpart" ? "B_counterpart" : "GT",
  });
  // /tasks reads `doer` as its assignee filter; the other two read `member`.
  if (category === "tasks") sp.set("doer", memberId);
  return `${CATEGORY_ROUTE[category]}?${sp.toString()}` as Route;
}

function ToneBadge({ item }: { item: ActivityPreviewItem }) {
  if (!item.meta) return null;
  const tone = item.tone;
  const style =
    tone === "urgent"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }
      : tone === "done"
        ? { background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }
        : tone === "pending"
          ? { background: "color-mix(in srgb, var(--color-amber) 16%, transparent)", color: "var(--color-amber-deep)" }
          : { background: "rgba(15,23,42,0.06)", color: "var(--color-ink-muted)" };
  return (
    <span
      className="shrink-0 truncate rounded-chip px-1.5 py-px text-[10px] font-bold"
      style={{ maxWidth: 120, ...style }}
    >
      {item.meta}
    </span>
  );
}

/** The SLA line as a pill — red when late, amber on the day, plain otherwise. */
function SlaPill({ text, tone }: { text: string; tone: "overdue" | "today" | null }) {
  const cls =
    tone === "overdue"
      ? "text-red-600 bg-red-50"
      : tone === "today"
        ? "text-amber-700 bg-amber-50"
        : "text-slate-500 bg-slate-50";
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${cls}`}
    >
      {text}
    </span>
  );
}

export function ActivityCellPopover({
  children,
  managerId,
  memberId,
  memberName,
  category,
  categoryLabel,
  split,
  period,
  custom,
  count,
}: {
  children: React.ReactNode;
  managerId: string;
  memberId: string;
  memberName: string;
  category: ActivityCategory;
  categoryLabel: string;
  split: ActivitySplitKey;
  period: ActivityPeriod;
  /** Applied custom window, when the period is `custom`. Threaded so a
   *  preview can never be fetched over a different range than its cell. */
  custom?: { from: string; to: string } | null;
  count: number;
}) {
  const [state, setState] = React.useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "ok"; data: ActivityPreview }
  >({ kind: "idle" });

  // Fetch on FIRST open only. Re-opening the same cell reuses what it already
  // has; the numbers behind it cannot change without a board refetch anyway.
  const load = React.useCallback(() => {
    setState((cur) => {
      if (cur.kind !== "idle") return cur;
      void getActivityPreview({ managerId, memberId, category, split, period, custom }).then((res) => {
        setState("error" in res ? { kind: "error" } : { kind: "ok", data: res });
      });
      return { kind: "loading" };
    });
  }, [managerId, memberId, category, split, period, custom]);

  const href = activityHref(managerId, memberId, category, split);

  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={200}>
      <Tooltip.Root onOpenChange={(open) => open && load()}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          /* 380px, not the old 320. Note the spec's `w-[320px] max-w-[380px]`
             would NOT have widened anything — a max above a fixed width never
             binds — and widening is the point, so the fixed width is the number
             that moved. The viewport clamp still wins on a narrow screen. */
          className="z-50 w-[380px] max-w-[380px] overflow-hidden rounded-xl border shadow-lg"
          style={{
            background: "var(--color-surface-card)",
            borderColor: "var(--color-hairline-strong)",
            maxWidth: "min(380px, calc(100vw - 32px))",
          }}
        >
          <div className="px-3 pt-2.5 pb-1.5">
            <p className="text-[12px] font-black leading-tight text-ink-strong">
              {memberName}
              <span className="mx-1.5 text-ink-subtle">•</span>
              {categoryLabel}
              <span className="ml-1 tabular-nums text-ink-soft">({count})</span>
            </p>
          </div>

          {state.kind === "loading" && (
            <div className="flex items-center justify-center gap-2 border-t py-6 text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>
              <Loader2 size={14} className="animate-spin" strokeWidth={2.4} />
              <span className="text-[11.5px] font-semibold">Loading…</span>
            </div>
          )}

          {state.kind === "error" && (
            <div className="border-t px-3 py-5 text-center" style={{ borderColor: "var(--color-hairline)" }}>
              <p className="text-[11.5px] font-semibold text-ink-subtle">Could not load this list.</p>
            </div>
          )}

          {state.kind === "ok" && state.data.items.length === 0 && (
            <div className="border-t px-3 py-5 text-center" style={{ borderColor: "var(--color-hairline)" }}>
              <p className="text-[11.5px] font-semibold text-ink-subtle">Nothing to show.</p>
            </div>
          )}

          {state.kind === "ok" && state.data.items.length > 0 && (
            <ul className="flex flex-col gap-1 border-t p-1.5" style={{ borderColor: "var(--color-hairline)" }}>
              {state.data.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-100 p-2.5 transition-colors hover:bg-slate-50"
                >
                  {/* The description gets the FULL row width and wraps to two
                      lines. It used to share its line with the SLA, which left
                      a long description about half the card to work with;
                      `break-words` keeps an unbroken token (a URL, a long ref)
                      from forcing a horizontal overflow instead of wrapping. */}
                  <span
                    className="block line-clamp-2 break-words text-xs font-semibold leading-snug text-slate-900"
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  {(item.meta || item.trailing) && (
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <ToneBadge item={item} />
                      {item.trailing && (
                        <SlaPill text={item.trailing} tone={item.trailingTone} />
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="border-t px-3 py-2" style={{ borderColor: "var(--color-hairline)" }}>
            <Link
              href={href}
              className="group inline-flex items-center gap-1.5 text-[11.5px] font-black text-altus-red transition-colors hover:text-altus-red-deep"
            >
              View all {count} item{count === 1 ? "" : "s"}
              <ArrowRight size={12} strokeWidth={2.8} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            {state.kind === "ok" && state.data.total > state.data.items.length && (
              <span className="ml-2 text-[10.5px] font-semibold text-ink-subtle">
                showing first {PREVIEW_LIMIT}
              </span>
            )}
          </div>
          <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
