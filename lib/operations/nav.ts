import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Gauge,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Megaphone,
  MessageSquareHeart,
  Palette,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  Users2,
} from "lucide-react";

/**
 * THE OPERATIONS ROOM'S NAVIGATION — one list, two consumers.
 *
 * ── THE SHAPE (account holder, 2026-09-11) ───────────────────────────────
 * The left sidebar always shows the AREAS. It does NOT swap. Picking one
 * navigates into it and its own pages appear as a horizontal QUICK-ACCESS row
 * across the top of the content — the same arrangement the HR console uses
 * (components/hr/console/hr-step-nav.tsx), which is what this was modelled on.
 *
 * There is no longer a front door in front of that: the room opens on its FIRST
 * AREA (2026-09-12). The card deck that used to greet you was a menu repeating
 * the rail, so `/operations` forwards instead — see app/(app)/operations/page.tsx.
 *
 * That is a change from the first cut, where the sidebar itself swapped to the
 * area's items. The difference matters: with a swapping rail you lose sight of
 * every other area the moment you enter one, so moving between them means
 * backing out first. Keeping the areas in the rail and the pages on top means
 * both axes are always one click away — and it is what made the front door
 * redundant, since the rail already answers "what is in this room?".
 *
 * ── WHY IT LIVES IN lib/ AND NOT IN THE NAV COMPONENT ────────────────────
 * Two surfaces render this list — the global sidebar (components/layout/
 * main-nav.tsx) and the quick-access row (components/operations/
 * operations-quick-nav.tsx) — and the forwarder reads it to decide where the
 * room opens. Separate copies of "what is in Operations" would be separate
 * chances for them to disagree about it.
 *
 * PURE and free of `server-only`: the quick nav is a client component.
 */

export type OperationsAreaId =
  | "broadcasts"
  | "checklist"
  | "guidelines"
  | "handholding"
  | "jobdescription"
  | "events"
  | "training";

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
  /** Where the sidebar row points — and, for the first area, where
   *  `/operations` forwards to. */
  href: string;
  Icon: LucideIcon;
  /** One line saying what the area is.
   *
   *  NOT CURRENTLY RENDERED — it fed the front door's card deck, which went on
   *  2026-09-12. Kept because it is the only prose description of each area and
   *  it belongs next to the area rather than in a comment; the next surface
   *  that needs to explain the room (a tooltip, a search result, the mobile
   *  app) should read it here rather than writing its own. */
  tagline: string;
  /** Every path prefix this area owns, for matching the current route. */
  prefixes: string[];
  /** The quick-access row for this area. */
  items: OperationsSubItem[];
}

/**
 * The seven areas, ALPHABETICAL BY LABEL — the words in the rail, not the ids
 * behind them, which is why Monthly Events Master sits under M and not under
 * `events`.
 *
 * ── WHY ALPHABETICAL, AND WHY IT IS CHECKED ──────────────────────────────
 * The rail used to be ordered by importance: the two areas that had been rooms
 * of their own led, then the one with daily traffic, then the arrivals from HR,
 * then the new ones. That order was legible to whoever wrote it and to nobody
 * else — a reader looking for Guidelines had to scan all seven, every time,
 * because there was no rule to predict where it sat. Seven items is exactly the
 * length where alphabetical stops being a compromise and starts being faster.
 *
 * A ranking also has to be re-argued every time an area arrives. The alphabet
 * does not, which is the other half of the reason; `tests/unit/operations-nav`
 * asserts the list is sorted, so the eighth area cannot quietly land in the
 * wrong place.
 *
 * ── THIS NO LONGER DECIDES WHERE THE ROOM OPENS ──────────────────────────
 * It used to: `/operations` forwarded to `OPERATIONS_AREAS[0]`. Sorting the
 * list would have moved the landing to Broadcasts as a side effect of a
 * cosmetic change — so the landing is now named outright, below.
 */
/**
 * Where `/operations` opens.
 *
 * NAMED, not `OPERATIONS_AREAS[0]`. Hand-holding is the landing because the
 * account holder asked for it (2026-09-12, when the front-door card deck was
 * removed) — which is a decision about the room, and has nothing to do with
 * where the letter H falls. Tying the two together meant re-sorting the rail
 * silently moved the landing.
 */
export const OPERATIONS_LANDING_AREA: OperationsAreaId = "handholding";

export const OPERATIONS_AREAS: OperationsArea[] = [
  {
    id: "broadcasts",
    label: "Broadcasts",
    href: "/communications",
    Icon: Megaphone,
    tagline: "Company-wide notices — compose, send and track who has read.",
    /* Its route did NOT move: /communications was never under app/(app)/hr/, so
       only the chrome around it was HR's. See app/(app)/communications/layout.tsx. */
    prefixes: ["/communications"],
    items: [],
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
    id: "jobdescription",
    label: "Job Description",
    href: "/operations/job-description",
    Icon: ClipboardList,
    tagline: "Every recurring task, owned by a position rather than a person.",
    prefixes: ["/operations/job-description"],
    // One page. An area with a single item renders no quick-access row at all.
    items: [],
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
    id: "training",
    label: "Training",
    href: "/training",
    Icon: GraduationCap,
    tagline: "Material library, tests, induction & feedback.",
    prefixes: ["/training"],
    /* The SAME eight pages the Training room's own sidebar carried, moved
       wholesale to the quick-access row. Library keeps `exact` because every
       other page below is one of its children — without it the Library button
       stays lit on all eight and two read active at once. (The old sidebar
       spelled that rule out as a `not:` list of seven sibling hrefs; `exact`
       is the same rule, stated once, and it cannot fall out of date when a
       ninth page is added.) */
    items: [
      { href: "/training", label: "Library", Icon: GraduationCap, exact: true },
      { href: "/training/calendar", label: "Calendar", Icon: CalendarClock },
      { href: "/training/self-learning", label: "Self-Learning", Icon: BookMarked },
      { href: "/training/share", label: "Share", Icon: Share2 },
      { href: "/training/obligations", label: "Obligations", Icon: Gauge },
      { href: "/training/induction", label: "Induction", Icon: ListChecks },
      { href: "/training/feedback", label: "Feedback", Icon: MessageSquareHeart },
      { href: "/training/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    ],
  },
];

/** The area owning a path, or null on `/operations` itself / an unclaimed route. */
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
