import type { LucideIcon } from "lucide-react";
import { CalendarCheck2, LayoutDashboard, Layers } from "lucide-react";

/**
 * THE THREE DOORS OF DCC (DCC-SPEC §2) — one list, two consumers.
 *
 * The global sidebar (components/layout/main-nav.tsx) renders them under
 * Employees, and the module's own quick-nav row renders them across the top of
 * every DCC page. Two separate copies of "what is in DCC" would be two separate
 * chances for them to disagree, which is exactly what went wrong in the old
 * module: the rail advertised a door the pages had stopped honouring.
 *
 * SIBLINGS, NOT NESTED, on purpose. The board is where you fill your day; the
 * dashboard is where you read the org; the masters are where a position's
 * template is built. Nesting the last two inside the first hid them behind a
 * screen most people open once a day and leave.
 *
 * PURE and free of `server-only` — the quick nav is a client component.
 */

export interface DccDoor {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** One line for the rail's tooltip and the module's overview. */
  blurb: string;
  /** Match exactly; without it every child route lights the parent up too. */
  exact?: boolean;
}

export const DCC_DOORS: DccDoor[] = [
  {
    href: "/dcc",
    label: "My Day",
    Icon: CalendarCheck2,
    blurb: "Today's compliances, and the four ways a day can end.",
    exact: true,
  },
  /* NO "SP1 REPORT" AND NO "CALL LOG" DOOR (account holder, 2026-09-17). The
     SP1 sheet IS the dashboard, and the fifteen numbers are typed straight into
     it — so both would have been a second entry pointing at one screen, exactly
     the duplicated door this list exists to prevent. `/dcc/sp1` and
     `/dcc/call-log` redirect to the dashboard for the sake of old bookmarks;
     neither is navigation any more. */
  {
    href: "/dcc/dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    blurb: "Jeevan's SP1 sheet — fill your calls, and read the whole org.",
  },
  {
    href: "/dcc/masters",
    label: "DCC Masters",
    Icon: Layers,
    blurb: "The template a position carries, and one person's whole DCC.",
  },
];

/** Every child route of `/dcc`, so the rail's parent entry can exclude them. */
export const DCC_CHILD_ROUTES = DCC_DOORS.filter((d) => !d.exact).map((d) => d.href);

/**
 * Which door a path is standing on.
 *
 * Longest match wins, so `/dcc/masters/person` lights DCC Masters rather than
 * falling back to the exact-matched My Day.
 */
export function activeDccDoor(pathname: string): DccDoor | null {
  let best: DccDoor | null = null;
  for (const d of DCC_DOORS) {
    const hit = d.exact
      ? pathname === d.href
      : pathname === d.href || pathname.startsWith(`${d.href}/`);
    if (hit && (!best || d.href.length > best.href.length)) best = d;
  }
  return best;
}
