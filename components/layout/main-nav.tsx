"use client";
import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  House,
  ListTodo,
  ClipboardList,
  CalendarDays,
  FolderTree,
  SquareKanban,
  Target,
  ListChecks,
  Flag,
  CircleDot,
  CornerDownRight,
  Telescope,
  CalendarCheck,
  Plane,
  CalendarRange,
  CalendarClock,
  CreditCard,
  Award,
  Table2,
  Layers,
  IndianRupee,
  Wallet,
  Compass,
  Receipt,
  UserPlus,
  BookUser,
  FileText,
  Timer,
  Sparkles,
  BookMarked,
  ShieldCheck,
  Handshake,
  GraduationCap,
  LayoutGrid,
  MessageSquareHeart,
  PiggyBank,
  LineChart,
  Banknote,
  Landmark,
  Users,
  CandlestickChart,
  FolderArchive,
  Gauge,
  Gem,
  Share2,
  FolderLock,
  Palette,
  PartyPopper,
  FileSignature,
  Trash2,
  Trophy,
  ScrollText,
  Mail,
  BellRing,
  LifeBuoy,
  Home,
  ChevronDown,
  BookOpen,
  IdCard,
  BarChart3,
  CheckCircle2,
  Users2,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { MainNavPill } from "./main-nav-pill";
import { MainNavGroup } from "./main-nav-group";
import { workspaceForPath, type WorkspaceId } from "@/lib/workspaces";
import { OPERATIONS_AREAS, OPERATIONS_MASTERS, type OperationsAreaId } from "@/lib/operations/nav";
import { DCC_CHILD_ROUTES, DCC_DOORS } from "@/lib/dcc/nav";
import { nodeKeyForPath } from "@/lib/permissions/catalog";
import { archiveSection, isArchiveSectionId } from "@/lib/archive/sections";
import { HR_STAGES, hrItemHref, type HrStage, type HrStageKey } from "@/lib/hr/lifecycle";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
  /** Active workspace from the `aw` cookie (server-resolved). */
  cookieWorkspace?: WorkspaceId;
  /**
   * Whether GOALS_CANVAS_ON is set (server-resolved in MainNavServer — the env
   * var is not NEXT_PUBLIC, so it is ALWAYS falsy client-side). Gates the Goals
   * level items, which server-redirect to /goals when the flag is off (bug #11).
   */
  goalsCanvasEnabled?: boolean;
  /** Active Goals space (mig 0150). "personal" swaps the goals nav for the
   *  private admin set (levels + Recycle Bin, no team rituals). */
  goalsSpace?: "professional" | "personal";
  /** Server-resolved: does anyone report directly to this user? Gates the
   *  Productivity module's Team Performance entry (§19 keeps it from employees). */
  isManager?: boolean;
  /** May see Hand-holding's Access Panel — HR, admin or a roster owner. */
  canSeeHhAccess?: boolean;
  /**
   * PERMISSION-MATRIX node keys whose SHOW is switched off for this user
   * (lib/permissions). Server-resolved in MainNavServer — the matrix is a
   * database read, so the client cannot compute it.
   *
   * `undefined` means "the matrix does not govern this person" (a master admin,
   * or nobody signed in) and is deliberately DIFFERENT from `[]`, which means
   * "governed, nothing hidden". Collapsing the two would work today and break
   * the moment the default changes.
   *
   * Hiding a rail entry is presentation only. Every page behind these entries
   * calls `requireModuleView` itself, so a hidden module is also refused by
   * direct URL — this just stops the rail advertising a door that is shut.
   */
  hiddenNodeKeys?: readonly string[];
}

/**
 * One nav destination. `not` lists path prefixes that should NOT count as
 * active even though they start with `href` (e.g. `/tasks` must not light up
 * on `/tasks/kanban`). `exact` matches the pathname exactly (for `/`).
 */
interface NavItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
  /** Hand-holding's Access Panel: HR, admins and the named roster owners only.
   *  Resolved server-side (lib/hh/access), since the rule reads the HR tables
   *  and the client nav cannot. */
  hhAccessOnly?: boolean;
  /** Hide unless the viewer manages at least one direct report. Manager status is
   *  derived from the org chart (see lib/productivity/access.ts), never a role
   *  flag — an admin with reports qualifies through the same rule. */
  managerOnly?: boolean;
  exact?: boolean;
  not?: string[];
  /** Special-cased active-tasks badge — only Tasks carries it. */
  countKey?: "activeTasks";
  /** Item exists only when GOALS_CANVAS_ON is set — hidden when off (bug #11). */
  canvasOnly?: boolean;
  /** Fallback destination when GOALS_CANVAS_ON is off (bug #11) — the item is
   *  repointed there instead of bouncing off the level page's redirect. */
  canvasOffHref?: Route;
  /**
   * A TAB inside a single-page module, rather than a route of its own.
   *
   * Incentive is one page that holds six areas behind a tab strip, and it is
   * deliberately staying that way — switching tabs there is instant client
   * state, and giving each area its own route would have turned every switch
   * into a server round trip and reloaded the whole module's data to show a
   * panel that was already in the browser.
   *
   * So the rail links to `?tab=<tab>` and the page reads it. `href` stays the
   * BARE path, which matters twice over: `nodeKeyForPath` resolves the
   * permission node from it (a query string would resolve to nothing and
   * silently un-gate the entry), and `isActive` matches the pathname from it.
   */
  tab?: string;
  /** The tab the module opens on when the URL names none — exactly one item per
   *  rail carries this, and it is what keeps the first entry lit on arrival. */
  tabDefault?: boolean;
  /**
   * A DISCLOSURE, not a destination. An item carrying `children` renders as a
   * collapsed parent in the rail and opens its children when clicked; it never
   * navigates, so its own `href` is an identity for React keys and nothing
   * else — do not point it at a real route.
   *
   * Accounts' MIS is the case this exists for: eight registers that belong
   * together and were eight flat pills in a rail of twenty, which is a list
   * nobody can scan. Folded away they cost one line until you want them.
   */
  children?: NavItem[];
}

/**
 * Where a rail item actually links.
 *
 * Tabbed items get their `?tab=` appended here and NOWHERE else, so the two
 * places that render pills cannot drift into linking at different things.
 */
function navHref(item: NavItem): Route {
  return (item.tab ? `${item.href}?tab=${item.tab}` : item.href) as Route;
}

/** A stable React key — six Incentive items share one href, so the tab is what
 *  separates them. */
function navKey(item: NavItem): string {
  return item.tab ? `${item.href}#${item.tab}` : item.href;
}

interface NavGroup {
  label: string;
  Icon: LucideIcon;
  items: NavItem[];
}

interface WorkspaceNav {
  /** Top-level pills shown directly in the bar. */
  top: NavItem[];
  /** Secondary destinations folded into a "More" dropdown. */
  groups: NavGroup[];
}

/* ── HR room: a separate sidebar per lifecycle card ──────────────────────────
 * HR is a two-tier room. The front door (`/hr`) offers eight cards; each of the
 * five lifecycle STAGES (+ Overview / Holiday List / Help Desk) owns its OWN
 * sidebar, swapped in by hrSectionForPath. Every stage rail is generated from
 * the single lifecycle source (lib/hr/lifecycle.ts).                            */
type HrSection = "hub" | HrStageKey | "holiday" | "helpdesk";

const HR_HOME: NavItem = { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true };

/** The front-door rail — the eight cards, so the rail is also the switcher. */
const HR_HUB_NAV: WorkspaceNav = {
  top: [
    HR_HOME,
    ...HR_STAGES.map((s) => ({ href: `/hr/${s.slug}` as Route, label: s.title, Icon: s.Icon })),
    // Saved form submissions. Only "My" appears here: it's open to everyone and
    // hard-scoped to the signed-in employee, so it needs no gate.
    //
    // "All Filled Forms" is deliberately NOT in this rail. It must be visible to
    // HR staff, which is `isHrStaff` (super-admins + the HR department) — but the
    // only gate this nav understands is `adminOnly`, which would wrongly hide it
    // from HR-department non-admins. The HR landing deck already offers it behind
    // the correct predicate, so duplicating it here under the wrong one would
    // only create a second, inconsistent door.
    { href: "/hr/my-forms" as Route, label: "My Filled Forms", Icon: ClipboardList },
    { href: "/holidays" as Route, label: "Holiday List", Icon: PartyPopper },
    { href: "/support" as Route, label: "HR Help Desk", Icon: LifeBuoy },
  ],
  groups: [],
};

/** One rail per stage — HR Home + the stage overview + its own sidebar items. */
function stageNav(s: HrStage): WorkspaceNav {
  return {
    top: [
      HR_HOME,
      { href: `/hr/${s.slug}` as Route, label: s.title, Icon: s.Icon, exact: true },
      ...s.items.map((it) => ({ href: hrItemHref(s.slug, it) as Route, label: it.label, Icon: it.Icon })),
    ],
    groups: [],
  };
}

const HR_HOLIDAY_NAV: WorkspaceNav = {
  top: [HR_HOME, { href: "/holidays" as Route, label: "Holiday List", Icon: PartyPopper, exact: true }],
  groups: [],
};
const HR_HELPDESK_NAV: WorkspaceNav = {
  top: [
    HR_HOME,
    { href: "/support" as Route, label: "Live Tickets", Icon: LifeBuoy },
    { href: "/hr/routing" as Route, label: "Ticket Routing", Icon: ShieldCheck, adminOnly: true },
    { href: "/hr/metrics" as Route, label: "Support Metrics", Icon: Gauge, adminOnly: true },
  ],
  groups: [],
};

const HR_SECTION_NAV: Record<HrSection, WorkspaceNav> = {
  hub: HR_HUB_NAV,
  holiday: HR_HOLIDAY_NAV,
  helpdesk: HR_HELPDESK_NAV,
  ...(Object.fromEntries(HR_STAGES.map((s) => [s.slug, stageNav(s)])) as Record<HrStageKey, WorkspaceNav>),
};

/** Which HR card a path belongs to — a stage under `/hr/<stage>`, the holiday
 *  or help-desk surfaces, else the hub switcher rail (front door + Overview). */
function hrSectionForPath(p: string): HrSection {
  const m = p.match(/^\/hr\/(pre-interview|post-interview|pre-joining|during|appraisal|exit)(\/|$)/);
  if (m) return m[1] as HrStageKey;
  if (p.startsWith("/hr/candidates")) return "pre-interview"; // Basic Details lives here

  if (p.startsWith("/holidays")) return "holiday";
  if (p.startsWith("/support") || p.startsWith("/hr/routing") || p.startsWith("/hr/metrics")) return "helpdesk";
  return "hub";
}

/* ── Operations room: ONE rail of areas, pages on top ────────────────────────
 * The rail lists the AREAS and does NOT swap. Entering an area shows its own
 * pages as a horizontal quick-access row above the content
 * (components/operations/operations-quick-nav.tsx), the way the HR console
 * does it.
 *
 * This replaced a rail that swapped to the area's items. Swapping cost you
 * sight of the other areas the moment you entered one, so moving between them
 * meant going back out first; keeping the areas here and the pages on top
 * leaves both axes one click away.
 *
 * THE RAIL IS THE AREAS AND NOTHING ELSE (2026-09-12). It used to open with an
 * "Operations Home" row pointing at a deck of area cards. The deck is gone — it
 * was a menu repeating this rail, so it cost a click to say what the rail was
 * already saying — and the row that led to it went with it. The rail now starts
 * at Hand-holding and `/operations` forwards there (app/(app)/operations/page.tsx).
 *
 * The areas come from lib/operations/nav.ts, which the quick-access row reads
 * too — two copies of "what is in Operations" is two chances for them to
 * disagree.                                                                   */
const OPERATIONS_NAV: WorkspaceNav = {
  top: OPERATIONS_AREAS.map((a) => ({
    href: a.href as Route,
    label: a.label,
    Icon: a.Icon,
  })),
  /* MASTERS (2026-09-15) — the reference lists behind the areas, as a rail
     section of their own with each topic separate. The rail (drawer variant)
     renders a group as a headed section. See OPERATIONS_MASTERS. */
  groups: [
    {
      label: "Masters",
      Icon: OPERATIONS_MASTERS[0]!.Icon,
      items: OPERATIONS_MASTERS.map((m) => ({
        href: m.href as Route,
        label: m.label,
        Icon: m.Icon,
        exact: m.exact,
      })),
    },
  ],
};

/* The legacy `events` / `people-allocation` / `training` WorkspaceNav entries
   below are unreachable (workspaceForPath sends all three prefixes to
   `operations`) but the Record must be total. They read the SAME item lists the
   quick-access row uses, so the dead copies cannot drift from what people
   actually see.

   BY ID, NOT BY INDEX. These were `OPERATIONS_AREAS[0]` and `[1]`; inserting
   Training third happened not to disturb them, but the next insert need not be
   so lucky, and the failure mode is a rail quietly serving another area's
   pages rather than anything that throws. */
const areaItems = (id: OperationsAreaId): NavItem[] =>
  (OPERATIONS_AREAS.find((a) => a.id === id)?.items ?? []).map((it) => ({
    href: it.href as Route,
    label: it.label,
    Icon: it.Icon,
    exact: it.exact,
    adminOnly: it.adminOnly,
    hhAccessOnly: it.hhAccessOnly,
  }));

const HANDHOLDING_ITEMS = areaItems("handholding");
const EVENTS_ITEMS = areaItems("events");
const TRAINING_ITEMS = areaItems("training");

/**
 * Per-workspace navigation. Each room exposes ONLY its own modules — entering
 * WMS never shows Attendance/Salary/Outstanding, and vice-versa. Shared platform
 * surfaces (Inbox, Archived, Profile, Admin Panel) intentionally live in the
 * avatar menu, reachable from every workspace, so they don't clutter any one
 * room's bar. Only LIVE routes are listed; new modules join as they ship.
 */
/**
 * IMPORTANT LINKS BELONGS TO EVERY ROOM, not to WMS.
 *
 * It was one line in the `wms` rail, which meant the curated directory simply
 * did not exist once you stepped into Attendance, HR, Accounts or any of the
 * other twelve workspaces — and it is a directory OF those places, so that is
 * exactly backwards.
 *
 * Declared here and appended in MainNav rather than pasted into fifteen `top`
 * arrays: three rooms (`training`, `people-allocation`, `events`) share their
 * items through common `*_ITEMS` constants, so pasting would have put the entry
 * in some rails twice and in others not at all. One append also means HR's
 * per-stage rails and the personal Goals rail get it without being special
 * cases.
 *
 * It still passes the permission matrix like any other item — a person who
 * cannot open `/index-hub` does not see it.
 */
const IMPORTANT_LINKS_ITEM: NavItem = {
  href: "/index-hub" as Route,
  label: "Important Links",
  Icon: Compass,
};

const WORKSPACE_NAV: Record<WorkspaceId, WorkspaceNav> = {
  wms: {
    top: [
      // "WMS Dashboard", not "Dashboard": every room's rail has a Dashboard, so
      // the bare word says nothing about which one you're looking at. (Restored
      // — 2670d47 shipped this and 0ea9152 reverted it by syncing this file
      // from a stale copy.)
      { href: "/dashboard" as Route, label: "WMS Dashboard", Icon: LayoutDashboard, exact: true },
      // "Daily Goals" (renamed from "Plan My Day", Sir 2026-08-20). It lives
      // here rather than in Goals because workspaceForPath owns `/goals*` for
      // the Goals room, so a `/goals/plan` href would flip the sidebar to that
      // room mid-click. The Goals rail carries the SAME page on this same
      // `/my-day` href — see GOALS below.
      { href: "/my-day" as Route, label: "Daily Goals", Icon: CalendarDays },
      // Review = the SAME Review & Scores workbench as Goals › Review, on the
      // WMS-owned alias `/review` for the same reason My Day uses `/my-day`.
      { href: "/review" as Route, label: "Review", Icon: ClipboardList },
      // Task Agenda is GONE — item, route and all. My Day above is the planner
      // that replaced it, so `/tasks/agenda` is no longer excluded below either.
      {
        href: "/tasks" as Route,
        label: "Tasks",
        Icon: ListTodo,
        not: ["/tasks/kanban", "/tasks/time"],
        countKey: "activeTasks",
      },
      { href: "/tasks/kanban" as Route, label: "Kanban", Icon: SquareKanban, adminOnly: true },
      { href: "/tasks/time" as Route, label: "Time Intelligence", Icon: Timer },
      // Completed-work analytics. Sits next to Time Intelligence rather than
      // under Dashboard: both answer "how did the work go", and the dashboard
      // entry is the live board. Admin/manager only, matching the page's own
      // gate — a doer following this link would be redirected straight back.
      { href: "/dashboard/done" as Route, label: "Done Dashboard", Icon: CheckCircle2, adminOnly: true },
      // Projects is GONE from this rail (2026-09-21). The Project Plan room
      // still owns `/project-plan` and lists its own Projects entry there.
      //
      // Important Links is NOT listed here any more either — not because it
      // left, but because it now belongs to every room. See
      // IMPORTANT_LINKS_ITEM and the append in MainNav.
    ],
    // No "More" dropdown — Documents already lives in the profile/avatar menu.
    groups: [],
  },
  employees: {
    top: [
      // Order (Sir, 2026-07): Attendance · Incentive · My Salary ·
      // Reimbursements. HR Record moved to the HR room; the admin Salary module
      // + Overtime moved to the Accounts room.
      //
      // APPRAISAL IS NO LONGER HERE. It moved into Team Productivity
      // (/productivity/appraisal) and is linked from that room's rail instead —
      // one door, not two. The route it used to point at, /appraisal, still
      // resolves: it redirects to the new home so old bookmarks and the inbox
      // notifications keep working.
      // Order (Sir, 2026-08): Leaves · Attendance · Live Status, then the
      // rest. Leave and Live Status were both reachable only from inside the
      // attendance page before — Leave as a link, Live Status as a rail panel —
      // which put a whole-team snapshot on the screen an individual visits to
      // clock in. Each now has its own door.
      /* DASHBOARD, WCC, MCC LEAD THIS ROOM, in that order (account holder,
         2026-09-18) — the SP1 dashboard, then the Weekly and Monthly Compliance
         Checklists that replaced DCC's My Day.
         The doors are generated from lib/dcc/nav.ts — the SAME list the
         module's own quick-nav row renders — so the rail can never advertise a
         door the pages have stopped honouring. DCC Masters is no longer one. */
      ...DCC_DOORS.map((d) => ({
        href: d.href as Route,
        label: d.label,
        Icon: d.Icon,
        ...(d.exact ? { not: DCC_CHILD_ROUTES } : {}),
      })),
      { href: "/attendance/leave" as Route, label: "Leaves", Icon: Plane },
      { href: "/attendance/remote-work" as Route, label: "Remote Work", Icon: House },
      {
        href: "/attendance" as Route,
        label: "Attendance",
        Icon: CalendarCheck,
        // Sibling routes with their own nav entry must be excluded here, or the
        // parent stays highlighted while you are standing on the child.
        not: [
          "/attendance/dashboard",
          "/attendance/hr-record",
          "/attendance/leave",
          "/attendance/remote-work",
        ],
      },
      // INCENTIVE IS NO LONGER HERE. It became a hub module of its own
      // (2026-09-16) and carries its own rail; leaving a copy on this one would
      // have been a second door that silently swapped the sidebar to the
      // Incentive room mid-click, which is the "duplicate competing entry
      // point" the extraction was meant to remove. The route is unchanged, so
      // every existing `/incentive` link, notification and bookmark still lands
      // in the same place.
      { href: "/my-salary" as Route, label: "My Salary", Icon: Wallet },
      /* Salary Slip came across from the HR rail on 2026-09-12 and sits next to
         My Salary on purpose: the two answer the same question, one as a figure
         and one as the document behind it. Self-scoped by construction — the
         page reads the signed-in employee's own rows and takes no employee
         parameter — so this room being open to everyone exposes nobody's pay
         but your own. */
      { href: "/salary-slip" as Route, label: "Salary Slip", Icon: FileText },
      { href: "/reimbursements" as Route, label: "Reimbursements", Icon: Receipt },
      // Queries & Notifications — re-parented here from the HR room (2026-07):
      // it's an employee-facing surface (raise a query, track company notices).
      { href: "/queries" as Route, label: "Queries & Notifications", Icon: BellRing },
    ],
    groups: [],
  },
  // HR — the lifecycle room. Its rail is CONTEXT-AWARE (see HR_SECTION_NAV +
  // hrSectionForPath): the front door shows the seven stages; entering a stage
  // swaps the rail to that stage's own sidebar. This entry is the hub default.
  hr: HR_HUB_NAV,
  sales: {
    top: [
      { href: "/ambassadors" as Route, label: "Ambassadors", Icon: Gem },
      { href: "/people-gives" as Route, label: "People Gives", Icon: Handshake },
      { href: "/outstanding" as Route, label: "Outstanding", Icon: IndianRupee },
      { href: "/participant-breakthrough" as Route, label: "Breakthrough", Icon: Sparkles },
      { href: "/record-reference" as Route, label: "References", Icon: BookMarked },
    ],
    groups: [],
  },
  admin: {
    top: [{ href: "/admin" as Route, label: "Admin Panel", Icon: ShieldCheck }],
    groups: [],
  },
  /**
   * INCENTIVE — its own room (2026-09-16), lifted out of Employees.
   *
   * The six entries are the SAME six areas the module's tab strip has always
   * shown, in the same order, with the same icons and the same labels. Nothing
   * was built here: the rail and the strip are two views of one list, and both
   * drive the same `?tab=` parameter, so they can never disagree about which
   * area you are looking at.
   *
   * Entries and Status are `adminOnly` to match the strip, which has always
   * rendered them for admins only (Status additionally behind the
   * INCENTIVE_STATUS_UI flag, checked on the server). A rail entry for an area
   * the strip is not showing would be a dead link, so the page falls back to
   * Dashboard for any `?tab=` it cannot honour — see IncentiveTabs.
   */
  incentive: {
    /**
     * RAIL ORDER IS USAGE ORDER (2026-09-16 restructure). Filing and deciding a
     * request is the module's most frequent job, so Requests sits second rather
     * than fourth; Targets follows because it is the thing a request is measured
     * against. Entries, Status and Billing are periodic admin and accounts work
     * and move to the end. The `?tab=` values, the permission gates and the
     * default are unchanged — only the order someone reads them in.
     */
    top: [
      { href: "/incentive" as Route, label: "Dashboard", Icon: LayoutDashboard, tab: "dashboard", tabDefault: true },
      // MY INCENTIVES (0244) sits second, right after Dashboard: it answers the
      // employee's own question ("what can I earn?") and needs no admin rights,
      // which is not true of anything below it.
      { href: "/incentive" as Route, label: "My Incentives", Icon: Award, tab: "my" },
      { href: "/incentive" as Route, label: "Requests", Icon: ListChecks, tab: "requests" },
      { href: "/incentive" as Route, label: "Targets", Icon: Target, tab: "targets" },
      { href: "/incentive" as Route, label: "Entries", Icon: Table2, tab: "entries", adminOnly: true },
      { href: "/incentive" as Route, label: "Status", Icon: Layers, tab: "status", adminOnly: true },
      { href: "/incentive" as Route, label: "Billing", Icon: IndianRupee, tab: "billing" },
    ],
    groups: [],
  },
  // Unreachable since 2026-09-12 — see the note above HANDHOLDING_ITEMS. The
  // "More" group that used to hold Induction, Feedback and Dashboard is gone
  // with it: the quick-access row is one flat strip, so all eight pages now sit
  // at the same level instead of three of them hiding behind a disclosure.
  training: { top: TRAINING_ITEMS, groups: [] },
  accounts: {
    /* THE ACCOUNTS RAIL, restructured to the brief of 2026-09-21.
     *
     * The shape of the change, not just the order: the room had twenty flat
     * pills, eight of which were REGISTERS — bank balances, SIPs, shares, F&O,
     * credit cards, the IT folder and so on. Eight siblings of equal visual
     * weight in a list of twenty is a list nobody scans; you read it every time
     * instead of recognising it. They are now folded into MIS (item 9), which
     * costs one line until you open it, and the daily run of the room —
     * checklists, due dates, payroll, reimbursements — is what the rail shows.
     *
     * Collection Master is NOT here any more. It moved to the Billing room,
     * which is where revenue lives; see the note on `billing` below.
     *
     * Important Links is not listed either, and that is not an omission — it is
     * appended to every rail in the app. See IMPORTANT_LINKS_ITEM.
     */
    top: [
      { href: "/accounts" as Route, label: "Index", Icon: LayoutGrid, exact: true },
      { href: "/accounts/weekly-checklist" as Route, label: "Weekly CC", Icon: CalendarCheck },
      { href: "/accounts/monthly-quarterly-annual" as Route, label: "Monthly CC", Icon: CalendarRange },
      { href: "/accounts/due-dates" as Route, label: "Due Dates Master", Icon: CalendarClock },
      // Payroll — the admin Salary module + Overtime, re-parented from Employees
      // (2026-07). Gated by the Accounts room + each page's own finance guard.
      { href: "/salary" as Route, label: "Salary", Icon: IndianRupee },
      { href: "/salary-slip" as Route, label: "Salary Slip", Icon: FileText },
      // Deliberately the SAME page the HR rail opens, not a copy. Slips are
      // self-scoped by construction (see that page's own note), so there is
      // nothing here for Accounts to see that HR doesn't - only a second door
      // to it, because payroll is run from this room. The HR workspace is open
      // to every employee, so this link can never dead-end.
      { href: "/overtime" as Route, label: "Overtime", Icon: Timer, not: ["/overtime/dashboard"] },
      // A `link` in the Accounts Index too — /reimbursements is a built module
      // of its own, and this is the door to it from this room, not a copy.
      { href: "/reimbursements" as Route, label: "Reimbursement", Icon: Receipt },
      /* MIS — the eight registers, folded. `/accounts/mis` is an IDENTITY, not
       * a route: a parent carrying `children` never navigates. Do not create a
       * page at that path expecting this to open it. */
      {
        href: "/accounts/mis" as Route,
        label: "MIS",
        Icon: BarChart3,
        children: [
          { href: "/accounts/bank-balance" as Route, label: "Bank Balance Master", Icon: Landmark },
          {
            href: "/accounts/vasa-family-interpersonal" as Route,
            label: "Vasa Family Interpersonal Balances",
            Icon: Users,
          },
          { href: "/accounts/cc-tracker" as Route, label: "Credit Cards Masters", Icon: CreditCard },
          { href: "/accounts/sip-tracker" as Route, label: "SIP Trackers", Icon: PiggyBank },
          { href: "/accounts/fno-income" as Route, label: "FNO Income Master", Icon: LineChart },
          { href: "/accounts/shares-register" as Route, label: "Shares Master", Icon: CandlestickChart },
          { href: "/accounts/ca-handover" as Route, label: "CA Handover", Icon: ShieldCheck },
          {
            href: "/accounts/income-tax-master-folder" as Route,
            label: "Last 3–5 Years Income Tax Folder",
            Icon: FolderArchive,
          },
        ],
      },
      // Registered as a `stub` section, so the route is real today and renders
      // the standard scaffold rather than 404-ing while the module is built.
      {
        href: "/accounts/vasa-family-kyc" as Route,
        label: "Vasa Family KYC Documents",
        Icon: IdCard,
      },
      // The manual lives in the Induction module; this is the door to it from
      // Accounts, the same arrangement as Reimbursement above.
      { href: "/training/induction" as Route, label: "Accounts Manual", Icon: BookOpen },
      /* NOT ON THE RAIL ANY MORE, DELIBERATELY, and still reachable.
       * Cash Withdrawal, Incentive Payments and "CC Master — FY 2026-27" are
       * built sections with live data; they keep their routes and their cards on
       * the Index, they just no longer take a line in a rail of twelve. */
    ],
    groups: [],
  },
  billing: {
    // Billing — two surfaces. The revenue ledger (the live billing sheet) stays
    // the room's front door; Documents is the quotation → proforma → tax-invoice
    // engine that issues, numbers, prints and emails the actual paperwork.
    //
    // These two came off the rail on 2026-09-16 ("remove this") and went back
    // on the same day, when the Documents engine turned out to be the module
    // being built on rather than replaced. Nothing about the routes changed in
    // between — only whether they were offered here.
    top: [
      /* ── CUSTOMERS, ABOVE THE BILLING SURFACES ─────────────────────────
         Manan, 2026-09-17: "I want that in side panel above the billing
         section ... I want a separate new section for it."

         Deliberately FIRST in the rail, and in the order the work is done:
         you KYC a customer, then it appears in the master, its addresses in
         the address book, the dropdowns those forms read are configured in
         the DD, and anything removed waits in the bin. Billing's own four
         surfaces follow, because a document cannot be raised until there is
         a customer to raise it against. */
      { href: "/billing/customers/new" as Route, label: "New Customer KYC", Icon: UserPlus, exact: true },
      { href: "/billing/customers" as Route, label: "Customer Master", Icon: Users, exact: true },
      { href: "/billing/customers/addresses" as Route, label: "Customer Address Book", Icon: BookUser, exact: true },

      { href: "/billing/documents" as Route, label: "Billing Document", Icon: FileText, exact: false },
      /* ── CONTRACTS, ABOVE ADMIN MASTER ────────────────────────────────
         2026-09-19: "create new section in side panel above admin master".
         A contract caps what may be billed to a client and raises its bills
         as ordinary tax invoices in Documents — so it sits after Documents
         and before the masters. All Contracts stays lit on a contract's own
         pages, but not on Create Contract, which lights up on its own. */
      { href: "/billing/contracts" as Route, label: "All Contracts", Icon: ScrollText, exact: false, not: ["/billing/contracts/new"] },
      /* NO MASTERS RAIL IN THIS ROOM (2026-09-20). Admin Master and Customer
         Master DD both went: the only master data Billing owns is the customer
         itself, in Customer Master. Everything else an invoice is built from —
         the issuing company's PAN, GSTIN, bank, signatory and number series —
         is a BILLING PROFILE, and those are entered in the Admin Panel under
         Admin › Billing Profiles. One place to edit, one place to look. */
      /* COLLECTION MASTER, moved out of Accounts on 2026-09-21.
       *
       * It was always a `link` to /outstanding rather than a page of its own,
       * and what it points at is the receipts ledger — revenue, which is this
       * room's subject and not Accounts'. The page did not move and did not
       * change; only which rail lists it. The Sales room still lists the same
       * destination as "Outstanding", which is the collections chase rather
       * than the master view — two doors to one ledger, deliberately, the same
       * way Overtime is reachable from both HR and Accounts. */
      { href: "/outstanding" as Route, label: "Collection Master", Icon: IndianRupee },
      { href: "/billing/recycle-bin" as Route, label: "Recycle Bin", Icon: Trash2, exact: true },
    ],
    groups: [],
  },
  // Hand-holding is an AREA INSIDE OPERATIONS now — same arrangement as `events`
  // directly above. Ambassadors stays its OWN entry (the brief keeps it apart
  // from the four client categories, so it is a rail item, not a tab).
  "people-allocation": { top: HANDHOLDING_ITEMS, groups: [] },
  // Operations itself. The rail that actually renders is chosen per PATH by
  // OPERATIONS_SECTION_NAV — this is the front door, and the fallback for any
  // /operations route that grows later without its own section.
  operations: OPERATIONS_NAV,
  // Project — a single-surface room: the hierarchy planning table. This is the
  // ONLY project surface left: the older /projects board (a WMS rail item) was
  // removed, so every door into the Project → Milestone → Result → Action tree
  // is one of the level items below.
  "project-plan": {
    // One room, one board, six ways in. Each level item is the SAME hierarchy
    // table scoped to that level (app/(app)/project-plan/plan-page.tsx) rather
    // than six screens to keep in step — pick "Results" and you get every
    // result in the plan, under the milestone it belongs to.
    //
    // `exact` on Projects only: it is the bare /project-plan route, so without
    // it every child route would light it up too.
    top: [
      // THE WHOLE PLAN AS ONE TREE, and therefore the way in — it sits above
      // Projects because it is the only item that answers "what is in this
      // plan?" without a click. The five level items below it slice the same
      // rows by level once you know which branch you want.
      { href: "/project-plan/views" as Route, label: "Project Views", Icon: Telescope },
      { href: "/project-plan" as Route, label: "Projects", Icon: FolderTree, exact: true },
      { href: "/project-plan/milestones" as Route, label: "Milestones", Icon: Flag },
      { href: "/project-plan/results" as Route, label: "Results", Icon: Target },
      { href: "/project-plan/actions" as Route, label: "Actions", Icon: ListChecks },
      { href: "/project-plan/sub-actions" as Route, label: "Sub-Actions", Icon: CornerDownRight },
      // The same board component WMS renders, narrowed to plan-linked tasks.
      { href: "/project-plan/kanban" as Route, label: "Kanban", Icon: SquareKanban },
    ],
    groups: [],
  },
  // Monthly Events Master is an AREA INSIDE OPERATIONS now (2026-09-11) and owns
  // no path of its own, so this entry is unreachable — workspaceForPath sends
  // /events to `operations`. Kept because WorkspaceId still lists it (old
  // /ws/events links resolve) and this Record must be total; it shares the live
  // array so the dead copy cannot drift from the rail people actually see.
  events: { top: EVENTS_ITEMS, groups: [] },
  goals: {
    // One button per planning level — each opens a dedicated level page (the
    // weekly-goals BOARD design), locked to that level; the sidebar IS the
    // level navigator. The rituals sit below. Level pages need GOALS_CANVAS_ON
    // (they redirect to /goals when off).
    top: [
      // DASHBOARD FIRST, because it is where the room's front door drops you:
      // WORKSPACE_LANDING.goals is "/goals/dashboard" and `/ws/goals` routes
      // there too. Without a pill for it, entering Goals landed on a page the
      // rail did not list — nothing highlighted, and no way back to it once you
      // clicked away. Reported 2026-09-15.
      //
      // `canvasOnly` for the same reason the three level pages carry it: the
      // page itself does `if (!goalsCanvasOn()) redirect("/goals")`, so with the
      // flag off this pill would be a dead link.
      {
        href: "/goals/dashboard" as Route,
        label: "Dashboard",
        Icon: LayoutDashboard,
        canvasOnly: true,
      },
      // yearly rootView — the FY's YEAR objectives themselves (drill → Quarterly).
      { href: "/goals/yearly" as Route, label: "Yearly Goals", Icon: Trophy, canvasOnly: true },
      { href: "/goals/quarterly" as Route, label: "Quarterly Goals", Icon: Target, canvasOnly: true },
      { href: "/goals/monthly" as Route, label: "Monthly Goals", Icon: CalendarRange, canvasOnly: true },
      // Weekly = the REAL weekly board (WeeklyCascadeBoard over weekly_goals,
      // its own week nav). /goals/week is a permanent redirect alias to it.
      { href: "/goals/weekly" as Route, label: "Weekly Goals", Icon: CalendarCheck },
      // DAILY GOALS — the same page as WMS › Daily Goals, on the same `/my-day`
      // href (Sir 2026-08-20: "keep it right below Weekly Goals"). Deliberately
      // NOT a second route: one planner, one URL, one set of daily_checklist
      // rows. `/goals/plan` remains a redirect stub to it.
      //
      // NOTE the side effect of sharing the href: workspaceForPath maps
      // `/my-day` to the WMS room, so opening it from here switches the sidebar
      // to WMS. Pointing this entry at `/goals/plan` instead would keep the
      // rail but bounce through a redirect to the same place.
      { href: "/my-day" as Route, label: "Daily Goals", Icon: CalendarDays },
      // "Cascade" removed — the canvas is retired as the UI; the four level
      // pages (board design) + rituals below are the whole module. Cross-level
      // moves live in each card's "Move to…" drawer (the drag-to-sidebar
      // bridge left with the canvas).
      // "Team Productivity", on the speedometer — it reads as a performance
      // gauge rather than a second generic dashboard, and matches the icon the
      // Productivity module already carries.
      { href: "/goals/weekly/team" as Route, label: "Team Productivity", Icon: Gauge },
      { href: "/goals/review" as Route, label: "Review", Icon: ClipboardList },
      { href: "/goals/approve" as Route, label: "Approve", Icon: CalendarRange },
      { href: "/goals/recycle-bin" as Route, label: "Recycle Bin", Icon: Trash2, adminOnly: true },
    ],
    groups: [],
  },
  // Productivity Dashboard — a top-level room of its own, NOT part of Goals.
  // "My Dashboard" is the personal view everyone gets; Team Performance is the
  // manager/admin overview and is hidden from plain employees (§19). Both the
  // page and the data layer re-assert this — the nav flag is convenience, not
  // the boundary (§23).
  productivity: {
    top: [
      { href: "/productivity" as Route, label: "My Dashboard", Icon: Gauge, exact: true },
      {
        href: "/productivity/team" as Route,
        label: "Team Performance",
        Icon: Users,
        managerOnly: true,
      },
      // Appraisal — moved here from the Employees room, where it was a standalone
      // entry. Same module, same route target under a new roof: the workbench,
      // its engine and its `appr_*` tables are untouched.
      //
      // Deliberately NOT `managerOnly`. Appraisal's own scope (assigned
      // manager/management in appr_config, admin sees all) already decides who
      // may open whose scorecard, and everyone has their own — hiding the entry
      // from employees would take away a surface they are entitled to and that
      // five inbox notifications link them straight to.
      { href: "/productivity/appraisal" as Route, label: "Appraisal", Icon: Award },
    ],
    groups: [],
  },
};

/** Admin PERSONAL goals space — the private set: five level pages + Recycle
 *  Bin, no team-accountability rituals. Same routes as professional; the pages
 *  render personal-scoped data based on the goals_space cookie. */
const GOALS_PERSONAL_NAV: WorkspaceNav = {
  top: [
    { href: "/goals/yearly" as Route, label: "Yearly Goals", Icon: Trophy },
    { href: "/goals/quarterly" as Route, label: "Quarterly Goals", Icon: Target },
    { href: "/goals/monthly" as Route, label: "Monthly Goals", Icon: CalendarRange },
    { href: "/goals/weekly" as Route, label: "Weekly Goals", Icon: CalendarCheck },
    // Daily Goals — same page, same href as the professional rail above.
    { href: "/my-day" as Route, label: "Daily Goals", Icon: CalendarDays },
    { href: "/goals/recycle-bin" as Route, label: "Recycle Bin", Icon: Trash2, adminOnly: true },
  ],
  groups: [],
};

/* ────────────────────────────────────────────────────────────────────────
   PAGE TITLES — derived from the nav above, never re-typed.

   The top bar shows the name of the page you are on ("WMS Dashboard", "Daily
   Goals", "Aging Heatmap"…). That name already exists: it is the label on the
   rail item that got you there. Deriving it here means renaming a nav item
   renames the header with it, and a page can never end up with a title that
   disagrees with the rail highlighting it.

   Declared AFTER every nav constant on purpose — these are module-level consts
   and reading one before its initialiser has run yields undefined.
   ──────────────────────────────────────────────────────────────────────── */
const NAV_TITLE_ENTRIES: Array<[string, string]> = (() => {
  const out: Array<[string, string]> = [];
  const push = (nav: WorkspaceNav) => {
    // TABBED ITEMS ARE SKIPPED. Incentive's six rail entries all sit on
    // `/incentive`, so pushing them would put six labels on one path and the
    // longest-prefix search below — which breaks ties by taking the first —
    // would title the module "Dashboard". The module's own name is given
    // explicitly in TITLE_OVERRIDES instead.
    for (const i of nav.top) if (!i.tab) out.push([i.href as string, i.label]);
    for (const g of nav.groups)
      for (const i of g.items) if (!i.tab) out.push([i.href as string, i.label]);
  };
  for (const nav of Object.values(WORKSPACE_NAV)) push(nav);
  for (const nav of Object.values(HR_SECTION_NAV)) push(nav);
  push(OPERATIONS_NAV);
  // The area pages are not in OPERATIONS_NAV (they live on the quick-access
  // row), so their titles are pushed from the shared list directly.
  for (const a of OPERATIONS_AREAS)
    for (const it of a.items) out.push([it.href, it.label]);
  push(GOALS_PERSONAL_NAV);
  // Appended to every rail at render rather than living in any one nav object,
  // so its page title has to be named here or `/index-hub` would resolve to no
  // title at all.
  out.push([IMPORTANT_LINKS_ITEM.href as string, IMPORTANT_LINKS_ITEM.label]);
  return out;
})();

/**
 * The page name for a path, or null if no nav item covers it.
 *
 * LONGEST PREFIX WINS. `/dashboard/done` has to resolve to "Done Dashboard",
 * not to "WMS Dashboard" just because `/dashboard` also matches — and a detail
 * route like `/tasks/<id>` has to fall back to its parent's "Tasks" rather than
 * to nothing at all.
 */
/* Paths whose rail label does not survive being read alone. "Index" is a fine
   name for the first pill in the Accounts rail, where the rail itself says
   Accounts; as the only heading on the screen it says nothing. Small by
   design — the rail label is right almost everywhere. */
const TITLE_OVERRIDES: Record<string, string> = {
  "/accounts": "Accounts",
  "/operations/masters": "Masters",
  // The module's name, because its six rail entries are tabs on this one path
  // and are skipped above. Without this the heading would be blank — it used to
  // come from the Employees rail's "Incentive" pill, which has moved.
  "/incentive": "Incentive",
  "/hub": "Hub",
  "/": "Hub",
};

export function navTitleFor(pathname: string): string | null {
  const override = TITLE_OVERRIDES[pathname];
  if (override) return override;
  // The Archive is not a WORKSPACE_NAV entry (it is pinned in the rail's foot,
  // not the nav list), so the loop below cannot name it and every section would
  // fall back to the room's own label — "WMS" over Archive Tasks. Its registry
  // is the same source of truth the rail item reads.
  if (pathname === "/archive") return "Archive";
  if (pathname.startsWith("/archive/")) {
    const id = pathname.slice("/archive/".length).split("/")[0];
    if (isArchiveSectionId(id)) return archiveSection(id).label;
  }
  let best: string | null = null;
  let bestLen = -1;
  for (const [href, label] of NAV_TITLE_ENTRIES) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (href.length > bestLen) {
        best = label;
        bestLen = href.length;
      }
    }
  }
  return best;
}

export function MainNav({
  activeTasks,
  isAdmin,
  variant,
  cookieWorkspace,
  goalsCanvasEnabled,
  goalsSpace,
  isManager = false,
  canSeeHhAccess = false,
  hiddenNodeKeys,
}: Props) {
  const pathname = usePathname();
  // Which TAB the current page is showing, for the single-page modules whose
  // rail entries are tabs (Incentive). Null on every other route, where no item
  // carries a `tab` and this is never consulted.
  const activeTab = useSearchParams()?.get("tab") ?? null;

  // A Set once per render rather than an `includes` per nav item. Undefined when
  // the matrix does not govern this viewer, in which case nothing is filtered.
  const hidden = useMemo(
    () => (hiddenNodeKeys ? new Set(hiddenNodeKeys) : null),
    [hiddenNodeKeys],
  );

  // Path wins (keeps the bar in sync with the page you're actually on); the
  // cookie covers shared surfaces; WMS is the floor.
  const workspace: WorkspaceId =
    workspaceForPath(pathname) ?? cookieWorkspace ?? "wms";
  // In the admin's PERSONAL goals space, the nav is the private set: the level
  // pages + Recycle Bin (no Team / Review / Commit / Approve rituals). HR is
  // two-tier: its rail swaps per lifecycle stage. Operations is two-tier too,
  // but the other way round — its rail is FIXED (the four areas) and the second
  // tier is the quick-access row above the content, so nothing to swap here.
  const { top: roomTop, groups } =
    workspace === "goals" && goalsSpace === "personal"
      ? GOALS_PERSONAL_NAV
      : workspace === "hr"
        ? HR_SECTION_NAV[hrSectionForPath(pathname)]
        : WORKSPACE_NAV[workspace];

  // Important Links rides along with whichever rail was just resolved. Guarded
  // so a room that ever lists it explicitly does not end up with it twice.
  const top: NavItem[] = roomTop.some((i) => i.href === IMPORTANT_LINKS_ITEM.href)
    ? roomTop
    : [...roomTop, IMPORTANT_LINKS_ITEM];

  /** bug #11 — with GOALS_CANVAS_ON off the level pages server-redirect to
   *  /goals, so their pills read as dead: hide the canvas-only items and
   *  repoint the ones with a working legacy destination. The repointed item
   *  drops its `not` list (it must highlight on its own fallback path). */
  function resolveCanvasItems(items: NavItem[]): NavItem[] {
    if (goalsCanvasEnabled) return items;
    return items.flatMap((it) => {
      if (it.canvasOnly) return [];
      if (it.canvasOffHref) return [{ ...it, href: it.canvasOffHref, not: undefined }];
      return [it];
    });
  }

  /** True when this item, or anything folded inside it, is the current page. */
  function isActiveDeep(item: NavItem): boolean {
    return item.children
      ? item.children.some((c) => isActiveDeep(c))
      : isActive(item);
  }

  function isActive(item: NavItem): boolean {
    // A tabbed item is on the same path as its five siblings, so the pathname
    // alone would light all six. The tab decides — and when the URL names none,
    // the item marked `tabDefault` is the one the module actually opened on.
    if (item.tab) {
      if (pathname !== item.href) return false;
      return activeTab === null ? item.tabDefault === true : activeTab === item.tab;
    }
    if (item.exact) return pathname === item.href;
    // Segment-aware: only match the exact path or a true sub-path, so
    // `/goals/week` never lights up on `/goals/weekly` (prefix collision).
    if (pathname !== item.href && !pathname.startsWith(item.href + "/")) return false;
    if (item.not?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
    return true;
  }

  /**
   * Is this destination hidden by the permission matrix?
   *
   * `nodeKeyForPath` is the same longest-prefix resolver the server guards use,
   * so the rail and the route agree about which node an href belongs to. A path
   * the catalogue does not claim returns null and is never hidden — the matrix
   * has no opinion about it, and inventing one would blank rail entries at
   * random as routes are added.
   */
  function hiddenByMatrix(item: NavItem): boolean {
    if (!hidden || hidden.size === 0) return false;
    const key = nodeKeyForPath(item.href);
    return key != null && hidden.has(key);
  }

  function visible(items: NavItem[]): NavItem[] {
    return resolveCanvasItems(items).filter(
      (it) =>
        (!it.adminOnly || isAdmin) &&
        (!it.managerOnly || isManager || isAdmin) &&
        (!it.hhAccessOnly || canSeeHhAccess) &&
        !hiddenByMatrix(it),
    );
  }

  /**
   * Which disclosures are open.
   *
   * A key is only present once the user has actually clicked that parent. Until
   * then the fallback is `isActiveDeep`, so arriving on /accounts/shares-register
   * from a link or a refresh shows MIS already open with the current page lit,
   * rather than a collapsed rail that gives no clue where you are.
   */
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const isExpanded = (item: NavItem): boolean =>
    openKeys[navKey(item)] ?? isActiveDeep(item);
  const toggleExpanded = (item: NavItem) =>
    setOpenKeys((m) => ({ ...m, [navKey(item)]: !(m[navKey(item)] ?? isActiveDeep(item)) }));

  function renderPill(item: NavItem) {
    return (
      <MainNavPill
        key={navKey(item)}
        href={navHref(item)}
        label={item.label}
        Icon={item.Icon}
        active={isActive(item)}
        count={item.countKey === "activeTasks" ? activeTasks : undefined}
        variant={variant}
      />
    );
  }

  /**
   * A rail entry in the sidebar — either a plain pill, or a disclosure that
   * folds its children away.
   *
   * The children are rendered but HIDDEN rather than dropped when collapsed, so
   * they stay in the document: a rail is a navigation landmark, and a screen
   * reader or an in-page find should still be able to reach "Shares Master"
   * without knowing it is behind a toggle that has to be clicked first.
   */
  function renderDrawerItem(item: NavItem) {
    if (!item.children) return renderPill(item);
    const kids = visible(item.children);
    if (kids.length === 0) return null;
    const open = isExpanded(item);
    return (
      <div key={navKey(item)} className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => toggleExpanded(item)}
          aria-expanded={open}
          className={`nav-pill w-full justify-between ${
            isActiveDeep(item) ? "nav-pill-active" : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <item.Icon className="size-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={`size-4 shrink-0 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        <div className={`flex flex-col gap-1 pl-4 ${open ? "" : "hidden"}`}>
          {kids.map(renderPill)}
        </div>
      </div>
    );
  }

  const topPills = visible(top);

  const moreSections = groups
    .map((g) => ({
      label: g.label,
      items: visible(g.items).map((it) => ({
        href: navHref(it),
        label: it.label,
        Icon: it.Icon,
        active: isActive(it),
      })),
    }))
    .filter((s) => s.items.length > 0);

  // ── Mobile drawer: switcher on top, then flat pills (+ "More" group inline).
  if (variant === "drawer") {
    return (
      <nav aria-label="Primary" className="flex flex-col gap-1 w-full">
        {topPills.map(renderDrawerItem)}
        {groups.map((group) => {
          const items = visible(group.items);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-1.5 flex flex-col gap-1">
              <div className="nav-drawer-section">{group.label}</div>
              {items.map(renderDrawerItem)}
            </div>
          );
        })}
      </nav>
    );
  }

  // ── Desktop: workspace switcher · top pills · "More" dropdown.
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
    >
      {topPills.map((item) =>
        item.children ? (
          // The horizontal bar has no room to expand in place, so the same
          // children open as a dropdown here — the idiom this variant already
          // uses for "More".
          <MainNavGroup
            key={navKey(item)}
            label={item.label}
            Icon={item.Icon}
            items={visible(item.children).map((it) => ({
              href: navHref(it),
              label: it.label,
              Icon: it.Icon,
              active: isActive(it),
            }))}
            active={isActiveDeep(item)}
          />
        ) : (
          renderPill(item)
        ),
      )}
      {moreSections.length > 0 && (
        <>
          <span aria-hidden className="nav-group-divider" />
          <MainNavGroup
            label="More"
            Icon={LayoutGrid}
            sections={moreSections}
            active={moreSections.some((s) => s.items.some((it) => it.active))}
          />
        </>
      )}
    </nav>
  );
}
