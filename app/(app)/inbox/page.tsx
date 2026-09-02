import Link from "next/link";
import type { Route } from "next";
import { Inbox as InboxIcon } from "lucide-react";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { requireUser } from "@/lib/auth/current";
import { countInboxByKind, listInboxNotifications } from "@/lib/queries/notifications";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import {
  NOTIFICATION_CATEGORIES,
  categoryOfKind,
  kindsInCategory,
  parseCategory,
} from "@/lib/notifications/categories";
import type { NotificationKind } from "@/db/schema";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { CategoryBar } from "./category-bar";
import { InboxList } from "./inbox-list";
import { MarkAllButton } from "./mark-all-button";

// SSR-only for now — realtime push will land with the websocket pass.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function InboxPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();

  const beforeRaw = firstString(sp["before"]);
  const before = (() => {
    if (!beforeRaw) return undefined;
    const d = new Date(beforeRaw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  })();

  // Which category the bar is filtering on. An unknown ?cat= is ignored rather
  // than erroring — a stale bookmark should show the whole inbox, not a 500.
  const category = parseCategory(firstString(sp["cat"]));

  const [{ notifications, nextCursor, hasMore }, statusDisplay, kindCounts] =
    await Promise.all([
      listInboxNotifications({
        userId: me.id,
        isAdmin: me.isAdmin,
        before,
        kinds: category ? kindsInCategory(category) : undefined,
      }),
      getStatusDisplayMap(),
      countInboxByKind(me.id),
    ]);

  // Per-kind counts roll up into the seven category buttons.
  const categoryCounts: Record<string, { total: number; unread: number }> =
    Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { total: 0, unread: 0 }]));
  for (const [kind, c] of Object.entries(kindCounts)) {
    const bucket = categoryCounts[categoryOfKind(kind as NotificationKind)];
    if (!bucket) continue;
    bucket.total += c.total;
    bucket.unread += c.unread;
  }

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const isEmpty = notifications.length === 0;
  const hasUnread = notifications.some((n) => n.readAt === null);

  return (
    <>
      {/* Category filter bar. This slot used to hold the ten-module shortcut
          row (`ModuleBar`), which was navigation sitting where a toolbar
          belongs — every button took you OFF the Inbox. It now filters the list
          in place. The logo still links to the Hub, so nothing is lost. */}
      <div
        className="sticky sticky-below-topbar z-30 flex items-center gap-3 border-b border-hairline bg-white px-4 py-2"
      >
        <a href="/hub" aria-label="Back to Hub" className="shrink-0">
          <img src="/logo.png" alt="Altus Corp" className="h-8 w-auto" />
        </a>
        <CategoryBar active={category} counts={categoryCounts} />
        <div className="shrink-0">
          <UserMenuServer />
        </div>
      </div>

      {/* FULL-BLEED. Was `mx-auto max-w-[1500px] px-12`, which left a wide empty
          gutter each side of a list that is mostly one line per row. Gmail runs
          edge to edge and so does this. */}
      <main className="w-full">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            {/* 56px italic serif → a 20px label. A list you scan does not need
                a poster-sized title; the row content is the content. */}
            <h1 className="text-[20px] font-black tracking-tight text-ink-strong">
              Inbox
            </h1>
            <p className="truncate text-[12.5px] font-medium text-ink-muted max-md:hidden">
              Everything happening on tasks you&apos;re part of.
            </p>
          </div>
          {!isEmpty && <MarkAllButton hasUnread={hasUnread} />}
        </header>

        {isEmpty ? (
          <div className="px-4">
            <EmptyState isPaginated={Boolean(before)} isFiltered={Boolean(category)} />
          </div>
        ) : (
          // No card, no radius, no border — the rows ARE the surface, divided
          // by hairlines, exactly as a mail client does it.
          <InboxList
            rows={notifications}
            statusLabels={statusLabels}
            statusTones={statusTones}
          />
        )}

        {hasMore && nextCursor && (
          <div className="flex justify-center border-t border-hairline py-4">
            <Link
              href={`/inbox?before=${encodeURIComponent(nextCursor)}${category ? `&cat=${category}` : ""}` as Route}
              className="rounded-lg border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Load older
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function EmptyState({ isPaginated, isFiltered }: { isPaginated: boolean; isFiltered: boolean }) {
  return (
    <div
      className="bg-surface-card rounded-section border border-hairline p-10 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div
        aria-hidden
        className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-purple) 18%, white), color-mix(in srgb, var(--color-blue) 12%, white))",
          color: "var(--color-purple-deep)",
          border: "1px solid color-mix(in srgb, var(--color-purple) 25%, transparent)",
        }}
      >
        <InboxIcon className="h-6 w-6" />
      </div>
      <h2
        className="font-serif text-ink-strong"
        style={{
          fontSize: 28,
          fontStyle: "italic",
          letterSpacing: "-0.02em",
          fontWeight: 400,
        }}
      >
        {isPaginated
          ? "Nothing older to show"
          : isFiltered
            ? "Nothing in this category"
            : "All caught up."}
      </h2>
      <p className="mt-2 text-body text-ink-subtle max-w-[420px] mx-auto">
        {isPaginated
          ? "You've reached the bottom of the timeline."
          : isFiltered
            ? "Pick another category, or view everything."
            : "New activity on your tasks will appear here."}
      </p>
      {(isPaginated || isFiltered) && (
        <Link
          href={"/inbox" as Route}
          className="mt-6 inline-block text-body text-altus-red hover:underline underline-offset-4"
        >
          {isPaginated ? "← Back to latest" : "← Show all notifications"}
        </Link>
      )}
    </div>
  );
}
