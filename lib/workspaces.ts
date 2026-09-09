/**
 * Workspaces = the six "rooms" of the company (the hub cards). Each workspace
 * owns a set of routes and shows ONLY its own modules in the top nav — entering
 * WMS must not surface Attendance/Salary/Outstanding, etc.
 *
 * The active workspace is remembered in the `aw` cookie, set when a hub card is
 * opened via `/ws/<id>`. The nav reads it; for cold deep-links it falls back to
 * deriving the owner from the path.
 *
 * This module is intentionally PURE — no icons, no `server-only` — so both the
 * `/ws` route handler (server) and the client nav can import it.
 */
export const WORKSPACE_IDS = [
  "wms",
  "admin",
  "employees",
  "hr",
  "sales",
  "training",
  "accounts",
  "events",
  "goals",
  "productivity",
  "billing",
  "people-allocation",
  "project-plan",
] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export function isWorkspaceId(v: string | undefined | null): v is WorkspaceId {
  return !!v && (WORKSPACE_IDS as readonly string[]).includes(v);
}

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  wms: "WMS",
  admin: "Admin",
  employees: "Employees",
  hr: "HR",
  sales: "Sales",
  training: "Training",
  accounts: "Accounts",
  events: "Monthly Events Master",
  goals: "Goals",
  productivity: "Team Productivity",
  billing: "Billing",
  "people-allocation": "Hand-holding",
  "project-plan": "Project",
};

/** Where each card drops you when you enter the workspace. */
export const WORKSPACE_LANDING: Record<WorkspaceId, string> = {
  wms: "/dashboard",
  // The Admin workspace now opens to Accounts (the day-to-day surface). The
  // red-pill Admin control-room (/admin) is reachable only from the user-menu
  // "Admin panel" link — it's no longer the Admin card's landing.
  admin: "/accounts",
  employees: "/attendance",
  hr: "/hr",
  sales: "/outstanding",
  training: "/training",
  accounts: "/accounts",
  events: "/events",
  // The module entry = the GOALS DASHBOARD — the read-only overview across all
  // five levels, which is what you want to see before deciding which level to
  // go and work in. It used to be the Yearly board, i.e. you landed already
  // inside one level with no view of the rest.
  //
  // With the canvas/board flag OFF that page server-redirects to /goals (the
  // sub-hub) exactly as the Yearly board did, so production behaviour is
  // unchanged until the flag flips.
  goals: "/goals/dashboard",
  // The module opens on the personal view; Team Performance is a tab inside it
  // and is gated per-role, so the landing is the one surface everyone can reach.
  productivity: "/productivity",
  // Billing — invoices, payments, billing cycles & revenue. Its own room now
  // (it used to be reachable only as a tab inside Employees › Incentive).
  billing: "/billing",
  // Hand-holding is its own room: staffing is read and maintained by team leads
  // who have no reason to enter Billing.
  "people-allocation": "/people-allocation",
  // Project — the Project → Milestone → Result → Action hierarchy. Its own room
  // beside Hand-holding. The older /projects board stays where it is, on the
  // WMS rail; this room is the planning table, not a replacement for it.
  "project-plan": "/project-plan",
};

export const ACTIVE_WORKSPACE_COOKIE = "aw";

/**
 * Department-restricted rooms. A user may enter one of these ONLY if they're a
 * super-admin or their department matches (case-insensitive). Rooms not listed
 * are open to everyone (unless role-gated below, e.g. Admin). Match is against
 * the employee's free-text `department`.
 */
export const WORKSPACE_DEPARTMENT: Partial<Record<WorkspaceId, string>> = {
  sales: "Sales",
};

/**
 * WORD-match a required department against every membership the user has, so
 * "Sales", "Sales Team", "Sales & Marketing" all grant a room that requires
 * "Sales" — but "Salesforce Admin" does NOT. `departments` carries EVERY
 * department the user belongs to (structured employee_departments membership +
 * the legacy free-text field), so a multi-department person gets in via any one
 * of their memberships.
 */
export function matchesDepartment(departments: string[], required: string): boolean {
  const req = required.toLowerCase();
  return departments.some((d) =>
    (d ?? "").toLowerCase().split(/[^a-z]+/).includes(req),
  );
}

/**
 * Members of this department may enter the Accounts module (which the hub's
 * Admin card opens, landing on `/accounts`) — the accounts team, without being
 * super-admins. The CA Handover credential vault stays super-admin-only and is
 * guarded separately (`canViewCaHandover`).
 */
export const ACCOUNTS_DEPARTMENT = "Accounts";

export function canAccessWorkspace(
  ws: WorkspaceId,
  user: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean },
): boolean {
  // Super-admins see every room.
  if (user.isSuperAdmin) return true;
  const isAccountsRole = matchesDepartment(user.departments, ACCOUNTS_DEPARTMENT);
  // The Admin card opens the Accounts module (/accounts). Admins OR the Accounts
  // department may enter it. (The /admin control-room is a separate route group
  // with its own isAdmin-only guard, so this does not expose it.)
  if (ws === "admin") return user.isAdmin || isAccountsRole;
  // The Accounts room itself — the Accounts department (super-admins passed above).
  if (ws === "accounts") return isAccountsRole;
  // HR room is OPEN to every employee — but normal employees only see the limited
  // view (own record via /portal, Holiday List, Help Desk). Full HR (super-admins
  // + the "HR" department) is gated per-page/landing via `isHrStaff`/`requireHrStaff`
  // (lib/hr/access.ts) — NOT here, so a normal employee can still reach their
  // limited surfaces.
  // Monthly Events Master — admins (super-admins passed above). The employee
  // holiday-list view is a self-guarded page (`requireUser` only), reachable
  // directly without entering the room.
  if (ws === "events") return user.isAdmin;
  // Department-gated rooms (Sales).
  const required = WORKSPACE_DEPARTMENT[ws];
  if (!required) return true; // open room
  return matchesDepartment(user.departments, required);
}

/**
 * Rooms that are announced but not yet launched. The hub shows the card (as a
 * SOON tile) but `/ws/<id>` refuses entry so the `aw` cookie is never set to a
 * room with no nav.
 */
export const WORKSPACE_COMING_SOON: Partial<Record<WorkspaceId, boolean>> = {};

/**
 * The workspace that OWNS a path. Used to keep the scoped nav in sync with the
 * page you're actually on (path wins), and as the fallback when the `aw` cookie
 * is absent (cold direct-link / refresh).
 *
 * Shared platform surfaces (`/inbox`, `/archived`, `/profile`, `/admin`)
 * intentionally return null — they belong to no single room, so the nav keeps
 * whatever workspace you came in through (the cookie) instead of snapping.
 */
export function workspaceForPath(pathname: string): WorkspaceId | null {
  // "/" is the hub launcher (redirects to /hub) — it belongs to no workspace.
  const p = pathname;

  // Goals — the Y→Q→M→W cascade + commit/approve/plan/review surfaces, plus the
  // Weekly Goals + Daily Checklist modules (re-parented here from WMS).
  if (p.startsWith("/goals")) return "goals";

  // Productivity Dashboard — its own top-level room, deliberately NOT under
  // /goals: it is a separate module at the same level, and letting Goals own the
  // path would swap the sidebar to Goals the moment you opened it.
  if (p.startsWith("/productivity")) return "productivity";

  // Project — the hierarchy planning table. Matched here, above the WMS block:
  // that block claims `/projects` (the older board, which stays a WMS surface),
  // and keeping the two rules apart is what stops a future edit from widening
  // one prefix over the other. `/project-plan` does not start with `/projects`,
  // so the two never overlap today either.
  if (p.startsWith("/project-plan")) return "project-plan";

  // Appraisal moved INTO Team Productivity, so its room moved with it. `/appraisal`
  // itself redirects to `/productivity/appraisal`, but the admin panel still lives
  // on the old path — claiming it here is what keeps the Productivity rail on
  // screen while an admin configures a scorecard, instead of bouncing them into
  // the Employees room the "Configure" button came from.
  // Must sit ABOVE the Employees block below, which used to own `/appraisal`.
  if (p.startsWith("/appraisal")) return "productivity";
  if (p.startsWith("/weekly-goals") || p.startsWith("/daily-checklist")) return "goals";

  // WMS — the work loop (the dashboard now lives at /dashboard). Important
  // Links (/index-hub) moved here from the retired Marketing room.
  // `/my-day` IS Plan My Day (2026-08) — the planner moved out of Goals and
  // onto this room's rail, replacing the old My Day execution board. It is
  // claimed here so opening it from the WMS bar doesn't swap the sidebar over
  // to Goals. The `/goals` rule above still owns `/goals/plan`, which is now
  // only a redirect stub pointing here.
  // `/review` is the same arrangement for Review & Scores (`/goals/review`).
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/my-day") ||
    p.startsWith("/review") ||
    p.startsWith("/tasks") ||
    p.startsWith("/projects") ||
    p.startsWith("/documents") ||
    p.startsWith("/index-hub")
  ) {
    return "wms";
  }

  // HR Record (attendance log) was re-parented to the HR room (2026-07). It
  // lives under /attendance/hr-record, so match it BEFORE the /attendance →
  // employees rule below so the HR rail (not the Employees rail) shows there.
  if (p.startsWith("/attendance/hr-record")) return "hr";

  // Employees — people & pay. NOTE: the admin Salary module (/salary) and
  // Overtime (/overtime) moved to the Accounts room; only the employee's OWN
  // self-service pay view (/my-salary) stays here.
  if (
    p.startsWith("/attendance") ||
    p.startsWith("/my-salary") ||
    p.startsWith("/incentive") ||
    p.startsWith("/reimbursements") ||
    p.startsWith("/leave") ||
    p.startsWith("/dcc") ||
    p.startsWith("/pms") ||
    // `/appraisal` is NOT here any more — Appraisal is part of Team Productivity
    // and is claimed by the rule above.
    // Queries & Notifications re-parented from HR → Employees (2026-07).
    p.startsWith("/queries")
  ) {
    return "employees";
  }

  // HR — the paperwork room: dossier, agreements, policies, letters, support
  // & company-wide communications.
  // (Dossier + Agreements re-parented here from Employees.)
  //
  // /communications belonged to NO workspace, which is why it fell back to the
  // legacy horizontal DashboardHeader nav rather than to any sidebar. Claiming
  // it here retires that header on its own — DashboardHeader returns null once
  // a path maps to a workspace — and lets it use the HR console shell like
  // every other HR surface. Read access is unchanged: the HR room is open to
  // every employee (see canAccessWorkspace); authoring stays gated by isHrStaff.
  if (
    p.startsWith("/hr") ||
    p.startsWith("/dossier") ||
    p.startsWith("/agreements") ||
    p.startsWith("/policies") ||
    p.startsWith("/communications") ||
    p.startsWith("/holidays") ||
    p.startsWith("/letters") ||
    p.startsWith("/support")
  ) {
    return "hr";
  }

  // Sales — collections & relationships
  if (
    p.startsWith("/outstanding") ||
    p.startsWith("/participant-breakthrough") ||
    p.startsWith("/record-reference") ||
    p.startsWith("/people-gives") ||
    p.startsWith("/ambassadors")
  ) {
    return "sales";
  }

  // Training
  if (p.startsWith("/training")) return "training";

  // Accounts — the finance room with its own section nav. The admin Salary
  // module and Overtime were re-parented here from Employees (they're
  // Accounts-managed), so they resolve to this room's nav + access gate.
  if (
    p.startsWith("/accounts") ||
    p.startsWith("/salary") ||
    p.startsWith("/overtime")
  ) {
    return "accounts";
  }

  // Monthly Events Master — the calendar/holidays/obligations room.
  if (p.startsWith("/events")) return "events";

  // Hand-holding — its own room since it moved out of Billing.
  if (p.startsWith("/people-allocation")) return "people-allocation";

  // Billing — invoices, payments, billing cycles & revenue.
  if (p.startsWith("/billing")) return "billing";

  // Shared / unknown — keep the caller's current workspace.
  return null;
}
