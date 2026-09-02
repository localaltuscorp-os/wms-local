"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Calendar,
  Users,
  RotateCcw,
  SlidersHorizontal,
  Bell,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "task_assigned", label: "Task assigned" },
  { value: "task_initiated", label: "Task initiated" },
  { value: "status_changed", label: "Status changed" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "reassigned", label: "Reassigned" },
  { value: "transferred", label: "Transferred" },
  { value: "cancelled", label: "Cancelled" },
  { value: "commented", label: "Commented" },
  { value: "overdue_digest", label: "Overdue digest" },
];

interface Props {
  employees: { value: string; label: string }[];
  initial: {
    kinds: string[];
    recipientIds: string[];
    failuresOnly: boolean;
    /** yyyy-mm-dd */
    from: string;
    /** yyyy-mm-dd — written to ?dto= so it doesn't collide with the
        `?to=` recipient param. */
    to: string;
  };
}

/**
 * Sticky filter bar for /admin/notifications.  Visual + behavioural twin of
 * {@link components/admin/activity-filter-bar.tsx} — same glass header,
 * same chip vocabulary, same Reset / Apply buttons — but wired to the
 * notification-specific params:
 *  - ?kind=<NotificationKind>,...
 *  - ?to=<userId>,...        (recipient filter; reuses inbox cursor name)
 *  - ?from=<yyyy-mm-dd>      (date lower bound)
 *  - ?dto=<yyyy-mm-dd>       (date upper bound)
 *  - ?fail=1                 (only rows where every channel failed/missed)
 *
 * Applying drops the `?before=` cursor so the new filters page back to the
 * newest matching rows.
 */
export function NotificationFilterBar({ employees, initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [kinds, setKinds] = React.useState<string[]>(initial.kinds);
  const [recipientIds, setRecipientIds] = React.useState<string[]>(
    initial.recipientIds,
  );
  const [failuresOnly, setFailuresOnly] = React.useState<boolean>(
    initial.failuresOnly,
  );
  const [from, setFrom] = React.useState<string>(initial.from);
  const [to, setTo] = React.useState<string>(initial.to);

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("before");

    if (kinds.length > 0) sp.set("kind", kinds.join(","));
    else sp.delete("kind");

    if (recipientIds.length > 0) sp.set("to", recipientIds.join(","));
    else sp.delete("to");

    if (failuresOnly) sp.set("fail", "1");
    else sp.delete("fail");

    if (from) sp.set("from", from);
    else sp.delete("from");

    if (to) sp.set("dto", to);
    else sp.delete("dto");

    startTransition(() => {
      const qs = sp.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as any);
    });
  }

  // Auto-apply: push the new query string whenever a filter changes, debounced
  // so toggling several options coalesces into one navigation. First render is
  // skipped — the page already matches the initial params.
  const didMount = React.useRef(false);
  React.useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(apply, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds, recipientIds, failuresOnly, from, to]);

  function reset() {
    // Just clear state — the auto-apply effect navigates (and drops ?before=).
    setKinds([]);
    setRecipientIds([]);
    setFailuresOnly(false);
    setFrom("");
    setTo("");
  }

  const activeCount =
    (kinds.length > 0 ? 1 : 0) +
    (recipientIds.length > 0 ? 1 : 0) +
    (failuresOnly ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  return (
    <div
      className="sticky top-0 z-30 border-b border-hairline -mx-8 px-8 mb-4"
      style={{
        backgroundColor: "rgba(250, 251, 252, 0.85)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3 py-4">
        <span
          className="inline-flex items-center gap-1.5 text-table-head mr-1"
          style={{ color: "var(--color-ink-subtle)" }}
        >
          <SlidersHorizontal size={14} strokeWidth={2.4} />
          Filters
          {activeCount > 0 && (
            <span
              className="ml-1 inline-flex items-center justify-center rounded-full text-white"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                background: "var(--color-altus-red)",
              }}
            >
              {activeCount}
            </span>
          )}
        </span>

        {/* Date range — two simple inputs, no popover */}
        <label className="filter-chip">
          <Calendar size={16} className="text-ink-subtle" strokeWidth={2} />
          <span className="text-[12px] uppercase tracking-wide text-ink-subtle">
            From
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-transparent outline-none text-chip text-ink-strong tabular-nums"
            style={{ minWidth: 130 }}
          />
        </label>
        <label className="filter-chip">
          <Calendar size={16} className="text-ink-subtle" strokeWidth={2} />
          <span className="text-[11px] uppercase tracking-wide text-ink-subtle">
            To
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-transparent outline-none text-chip text-ink-strong tabular-nums"
            style={{ minWidth: 130 }}
          />
        </label>

        {/* Kind */}
        <div className="filter-chip">
          <Bell size={16} className="text-ink-subtle" strokeWidth={2} />
          <MultiSelect
            options={KIND_OPTIONS}
            selected={kinds}
            onChange={setKinds}
            placeholder="All kinds"
          />
        </div>

        {/* Recipient */}
        <div className="filter-chip">
          <Users size={16} className="text-ink-subtle" strokeWidth={2} />
          <MultiSelect
            options={employees}
            selected={recipientIds}
            onChange={setRecipientIds}
            placeholder="All recipients"
          />
        </div>

        {/* Failures-only toggle — styled like a filter-chip so the bar
            keeps its tactile rhythm.  Click anywhere on the chip flips
            the hidden checkbox; the chip tints red when active. */}
        <label
          className="filter-chip cursor-pointer select-none"
          style={
            failuresOnly
              ? {
                  borderColor:
                    "color-mix(in srgb, var(--color-red) 35%, transparent)",
                  background:
                    "color-mix(in srgb, var(--color-red) 8%, transparent)",
                }
              : undefined
          }
        >
          <AlertCircle
            size={16}
            strokeWidth={2}
            style={{
              color: failuresOnly
                ? "var(--color-red)"
                : "var(--color-ink-subtle)",
            }}
          />
          <input
            type="checkbox"
            checked={failuresOnly}
            onChange={(e) => setFailuresOnly(e.target.checked)}
            className="sr-only"
          />
          <span
            className="text-chip"
            style={{
              color: failuresOnly
                ? "var(--color-red-deep)"
                : "var(--color-ink-strong)",
              fontWeight: failuresOnly ? 600 : 500,
            }}
          >
            Failures only
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-chip text-ink-subtle hover:text-ink-strong transition-colors px-3 py-2 rounded-chip"
            aria-label="Reset filters"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            Reset
          </button>
          {/* Filters auto-apply — no Apply button. This just confirms a refresh
              is in flight. */}
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-chip text-ink-subtle transition-opacity"
            style={{ opacity: isPending ? 1 : 0 }}
          >
            <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
            Updating…
          </span>
        </div>
      </div>
    </div>
  );
}
