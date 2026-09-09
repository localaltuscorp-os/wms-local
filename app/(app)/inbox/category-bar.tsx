"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  NOTIFICATION_CATEGORIES,
  CATEGORY_LABELS,
  type NotificationCategory,
} from "@/lib/notifications/categories";

/**
 * The Inbox filter bar — seven category buttons plus "All".
 *
 * REPLACES the ten-module shortcut row (`components/layout/module-bar.tsx`)
 * that used to sit here. That row was navigation dressed as a toolbar: every
 * button took you OFF the Inbox, which is the opposite of what a bar at the top
 * of a list should do. These filter the list in place.
 *
 * Server-driven on purpose — each button is a real `?cat=` link, so the filter
 * survives a refresh, is shareable, and pages correctly (the "Load older"
 * cursor carries the category with it). No client state to fall out of sync.
 *
 * Counts come from `countInboxByKind` and cover the WHOLE inbox, not the page
 * on screen, so a category with nothing in it reads as empty instead of merely
 * "not on this page".
 */
export function CategoryBar({
  active,
  counts,
}: {
  active: NotificationCategory | undefined;
  /** category → { total, unread } across the entire inbox. */
  counts: Record<string, { total: number; unread: number }>;
}) {
  const allTotal = Object.values(counts).reduce((s, c) => s + c.total, 0);
  const allUnread = Object.values(counts).reduce((s, c) => s + c.unread, 0);

  return (
    <nav
      aria-label="Filter notifications by category"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar"
    >
      <Tab
        href={"/inbox" as Route}
        label="All"
        total={allTotal}
        unread={allUnread}
        active={active === undefined}
      />
      {NOTIFICATION_CATEGORIES.map((c) => (
        <Tab
          key={c}
          href={`/inbox?cat=${c}` as Route}
          label={CATEGORY_LABELS[c]}
          total={counts[c]?.total ?? 0}
          unread={counts[c]?.unread ?? 0}
          active={active === c}
        />
      ))}
    </nav>
  );
}

function Tab({
  href,
  label,
  total,
  unread,
  active,
}: {
  href: Route;
  label: string;
  total: number;
  unread: number;
  active: boolean;
}) {
  const empty = total === 0;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={
        empty
          ? `${label} — nothing here`
          : `${label} — ${total} notification${total === 1 ? "" : "s"}${unread > 0 ? `, ${unread} unread` : ""}`
      }
      className="group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_9%,transparent)] hover:text-[var(--color-altus-red)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/45"
      style={{
        color: active
          ? "var(--color-altus-red)"
          : empty
            ? "rgba(15,23,42,0.34)"
            : "rgba(15,23,42,0.62)",
        ...(active
          ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" }
          : null),
      }}
    >
      {label}
      {/* Unread leads when there is any — it is the number you act on. The
          plain total shows otherwise so an all-read category still reads as
          "has things in it" rather than looking empty. */}
      {unread > 0 ? (
        <span
          className="inline-flex min-w-[17px] items-center justify-center rounded-pill px-1 text-[10.5px] font-black tabular-nums text-white"
          style={{ background: "var(--color-altus-red)" }}
        >
          {unread}
        </span>
      ) : (
        <span className="text-[11px] font-bold tabular-nums opacity-45">{total}</span>
      )}
    </Link>
  );
}
