import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Gauge,
  Handshake,
  LayoutGrid,
  ListChecks,
  Palette,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react";

/**
 * THE OPERATIONS ROOM'S NAVIGATION — one list, two consumers.
 *
 * ── THE SHAPE (account holder, 2026-09-11) ───────────────────────────────
 * The left sidebar always shows the four AREAS. It does NOT swap. Picking one
 * navigates into it and its own pages appear as a horizontal QUICK-ACCESS row
 * across the top of the content — the same arrangement the HR console uses
 * (components/hr/console/hr-step-nav.tsx), which is what this was modelled on.
 *
 * That is a change from the first cut, where the sidebar itself swapped to the
 * area's items. The difference matters: with a swapping rail you lose sight of
 * the other three areas the moment you enter one, so moving between them means
 * going Home first. Keeping the areas in the rail and the pages on top means
 * both axes are always one click away.
 *
 * ── WHY IT LIVES IN lib/ AND NOT IN THE NAV COMPONENT ────────────────────
 * Two surfaces render this list — the global sidebar (components/layout/
 * main-nav.tsx) and the quick-access row (components/operations/
 * operations-quick-nav.tsx) — plus the front door's card deck. Three copies of
 * "what is in Operations" is three chances for them to disagree about it.
 *
 * PURE and free of `server-only`: the quick nav is a client component.
 */

export type OperationsAreaId = "handholding" | "events" | "checklist" | "guidelines";

export interface OperationsSubItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Admins only — the item is filtered out for everyone else. */
  adminOnly?: boolean;
  /** Hand-holding's Access Panel: HR, admins and the named roster owners only.
   *  Resolved server-side (lib/hh/access) — the client cannot read those tables. */
  hhAccessOnly?: boolean;
  /** Match this href exactly; without it every child route lights it up too. */
  exact?: boolean;
}

export interface OperationsArea {
  id: OperationsAreaId;
  label: string;
  /** Where the sidebar row and the front-door card point. */
  href: string;
  Icon: LucideIcon;
  /** One line, for the front door's card. */
  tagline: string;
  /** Every path prefix this area owns, for matching the current route. */
  prefixes: string[];
  /** The quick-access row for this area. */
  items: OperationsSubItem[];
}

/**
 * The four areas, in the order the rail and the front door list them.
 *
 * Hand-holding and Monthly Events Master were rooms of their own until
 * 2026-09-11; they lead because they are the ones people arrive already looking
 * for. Checklist and Guidelines are new and follow.
 */
export const OPERATIONS_AREAS: OperationsArea[] = [
  {
    id: "handholding",
    label: "Hand-holding",
    href: "/people-allocation",
    Icon: Users2,
    tagline: "Who is staffed on which client, product and team.",
    prefixes: ["/people-allocation"],
    items: [
      { href: "/people-allocation", label: "Hand-holding", Icon: Users2, exact: true },
      { href: "/people-allocation/participants", label: "All Participants", Icon: ClipboardList },
      { href: "/people-allocation/ambassadors", label: "Ambassadors", Icon: Handshake },
      { href: "/people-allocation/development", label: "Development", Icon: Sparkles },
      {
        href: "/people-allocation/access",
        label: "Admin Panel",
        Icon: ShieldCheck,
        hhAccessOnly: true,
      },
    ],
  },
  {
    id: "events",
    label: "Monthly Events Master",
    href: "/events",
    Icon: CalendarDays,
    tagline: "The company calendar — batches, holidays & obligations in one grid.",
    prefixes: ["/events"],
    items: [
      { href: "/events", label: "Overview", Icon: LayoutGrid, exact: true },
      { href: "/events/calendar", label: "Calendar", Icon: CalendarDays },
      { href: "/events/masters", label: "Masters", Icon: Palette, adminOnly: true },
      { href: "/events/batches", label: "Batches", Icon: CalendarClock, adminOnly: true },
      { href: "/events/obligations", label: "Obligations", Icon: Gauge, adminOnly: true },
    ],
  },
  {
    id: "checklist",
    label: "Checklist",
    href: "/operations/checklist",
    Icon: ListChecks,
    tagline: "The recurring operational checks, and who has cleared them.",
    prefixes: ["/operations/checklist"],
    // ONE page, three views — the Master / By Person / By Event switcher lives
    // inside it as component state, so there is nothing here to link to. An
    // area with a single item renders no quick-access row at all (see
    // OperationsQuickNav): a bar with one button is a label, not a control.
    items: [],
  },
  {
    id: "guidelines",
    label: "Guidelines",
    href: "/operations/guidelines",
    Icon: ScrollText,
    tagline: "How the operations team works — the written rules, in one place.",
    prefixes: ["/operations/guidelines"],
    items: [],
  },
];

/** The area owning a path, or null on the front door / an unclaimed route. */
export function operationsAreaForPath(pathname: string): OperationsArea | null {
  return (
    OPERATIONS_AREAS.find((a) =>
      a.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
    ) ?? null
  );
}

/**
 * Is this item the open one?
 *
 * `exact` items match only themselves — without it, `/people-allocation` (the
 * board) would stay lit on every child route and two buttons would read active
 * at once.
 */
export function isOperationsItemActive(item: OperationsSubItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
