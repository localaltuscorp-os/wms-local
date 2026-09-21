import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  BookUser,
  Briefcase,
  Library,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Gauge,
  GraduationCap,
  Handshake,
  History,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Megaphone,
  MessageSquareHeart,
  Network,
  Palette,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRound,
  Users2,
  UsersRound,
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
  | "client-engagement"
  | "directory"
  | "guidelines"
  | "handholding"
  | "jobdescription"
  | "events"
  | "team-reporting"
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
 * The ten areas, ALPHABETICAL BY LABEL — the words in the rail, not the ids
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
    // CLIENT ENGAGEMENT (rebuilt 2026-09-18) — who carries which participant,
    // client and ambassador, when their calls are, and how much room each
    // person has left. Its own ce_* tables (0238); the calendar overlays each
    // person's Hand-holding calls read-only. The first version is quarantined in
    // _archive/client-engagement-2026-09-18.
    id: "client-engagement",
    label: "Client Engagement",
    href: "/operations/client-engagement",
    Icon: UsersRound,
    tagline: "Participants, clients and ambassadors — who carries them, when their calls are, and who has room.",
    prefixes: ["/operations/client-engagement"],
    items: [
      { href: "/operations/client-engagement", label: "Overview", Icon: LayoutGrid, exact: true },
      { href: "/operations/client-engagement/calendar", label: "Calendar", Icon: CalendarDays },
      { href: "/operations/client-engagement/employees", label: "Emp Grid", Icon: Users2 },
      { href: "/operations/client-engagement/pca", label: "PCA Grid", Icon: ClipboardList },
      { href: "/operations/client-engagement/references", label: "References", Icon: Share2 },
      { href: "/operations/client-engagement/team", label: "Team & Log", Icon: History },
    ],
  },
  {
    // Every outside vendor — contact, postal address, AMC. One page (the bulk
    // upload is a dialog on it), so no quick-access row.
    id: "directory",
    label: "Directory",
    href: "/operations/directory",
    Icon: BookUser,
    tagline: "Every Altus Corp vendor - contacts, addresses & AMC.",
    prefixes: ["/operations/directory"],
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
    // The Executive Master Calendar (0231) took over /events from the archived
    // Monthly Events Master. Same URL on purpose: every old link lands on the
    // thing that replaced it rather than on a 404.
    id: "events",
    label: "Monthly Events Master",
    href: "/events",
    Icon: CalendarDays,
    tagline: "The company schedule — day, week, month and year.",
    prefixes: ["/events"],
    // ONE item, not three. The horizons are `?view=` on a single page, and this
    // rail matches by PATH PREFIX — a query-string href would never light up,
    // and tests/unit/operations-nav.test.ts pins exactly that. The Week / Two
    // months / Year switcher lives on the page itself, where it belongs.
    items: [{ href: "/events", label: "Calendar", Icon: CalendarDays, exact: true }],
  },
  {
    // WHO REPORTS TO WHOM. The board itself already existed, under Admin >
    // Reporting Hierarchy, where only admins ever saw it. Operations is where
    // the question actually gets asked, so the area points at the same board
    // rather than a second copy of the org chart that could disagree with it.
    id: "team-reporting",
    label: "Team Reporting",
    href: "/operations/team-reporting",
    Icon: Network,
    tagline: "Every team member and their direct reporting manager, in one board.",
    prefixes: ["/operations/team-reporting"],
    // One board, no sub-pages - so no quick-access row (see OperationsQuickNav).
    items: [],
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

/* ── MASTERS (account holder, 2026-09-15) ────────────────────────────────────
 * Every master the room keeps, in a rail section of its own, each topic kept
 * separate: Checklist · Events · Job Description (General, and per person).
 *
 * A SECTION, not an eighth area. The areas above are where the work happens;
 * these are the reference lists the work is built from, and they were buried
 * one inside each area. The same list feeds the left rail (main-nav.tsx), the
 * tab strip on every Masters page and the Masters overview — one copy, so the
 * three cannot disagree about what a master is. */
export type OperationsMasterTopic = "Overview" | "Checklist" | "Events" | "Job Description";

export interface OperationsMasterItem extends OperationsSubItem {
  topic: OperationsMasterTopic;
  /** One line for the overview card. */
  blurb: string;
}

export const OPERATIONS_MASTERS: OperationsMasterItem[] = [
  {
    href: "/operations/masters",
    label: "All Masters",
    Icon: Library,
    exact: true,
    topic: "Overview",
    blurb: "Every master in one place.",
  },
  {
    href: "/operations/masters/checklist",
    label: "Checklist Masters",
    Icon: ListChecks,
    topic: "Checklist",
    blurb: "Reusable checklists — activities, day offsets, doers and backups. New checklists are built from these.",
  },
  {
    href: "/operations/masters/events",
    label: "Event Masters",
    Icon: Palette,
    topic: "Events",
    blurb: "Event categories (the colour legend behind every event) and batch types.",
  },
  {
    href: "/operations/masters/jd",
    label: "Master JD",
    Icon: Briefcase,
    topic: "Job Description",
    blurb: "Job descriptions owned by a position — the work stays with the seat when people change.",
  },
  {
    href: "/operations/masters/person-jd",
    label: "Person-specific JD",
    Icon: UserRound,
    topic: "Job Description",
    blurb: "One person's whole JD — their seat's tasks, tasks given to them by name, and personal tasks.",
  },
  /* RECRUITMENT JD (account holder, 2026-09-17) — moved here from the HR rail.
     The third job description, and it belongs beside the other two: those two
     say what a seat does once somebody is in it, this one says what the seat is
     while we are still looking. Reading is open like every master; editing and
     sending are HR staff only, enforced by the page's actions. */
  {
    href: "/operations/masters/recruitment-jd",
    label: "Recruitment JD",
    Icon: UserPlus,
    topic: "Job Description",
    blurb: "What recruiters send candidates — the original master, a recruiter copy to edit freely, and WhatsApp or email to anyone.",
  },
];
