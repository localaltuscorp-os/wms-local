import Link from "next/link";
import type { Route } from "next";
import { Bell } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getNavCounts } from "@/lib/queries/nav-counts";

/**
 * The notification bell — the app's ONE always-visible unread indicator.
 *
 * Unread count lived only inside the user-menu dropdown (a dot on the avatar
 * plus a number on the "Inbox" row), so nothing on screen told you a message had
 * arrived until you opened the menu looking for it. The bell sits at the far
 * right of the app top bar on every screen in every module.
 *
 * Reads the SAME `getNavCounts` the user menu does — a shared cache hit, so
 * rendering both costs one query, not two.
 */
export async function NotificationBell() {
  const me = await getCurrentEmployee();
  if (!me) return null;

  const { inboxUnread } = await getNavCounts({
    userId: me.id,
    isAdmin: me.isAdmin,
    inboxSince: me.lastInboxVisitAt,
  });

  const unread = inboxUnread > 0;

  return (
    <Link
      href={"/inbox" as Route}
      aria-label={unread ? `Notifications — ${inboxUnread} unread` : "Notifications"}
      title={unread ? `${inboxUnread} unread` : "Notifications"}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
    >
      <Bell size={17} strokeWidth={2.3} />
      {unread && (
        <span
          // 99+ so a long-neglected inbox can't stretch the pill off the button.
          className="absolute -right-1 -top-1 inline-flex min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums text-white"
          style={{
            height: 17,
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 0 0 2px var(--color-surface-card)",
          }}
        >
          {inboxUnread > 99 ? "99+" : inboxUnread}
        </span>
      )}
    </Link>
  );
}
