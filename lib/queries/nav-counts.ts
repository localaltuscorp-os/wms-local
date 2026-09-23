import { count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, tasks } from "@/lib/db";
import { getUnreadCount } from "@/lib/queries/notifications";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Nav-badge task counters.
 *
 * `activeTasks` is the count of tasks ON THE LIST — every unarchived task,
 * whatever its status. `archivedTasks` is the soft-deleted total.
 *
 * IT USED TO COUNT ONLY PENDING STATUSES ("work to do"), which made the badge
 * and the list disagree: the Tasks screen showed thirteen rows while the badge
 * said eight, and archiving a task that was already Done moved the list but not
 * the number. Sir, 2026-09: "I have 9 tasks, and if I archive whatever task
 * then reduce the number." So the badge now counts what the list holds — one
 * number, one meaning — and archiving ANY task takes one off it.
 *
 * The cost of that choice, kept here on purpose: a task that is finished but
 * never archived still counts. The badge is "what is in your list", not "what
 * is left to do"; closing a task no longer moves it, archiving it does.
 *
 * Both invalidate via `revalidateTag(CACHE_TAGS.tasks)` — fired by every
 * create / status-change / archive / restore path — so the badge stays live;
 * the 60s `revalidate` is just a safety net.
 */
const fetchTaskTotals = unstable_cache(
  async (): Promise<{ activeTasks: number; archivedTasks: number }> => {
    const [openRows, archivedRows] = await Promise.all([
      db.select({ n: count() }).from(tasks).where(eq(tasks.archived, false)),
      db.select({ n: count() }).from(tasks).where(eq(tasks.archived, true)),
    ]);
    return {
      activeTasks: Number(openRows[0]?.n ?? 0),
      archivedTasks: Number(archivedRows[0]?.n ?? 0),
    };
  },
  ["nav-task-totals"],
  { tags: [CACHE_TAGS.tasks], revalidate: 60 },
);

export async function getNavCounts(args?: {
  userId?: string;
  isAdmin?: boolean;
  inboxSince?: Date | undefined;
}): Promise<{
  activeTasks: number;
  archivedTasks: number;
  inboxUnread: number;
}> {
  // Unread count is per-user — kept out of the shared cache. The two
  // task totals are now one cache lookup that hits Postgres at most
  // once per minute (or until a task mutation invalidates the tag).
  //
  // BOTH SOURCES DEGRADE TO 0 INDEPENDENTLY. These are badge counts on
  // chrome that renders on EVERY route — NotificationBell and the sidebar
  // pills live in `app/(app)/layout.tsx`. An unhandled rejection there is not
  // a missing number, it is the whole app: React unwinds the layout, every
  // page falls to the error boundary, and "Try again" re-runs the same failing
  // query, so the user is stuck on "We hit a snag" with no way out — which is
  // exactly what a dead database connection caused.
  //
  // A count is cosmetic; the page behind it is not. Failing soft trades a
  // missing badge for a working app, and each source is caught separately so
  // one dead counter cannot blank the other. The warning keeps the real fault
  // visible in the server log rather than silently swallowed.
  const [totals, inboxUnread] = await Promise.all([
    fetchTaskTotals().catch((err) => {
      console.warn("[nav-counts] task totals unavailable:", (err as Error)?.message);
      return { activeTasks: 0, archivedTasks: 0 };
    }),
    (args?.userId ? getUnreadCount(args.userId) : Promise.resolve(0)).catch((err) => {
      console.warn("[nav-counts] unread count unavailable:", (err as Error)?.message);
      return 0;
    }),
  ]);
  return { ...totals, inboxUnread };
}
