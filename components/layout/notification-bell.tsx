import Link from "next/link";
import type { Route } from "next";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getUnreadCount } from "@/lib/queries/notifications";

/**
 * NOTIFICATION BELL — the Inbox entry point, in the header's right cluster on
 * EVERY screen in EVERY module (Sir: it was missing entirely; the Inbox was only
 * reachable from the avatar menu, so a notification could sit unread with nothing
 * on screen to say so).
 *
 * Server component: the unread count is read on the same request that renders the
 * header — no client fetch, no loading flicker, and it can't drift from the
 * Inbox page's own count because both read `getUnreadCount`.
 *
 * Best-effort by design: if the count query fails the bell still renders (just
 * without a badge) rather than taking the whole header down with it.
 */
export async function NotificationBell() {
  let unread = 0;
  try {
    const me = await requireUser();
    unread = await getUnreadCount(me.id);
  } catch {
    /* not signed in / count unavailable — render a plain bell */
  }

  const label = unread > 0 ? `Inbox — ${unread} unread` : "Inbox";
  return (
    <Link
      href={"/inbox" as Route}
      aria-label={label}
      title={label}
      className="relative grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
    >
      <Bell size={18} strokeWidth={2.2} />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-black leading-[17px] text-white"
          style={{ background: "var(--color-altus-red)" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
