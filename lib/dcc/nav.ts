import type { LucideIcon } from "lucide-react";
import { CalendarCheck2, CalendarRange, LayoutDashboard } from "lucide-react";

/**
 * THE DOORS OF DCC — one list, two consumers.
 *
 * The global sidebar (components/layout/main-nav.tsx) renders them under
 * Employees, and the module's own quick-nav row renders them across the top of
 * every DCC page. Two separate copies of "what is in DCC" would be two separate
 * chances for them to disagree.
 *
 * ── WCC AND MCC REPLACE MY DAY (account holder, 2026-09-18) ──────────────
 * DCC's daily board became two checklists built the Accounts way — the Weekly
 * Compliance Checklist and the Monthly Compliance Checklist — and `/dcc` now
 * redirects to WCC. DCC MASTERS IS OFF THE SIDEBAR on the same instruction; the
 * page still exists at /dcc/masters, because the position templates it edits
 * are still what gives people their compliances.
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
  /* DASHBOARD FIRST, then WCC and MCC (account holder, 2026-09-18).
     THE DASHBOARD IS NO LONGER THE SP1 SHEET (2026-09-21). It reports on WCC
     and MCC now — the checklists that replaced DCC's daily board — because the
     module's Dashboard was still describing a sheet the work had moved off.
     The 2026-09-17 instruction that "the SP1 sheet IS the dashboard" is
     superseded, deliberately and on request; see the page's own note.
     `/dcc/sp1` and `/dcc/call-log` still redirect here. */
  {
    href: "/dcc/dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    blurb: "WCC and MCC at a glance — who is complying, and what is slipping.",
  },
  {
    href: "/dcc/wcc",
    label: "WCC",
    Icon: CalendarCheck2,
    blurb: "Weekly Compliance Checklist — today, the last 3 days or the last 6.",
  },
  {
    href: "/dcc/mcc",
    label: "MCC",
    Icon: CalendarRange,
    blurb: "Monthly Compliance Checklist — by month or by quarter.",
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
