"use client";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  House,
  ListTodo,
  ClipboardList,
  CalendarDays,
  FolderKanban,
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
  IndianRupee,
  Wallet,
  Compass,
  Receipt,
  ReceiptIndianRupee,
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
  CheckCircle2,
  Users2,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { MainNavPill } from "./main-nav-pill";
import { MainNavGroup } from "./main-nav-group";
import { workspaceForPath, type WorkspaceId } from "@/lib/workspaces";
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
    { href: "/support" as Route, label: "Help Desk", Icon: LifeBuoy },
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
  const m = p.match(/^\/hr\/(pre-interview|post-interview|pre-joining|post-joining|exit)(\/|$)/);
  if (m) return m[1] as HrStageKey;
  if (p.startsWith("/hr/candidates")) return "pre-interview"; // Basic Details lives here

  if (p.startsWith("/holidays")) return "holiday";
  if (p.startsWith("/support") || p.startsWith("/hr/routing") || p.startsWith("/hr/metrics")) return "helpdesk";
  return "hub";
}

/**
 * Per-workspace navigation. Each room exposes ONLY its own modules — entering
 * WMS never shows Attendance/Salary/Outstanding, and vice-versa. Shared platform
 * surfaces (Inbox, Archived, Profile, Admin Panel) intentionally live in the
 * avatar menu, reachable from every workspace, so they don't clutter any one
 * room's bar. Only LIVE routes are listed; new modules join as they ship.
 */
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
      { href: "/projects" as Route, label: "Projects", Icon: FolderKanban },
      // Important Links — the curated directory (was the Marketing room's only
      // surface; Marketing retired as a workspace 2026-07).
      { href: "/index-hub" as Route, label: "Important Links", Icon: Compass },
    ],
    // No "More" dropdown — Documents already lives in the profile/avatar menu.
    groups: [],
  },
  employees: {
    top: [
      // Order (Sir, 2026-07): Attendance · DCC · Incentive · My Salary ·
      // Reimbursements. HR Record moved to the HR room; the admin Salary module
      // + Overtime moved to the Accounts room.
      //
      // APPRAISAL IS NO LONGER HERE. It moved into Team Productivity
      // (/productivity/appraisal) and is linked from that room's rail instead —
      // one door, not two. The route it used to point at, /appraisal, still
      // resolves: it redirects to the new home so old bookmarks and the inbox
      // notifications keep working.
      // Order (Sir, 2026-08): DCC · Leaves · Attendance · Live Status, then the
      // rest. Leave and Live Status were both reachable only from inside the
      // attendance page before — Leave as a link, Live Status as a rail panel —
      // which put a whole-team snapshot on the screen an individual visits to
      // clock in. Each now has its own door.
      { href: "/dcc" as Route, label: "DCC", Icon: Gauge },
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
      { href: "/incentive" as Route, label: "Incentive", Icon: Award },
      { href: "/my-salary" as Route, label: "My Salary", Icon: Wallet },
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
  training: {
    top: [
      {
        href: "/training" as Route,
        label: "Library",
        Icon: GraduationCap,
        not: [
          "/training/feedback", "/training/induction", "/training/dashboard",
          "/training/calendar", "/training/self-learning", "/training/share", "/training/obligations",
        ],
      },
      { href: "/training/calendar" as Route, label: "Calendar", Icon: CalendarClock },
      { href: "/training/self-learning" as Route, label: "Self-Learning", Icon: BookMarked },
      { href: "/training/share" as Route, label: "Share", Icon: Share2 },
      { href: "/training/obligations" as Route, label: "Obligations", Icon: Gauge },
    ],
    groups: [
      {
        label: "More",
        Icon: LayoutGrid,
        items: [
          { href: "/training/induction" as Route, label: "Induction", Icon: ListChecks },
          { href: "/training/feedback" as Route, label: "Feedback", Icon: MessageSquareHeart },
          { href: "/training/dashboard" as Route, label: "Dashboard", Icon: LayoutDashboard },
        ],
      },
    ],
  },
  accounts: {
    // The Accounts module owns its own bar — never the WMS pills. "Index" is the
    // full section directory; the live sections sit beside it. New sections join
    // here as they ship.
    top: [
      // "Back to Admin" removed — the Admin control-room is reached only via the
      // profile menu. "Task List" removed — migrated into the WMS task list.
      { href: "/accounts" as Route, label: "Index", Icon: LayoutGrid, exact: true },
      { href: "/accounts/weekly-checklist" as Route, label: "Weekly Checklist", Icon: CalendarCheck },
      { href: "/accounts/monthly-quarterly-annual" as Route, label: "Monthly Checklist", Icon: CalendarRange },
      { href: "/accounts/cc-tracker" as Route, label: "CC Master", Icon: CreditCard },
      { href: "/accounts/due-dates" as Route, label: "Due Dates", Icon: CalendarClock },
      { href: "/accounts/sip-tracker" as Route, label: "SIP", Icon: PiggyBank },
      { href: "/accounts/fno-income" as Route, label: "FNO Income", Icon: LineChart },
      { href: "/accounts/cash-withdrawal" as Route, label: "Cash Withdrawal", Icon: Banknote },
      { href: "/accounts/bank-balance" as Route, label: "Bank Balance", Icon: Landmark },
      { href: "/accounts/vasa-family-interpersonal" as Route, label: "Vasa Family", Icon: Users },
      { href: "/accounts/shares-register" as Route, label: "Shares", Icon: CandlestickChart },
      { href: "/accounts/income-tax-master-folder" as Route, label: "IT Folder", Icon: FolderArchive },
      { href: "/accounts/ca-handover" as Route, label: "CA Handover", Icon: ShieldCheck },
      // Payroll — the admin Salary module + Overtime, re-parented from Employees
      // (2026-07). Gated by the Accounts room + each page's own finance guard.
      { href: "/salary" as Route, label: "Salary", Icon: IndianRupee },
      { href: "/overtime" as Route, label: "Overtime", Icon: Timer, not: ["/overtime/dashboard"] },
    ],
    groups: [],
  },
  billing: {
    // Billing — the revenue ledger. One surface today (the live billing sheet);
    // invoices / payments / cycles join here as they ship.
    top: [{ href: "/billing" as Route, label: "Billing", Icon: ReceiptIndianRupee, exact: true }],
    groups: [],
  },
  "people-allocation": {
    // Ambassadors is its OWN entry — the brief keeps it apart from the four
    // client categories, so it gets its own rail item, not a tab.
    top: [
      { href: "/people-allocation" as Route, label: "Hand-holding", Icon: Users2, exact: true },
      { href: "/people-allocation/participants" as Route, label: "All Participants", Icon: ClipboardList },
      { href: "/people-allocation/ambassadors" as Route, label: "Ambassadors", Icon: Handshake },
      { href: "/people-allocation/development" as Route, label: "Development", Icon: Sparkles },
      {
        href: "/people-allocation/access" as Route,
        label: "Admin Panel",
        Icon: ShieldCheck,
        hhAccessOnly: true,
      },
    ],
    groups: [],
  },
  // Project — a single-surface room: the hierarchy planning table. The older
  // /projects board is deliberately NOT listed here; it stays a WMS rail item,
  // so neither room's sidebar changes shape.
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
  events: {
    // Monthly Events Master — the calendar is the hero; masters/batches/
    // obligations are admin surfaces. (Holidays moved to HR.)
    top: [
      { href: "/events" as Route, label: "Overview", Icon: LayoutGrid, exact: true },
      { href: "/events/calendar" as Route, label: "Calendar", Icon: CalendarDays },
      { href: "/events/masters" as Route, label: "Masters", Icon: Palette, adminOnly: true },
      { href: "/events/batches" as Route, label: "Batches", Icon: CalendarClock, adminOnly: true },
      { href: "/events/obligations" as Route, label: "Obligations", Icon: Gauge, adminOnly: true },
    ],
    groups: [],
  },
  goals: {
    // One button per planning level — each opens a dedicated level page (the
    // weekly-goals BOARD design), locked to that level; the sidebar IS the
    // level navigator. The rituals sit below. Level pages need GOALS_CANVAS_ON
    // (they redirect to /goals when off).
    top: [
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

export function MainNav({
  activeTasks,
  isAdmin,
  variant,
  cookieWorkspace,
  goalsCanvasEnabled,
  goalsSpace,
  isManager = false,
  canSeeHhAccess = false,
}: Props) {
  const pathname = usePathname();

  // Path wins (keeps the bar in sync with the page you're actually on); the
  // cookie covers shared surfaces; WMS is the floor.
  const workspace: WorkspaceId =
    workspaceForPath(pathname) ?? cookieWorkspace ?? "wms";
  // In the admin's PERSONAL goals space, the nav is the private set: the level
  // pages + Recycle Bin (no Team / Review / Commit / Approve rituals). The HR
  // room is two-tier: the rail swaps per lifecycle stage (hrSectionForPath).
  const { top, groups } =
    workspace === "goals" && goalsSpace === "personal"
      ? GOALS_PERSONAL_NAV
      : workspace === "hr"
        ? HR_SECTION_NAV[hrSectionForPath(pathname)]
        : WORKSPACE_NAV[workspace];

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

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    // Segment-aware: only match the exact path or a true sub-path, so
    // `/goals/week` never lights up on `/goals/weekly` (prefix collision).
    if (pathname !== item.href && !pathname.startsWith(item.href + "/")) return false;
    if (item.not?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
    return true;
  }

  function visible(items: NavItem[]): NavItem[] {
    return resolveCanvasItems(items).filter(
      (it) =>
        (!it.adminOnly || isAdmin) &&
        (!it.managerOnly || isManager || isAdmin) &&
        (!it.hhAccessOnly || canSeeHhAccess),
    );
  }

  function renderPill(item: NavItem) {
    return (
      <MainNavPill
        key={item.href}
        href={item.href}
        label={item.label}
        Icon={item.Icon}
        active={isActive(item)}
        count={item.countKey === "activeTasks" ? activeTasks : undefined}
        variant={variant}
      />
    );
  }

  const topPills = visible(top);

  const moreSections = groups
    .map((g) => ({
      label: g.label,
      items: visible(g.items).map((it) => ({
        href: it.href,
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
        {topPills.map(renderPill)}
        {groups.map((group) => {
          const items = visible(group.items);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-1.5 flex flex-col gap-1">
              <div className="nav-drawer-section">{group.label}</div>
              {items.map(renderPill)}
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
      {topPills.map(renderPill)}
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
