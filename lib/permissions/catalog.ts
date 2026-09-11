/**
 * THE PERMISSION CATALOGUE — every module, sub-module and sub-sub-module the
 * application actually has, and the routes each one guards.
 *
 * PURE. No `server-only`, no DB, no icons, no React. The Master Admin screen
 * (client), the resolver (server) and the guards (server) all read this one
 * definition, so what an administrator switches off is necessarily the same node
 * a route refuses.
 *
 * ── WHY THE TREE IS CODE AND THE GRANTS ARE DATA ───────────────────────────
 * A permission node means nothing unless something enforces it, and what
 * enforces it is a route. If the tree lived in a table, an admin could create a
 * node that no route consults — a switch wired to nothing, which reads as
 * "denied" on screen while the module stays wide open — or delete a node a guard
 * still names, refusing everyone with no visible cause. Neither failure shows up
 * where it was caused.
 *
 * Keeping the tree here makes the catalogue checkable: `tests/unit/
 * permission-catalog.test.ts` walks every node and asserts its routes resolve to
 * real page files on disk, that no route is claimed by two nodes, and that every
 * key is unique. A node cannot drift from the app without a test going red.
 *
 * ── THREE LEVELS, BECAUSE THE APP HAS THREE ────────────────────────────────
 * Module = a workspace (the hub cards, `lib/workspaces.ts`). Sub-module = a rail
 * entry inside it. Sub-sub-module = a surface reached from that entry. The brief
 * asks for exactly this shape and gives WMS › Tasks › Task Report as the
 * example; that node is `wms.tasks.report`, guarding `/dashboard/task-report`.
 *
 * Not every branch reaches three levels, and none is padded to look symmetrical
 * — a sub-module with one surface has no children, because inventing a
 * sub-sub-module identical to its parent would give an administrator two
 * switches for one thing and no way to know which won.
 *
 * ── HOW TO ADD A MODULE ────────────────────────────────────────────────────
 * Add the node, list its routes, run the tests. If a route you name does not
 * exist the catalogue test fails; if you forget to name a route it stays
 * governed by its parent, which is the safe default rather than ungoverned.
 */

/** The three actions the brief names. */
export const PERMISSION_ACTIONS = ["show", "view", "edit"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  show: "Show",
  view: "View",
  edit: "Edit",
};

export const PERMISSION_ACTION_HINTS: Record<PermissionAction, string> = {
  show: "Appears in their navigation",
  view: "May open it and read the data",
  edit: "May create, change or delete",
};

export interface PermissionNode {
  /** Dotted, stable, and the value stored in `module_permissions.node_key`.
   *  Renaming one orphans its grants, so treat it as a database value. */
  key: string;
  label: string;
  /**
   * Route prefixes this node governs. A request under one of them is subject to
   * this node's permission. Matched longest-first, so a child's route wins over
   * its parent's — `/tasks/kanban` resolves to `wms.tasks.kanban`, not
   * `wms.tasks`, even though the parent's prefix also matches.
   *
   * Empty is legal for a pure grouping node that owns no route of its own.
   */
  routes?: readonly string[];
  /** One line for the Master Admin screen, where an administrator decides. */
  note?: string;
  children?: readonly PermissionNode[];
}

/**
 * THE CATALOGUE.
 *
 * Ordered as the hub orders its cards, so the matrix screen reads in the same
 * sequence as the application.
 */
export const PERMISSION_CATALOG: readonly PermissionNode[] = [
  {
    key: "wms",
    label: "WMS",
    note: "Work management — the task system and its dashboards.",
    children: [
      {
        key: "wms.dashboard",
        label: "WMS Dashboard",
        routes: ["/dashboard"],
        children: [
          { key: "wms.dashboard.done", label: "Done Dashboard", routes: ["/dashboard/done"] },
          {
            key: "wms.dashboard.task-report",
            label: "Task Report",
            routes: ["/dashboard/task-report"],
            note: "The brief's worked example of a sub-sub-module.",
          },
        ],
      },
      {
        key: "wms.tasks",
        label: "Tasks",
        routes: ["/tasks"],
        children: [
          { key: "wms.tasks.kanban", label: "Kanban", routes: ["/tasks/kanban"] },
          { key: "wms.tasks.new", label: "New Task", routes: ["/tasks/new"] },
          { key: "wms.tasks.import", label: "Import", routes: ["/tasks/import"] },
          { key: "wms.tasks.duplicates", label: "Duplicates", routes: ["/tasks/duplicates"] },
          { key: "wms.tasks.agenda", label: "Agenda", routes: ["/tasks/agenda"] },
          { key: "wms.tasks.time", label: "Time Intelligence", routes: ["/tasks/time"] },
        ],
      },
      { key: "wms.my-day", label: "Daily Goals", routes: ["/my-day"] },
      { key: "wms.review", label: "Review", routes: ["/review"] },
      { key: "wms.projects", label: "Projects", routes: ["/projects"] },
      { key: "wms.index-hub", label: "Important Links", routes: ["/index-hub"] },
      { key: "wms.daily-checklist", label: "Daily Checklist", routes: ["/daily-checklist"] },
    ],
  },

  {
    key: "employees",
    label: "Employees",
    note: "The employee-facing room: attendance, leave, salary, reimbursements.",
    children: [
      {
        key: "employees.dcc",
        label: "DCC",
        routes: ["/dcc"],
        children: [
          { key: "employees.dcc.dashboard", label: "DCC Dashboard", routes: ["/dcc/dashboard"] },
          { key: "employees.dcc.ranking", label: "DCC Ranking", routes: ["/dcc/ranking"] },
        ],
      },
      {
        key: "employees.attendance",
        label: "Attendance",
        routes: ["/attendance"],
        children: [
          { key: "employees.attendance.leave", label: "Leaves", routes: ["/attendance/leave"] },
          {
            key: "employees.attendance.remote-work",
            label: "Remote Work",
            routes: ["/attendance/remote-work"],
          },
          {
            key: "employees.attendance.dashboard",
            label: "Attendance Dashboard",
            routes: ["/attendance/dashboard"],
          },
          {
            key: "employees.attendance.insights",
            label: "Attendance Insights",
            routes: ["/attendance/insights"],
          },
          {
            key: "employees.attendance.live-status",
            label: "Live Status",
            routes: ["/attendance/live-status"],
          },
          {
            key: "employees.attendance.hr-record",
            label: "HR Record",
            routes: ["/attendance/hr-record"],
          },
          {
            key: "employees.attendance.confirmations",
            label: "Confirmations",
            routes: ["/attendance/confirmations"],
          },
          {
            key: "employees.attendance.devices",
            label: "Devices",
            routes: ["/attendance/devices"],
            note: "Device authorization is ALSO gated by the device.manage capability, which this cannot widen.",
          },
          {
            key: "employees.attendance.change-log",
            label: "Change Log",
            routes: ["/attendance/change-log"],
          },
          {
            key: "employees.attendance.work-session",
            label: "Work Session",
            routes: ["/attendance/work-session"],
          },
        ],
      },
      { key: "employees.incentive", label: "Incentive", routes: ["/incentive"] },
      {
        key: "employees.my-salary",
        label: "My Salary",
        routes: ["/my-salary"],
        note: "Always self-scoped. This node governs whether the page is reachable, never whose salary it shows.",
      },
      {
        key: "employees.reimbursements",
        label: "Reimbursements",
        routes: ["/reimbursements"],
        children: [
          {
            key: "employees.reimbursements.dashboard",
            label: "Reimbursement Dashboard",
            routes: ["/reimbursements/dashboard"],
          },
        ],
      },
      { key: "employees.queries", label: "Queries & Notifications", routes: ["/queries"] },
      { key: "employees.overtime", label: "Overtime", routes: ["/overtime"] },
    ],
  },

  {
    key: "hr",
    label: "HR",
    note: "The hiring and lifecycle room.",
    children: [
      { key: "hr.overview", label: "HR Overview", routes: ["/hr", "/hr/overview"] },
      { key: "hr.stages", label: "Lifecycle Stages", routes: ["/hr/[stage]"] },
      { key: "hr.candidates", label: "Candidates", routes: ["/hr/candidates"] },
      { key: "hr.intake", label: "Candidate Intake", routes: ["/hr/intake"] },
      { key: "hr.evaluation", label: "Evaluation", routes: ["/hr/evaluation"] },
      {
        key: "hr.management-assessment",
        label: "Management Assessment",
        routes: ["/hr/management-assessment"],
      },
      { key: "hr.hiring-analytics", label: "Hiring Analytics", routes: ["/hr/hiring-analytics"] },
      { key: "hr.induction", label: "Induction", routes: ["/hr/induction"] },
      { key: "hr.record", label: "HR Record", routes: ["/hr/record"] },
      { key: "hr.kpi", label: "HR KPI", routes: ["/hr/kpi"] },
      { key: "hr.ctc", label: "CTC", routes: ["/hr/ctc"] },
      { key: "hr.salary-slip", label: "Salary Slip", routes: ["/hr/salary-slip"] },
      { key: "hr.letters", label: "Letters", routes: ["/hr/letters"] },
      // These three have NO page at the bare segment — only children. Naming
      // the real paths keeps the catalogue test honest: a route listed here that
      // does not exist on disk is a switch wired to nothing, which is worse than
      // no switch. `/hr/policies/[key]` is the literal directory name, and the
      // prefix match means it governs every policy under it.
      { key: "hr.policies", label: "Policies", routes: ["/hr/policies/[key]"] },
      {
        key: "hr.forms",
        label: "Forms",
        routes: ["/hr/forms/[id]", "/hr/all-forms", "/hr/my-forms"],
      },
      { key: "hr.exit", label: "Exit", routes: ["/hr/exit/interview"] },
      { key: "hr.holidays", label: "Holiday List", routes: ["/hr/holidays", "/holidays"] },
      {
        key: "hr.helpdesk",
        label: "Help Desk",
        routes: ["/support"],
        children: [
          { key: "hr.helpdesk.routing", label: "Ticket Routing", routes: ["/hr/routing"] },
          { key: "hr.helpdesk.metrics", label: "Support Metrics", routes: ["/hr/metrics"] },
        ],
      },
    ],
  },

  {
    key: "sales",
    label: "Sales",
    note: "Department-restricted room (see WORKSPACE_DEPARTMENT). This cannot widen that.",
    children: [
      {
        key: "sales.ambassadors",
        label: "Ambassadors",
        routes: ["/ambassadors"],
        children: [
          {
            key: "sales.ambassadors.pipeline",
            label: "Pipeline",
            routes: ["/ambassadors/pipeline"],
          },
          {
            key: "sales.ambassadors.directory",
            label: "Directory",
            routes: ["/ambassadors/directory"],
          },
          {
            key: "sales.ambassadors.commissions",
            label: "Commissions",
            routes: ["/ambassadors/commissions"],
          },
        ],
      },
      { key: "sales.people-gives", label: "People Gives", routes: ["/people-gives"] },
      {
        key: "sales.outstanding",
        label: "Outstanding",
        routes: ["/outstanding"],
        children: [
          {
            key: "sales.outstanding.contracts",
            label: "Contracts",
            routes: ["/outstanding/contracts"],
          },
        ],
      },
      {
        key: "sales.breakthrough",
        label: "Breakthrough",
        routes: ["/participant-breakthrough"],
      },
      { key: "sales.references", label: "References", routes: ["/record-reference"] },
    ],
  },

  {
    key: "accounts",
    label: "Accounts",
    note: "Finance. Each section additionally passes its own finance guard.",
    children: [
      { key: "accounts.index", label: "Index", routes: ["/accounts"] },
      {
        key: "accounts.checklists",
        label: "Checklists",
        children: [
          {
            key: "accounts.checklists.weekly",
            label: "Weekly Checklist",
            routes: ["/accounts/weekly-checklist"],
          },
          {
            key: "accounts.checklists.monthly",
            label: "Monthly Checklist",
            routes: ["/accounts/monthly-quarterly-annual"],
          },
        ],
      },
      {
        key: "accounts.trackers",
        label: "Trackers",
        children: [
          { key: "accounts.trackers.cc", label: "CC Master", routes: ["/accounts/cc-tracker"] },
          {
            key: "accounts.trackers.due-dates",
            label: "Due Dates",
            routes: ["/accounts/due-dates"],
          },
          { key: "accounts.trackers.sip", label: "SIP", routes: ["/accounts/sip-tracker"] },
          {
            key: "accounts.trackers.fno",
            label: "FNO Income",
            routes: ["/accounts/fno-income"],
          },
          {
            key: "accounts.trackers.cash-withdrawal",
            label: "Cash Withdrawal",
            routes: ["/accounts/cash-withdrawal"],
          },
          {
            key: "accounts.trackers.bank-balance",
            label: "Bank Balance",
            routes: ["/accounts/bank-balance"],
          },
          {
            key: "accounts.trackers.shares",
            label: "Shares Register",
            routes: ["/accounts/shares-register"],
          },
          {
            key: "accounts.trackers.vasa-family",
            label: "Vasa Family",
            routes: ["/accounts/vasa-family-interpersonal"],
          },
          {
            key: "accounts.trackers.it-folder",
            label: "IT Folder",
            routes: ["/accounts/income-tax-master-folder"],
          },
        ],
      },
      {
        key: "accounts.ca-handover",
        label: "CA Handover",
        routes: ["/accounts/ca-handover"],
        note: "The credential vault. Super-admin-only by its own guard; this cannot widen it.",
      },
      {
        key: "accounts.payroll",
        label: "Payroll",
        routes: ["/salary"],
        children: [
          { key: "accounts.payroll.analytics", label: "Analytics", routes: ["/salary/analytics"] },
          { key: "accounts.payroll.ctc", label: "CTC", routes: ["/salary/ctc"] },
          { key: "accounts.payroll.documents", label: "Documents", routes: ["/salary/documents"] },
          { key: "accounts.payroll.policy", label: "Policy", routes: ["/salary/policy"] },
          {
            key: "accounts.payroll.incentive-payout",
            label: "Incentive Payout",
            routes: ["/salary/incentive-payout"],
          },
        ],
      },
      { key: "accounts.task-list", label: "Task List", routes: ["/accounts/task-list"] },
    ],
  },

  {
    key: "billing",
    label: "Billing",
    note: "The revenue ledger. Product selection reads the product master.",
    children: [{ key: "billing.ledger", label: "Billing Ledger", routes: ["/billing"] }],
  },

  {
    key: "goals",
    label: "Goals",
    children: [
      { key: "goals.dashboard", label: "Goals Dashboard", routes: ["/goals/dashboard"] },
      { key: "goals.yearly", label: "Yearly Goals", routes: ["/goals/yearly"] },
      { key: "goals.quarterly", label: "Quarterly Goals", routes: ["/goals/quarterly"] },
      { key: "goals.monthly", label: "Monthly Goals", routes: ["/goals/monthly"] },
      {
        key: "goals.weekly",
        label: "Weekly Goals",
        routes: ["/goals/weekly", "/goals/week", "/weekly-goals"],
        children: [
          {
            key: "goals.weekly.team",
            label: "Team Productivity",
            routes: ["/goals/weekly/team"],
          },
          {
            key: "goals.weekly.dashboard",
            label: "Weekly Dashboard",
            routes: ["/weekly-goals/dashboard"],
          },
        ],
      },
      { key: "goals.review", label: "Goals Review", routes: ["/goals/review"] },
      { key: "goals.approve", label: "Goals Approve", routes: ["/goals/approve"] },
      { key: "goals.commit", label: "Commit", routes: ["/goals/commit"] },
      { key: "goals.import", label: "Import", routes: ["/goals/import"] },
      { key: "goals.cascade", label: "Cascade", routes: ["/goals/cascade"] },
      { key: "goals.plan", label: "Plan", routes: ["/goals/plan"] },
      { key: "goals.recycle-bin", label: "Recycle Bin", routes: ["/goals/recycle-bin"] },
    ],
  },

  {
    key: "productivity",
    label: "Team Productivity",
    children: [
      { key: "productivity.mine", label: "My Productivity", routes: ["/productivity"] },
      {
        key: "productivity.team",
        label: "Team Performance",
        routes: ["/productivity/team"],
        note: "Manager-gated by the org chart. This cannot widen that.",
      },
      {
        key: "productivity.appraisal",
        label: "Appraisal",
        routes: ["/productivity/appraisal", "/appraisal"],
        children: [
          { key: "productivity.appraisal.admin", label: "Appraisal Admin", routes: ["/appraisal/admin"] },
          { key: "productivity.appraisal.config", label: "Appraisal Config", routes: ["/appraisal/config"] },
          { key: "productivity.appraisal.culture", label: "Culture", routes: ["/appraisal/culture"] },
        ],
      },
      { key: "productivity.report", label: "Report", routes: ["/productivity/report"] },
    ],
  },

  {
    key: "pms",
    label: "Performance (PMS)",
    children: [
      { key: "pms.overview", label: "PMS Overview", routes: ["/pms"] },
      { key: "pms.review", label: "PMS Review", routes: ["/pms/review"] },
      { key: "pms.signals", label: "Signals", routes: ["/pms/signals"] },
      { key: "pms.config", label: "PMS Config", routes: ["/pms/config"] },
      { key: "pms.v3", label: "PMS v3", routes: ["/pms/v3"] },
    ],
  },

  {
    key: "training",
    label: "Training",
    children: [
      { key: "training.library", label: "Library", routes: ["/training"] },
      { key: "training.calendar", label: "Calendar", routes: ["/training/calendar"] },
      { key: "training.self-learning", label: "Self-Learning", routes: ["/training/self-learning"] },
      { key: "training.share", label: "Share", routes: ["/training/share"] },
      { key: "training.obligations", label: "Obligations", routes: ["/training/obligations"] },
      { key: "training.induction", label: "Induction", routes: ["/training/induction"] },
      { key: "training.feedback", label: "Feedback", routes: ["/training/feedback"] },
      { key: "training.dashboard", label: "Training Dashboard", routes: ["/training/dashboard"] },
      { key: "training.new", label: "New Training", routes: ["/training/new"] },
    ],
  },

  {
    key: "events",
    label: "Monthly Events Master",
    children: [
      { key: "events.overview", label: "Overview", routes: ["/events"] },
      { key: "events.calendar", label: "Calendar", routes: ["/events/calendar"] },
      { key: "events.masters", label: "Masters", routes: ["/events/masters"] },
      { key: "events.batches", label: "Batches", routes: ["/events/batches"] },
      { key: "events.obligations", label: "Obligations", routes: ["/events/obligations"] },
    ],
  },

  {
    key: "people-allocation",
    label: "Hand-holding",
    children: [
      { key: "people-allocation.board", label: "Hand-holding", routes: ["/people-allocation"] },
      {
        key: "people-allocation.participants",
        label: "All Participants",
        routes: ["/people-allocation/participants"],
      },
      {
        key: "people-allocation.ambassadors",
        label: "Ambassadors",
        routes: ["/people-allocation/ambassadors"],
      },
      {
        key: "people-allocation.development",
        label: "Development",
        routes: ["/people-allocation/development"],
      },
      {
        key: "people-allocation.access",
        label: "Access / Permissions",
        routes: ["/people-allocation/access"],
        note: "Hand-holding's own access dialog. Gated by canAccessAdminPanel; this cannot widen it.",
      },
    ],
  },

  {
    key: "project-plan",
    label: "Project",
    children: [
      { key: "project-plan.views", label: "Project Views", routes: ["/project-plan/views"] },
      { key: "project-plan.projects", label: "Projects", routes: ["/project-plan"] },
      { key: "project-plan.milestones", label: "Milestones", routes: ["/project-plan/milestones"] },
      { key: "project-plan.results", label: "Results", routes: ["/project-plan/results"] },
      { key: "project-plan.actions", label: "Actions", routes: ["/project-plan/actions"] },
      {
        key: "project-plan.sub-actions",
        label: "Sub-Actions",
        routes: ["/project-plan/sub-actions"],
      },
      { key: "project-plan.kanban", label: "Kanban", routes: ["/project-plan/kanban"] },
    ],
  },

  {
    key: "admin",
    label: "Admin Panel",
    note: "Already admin-only by its layout. These nodes narrow WITHIN that.",
    children: [
      { key: "admin.overview", label: "Overview", routes: ["/admin"] },
      { key: "admin.activity", label: "Activity", routes: ["/admin/activity"] },
      {
        key: "admin.people",
        label: "People",
        children: [
          { key: "admin.people.employees", label: "Employees", routes: ["/admin/employees"] },
          {
            key: "admin.people.hierarchy",
            label: "Reporting Hierarchy",
            routes: ["/admin/hierarchy"],
          },
          { key: "admin.people.departments", label: "Departments", routes: ["/admin/departments"] },
          {
            key: "admin.people.designations",
            label: "Designations",
            routes: ["/admin/designations"],
          },
          { key: "admin.people.holidays", label: "Holidays", routes: ["/admin/holidays"] },
          {
            key: "admin.people.salary-profiles",
            label: "Salary Profiles",
            routes: ["/admin/salary-profiles"],
          },
        ],
      },
      {
        key: "admin.masters",
        label: "Masters",
        children: [
          { key: "admin.masters.clients", label: "Client Master", routes: ["/admin/clients"] },
          { key: "admin.masters.subjects", label: "Subject Master", routes: ["/admin/subjects"] },
          { key: "admin.masters.products", label: "Product Master", routes: ["/admin/products"] },
          {
            key: "admin.masters.payment-modes",
            label: "Payment Modes",
            routes: ["/admin/outstanding-payment-modes"],
          },
          {
            key: "admin.masters.outstanding-products",
            label: "Products (Outstanding view)",
            routes: ["/admin/outstanding-products"],
          },
          {
            key: "admin.masters.entities",
            label: "Outstanding Entities",
            routes: ["/admin/outstanding-entities"],
          },
          {
            key: "admin.masters.responsibles",
            label: "Outstanding Responsibles",
            routes: ["/admin/outstanding-responsibles"],
          },
          {
            key: "admin.masters.paying-entities",
            label: "Paying Entities",
            routes: ["/admin/paying-entities"],
          },
          {
            key: "admin.masters.client-locations",
            label: "Client Locations",
            routes: ["/admin/client-locations"],
          },
          {
            key: "admin.masters.leave-categories",
            label: "Leave Categories",
            routes: ["/admin/leave-categories"],
          },
        ],
      },
      {
        key: "admin.temporary-access",
        label: "Temporary Access",
        routes: ["/admin/temporary-access"],
        note: "Granting is additionally gated by the reporting hierarchy or the delegated_access.grant_any capability.",
      },
      {
        key: "admin.system",
        label: "System",
        children: [
          {
            key: "admin.system.notifications",
            label: "Notifications",
            routes: ["/admin/notifications"],
          },
          {
            key: "admin.system.task-reminders",
            label: "Task Reminders",
            routes: ["/admin/task-reminders"],
          },
          { key: "admin.system.settings", label: "Settings", routes: ["/admin/settings"] },
        ],
      },
    ],
  },

  {
    key: "master-admin",
    label: "Master Admin",
    note: "The permission matrix itself. Gated by the master_admin.manage capability and NOT governed by this table — see resolveModulePermissions.",
    routes: ["/master-admin"],
  },

  {
    key: "platform",
    label: "Platform",
    note: "Surfaces that belong to no single room and are reached from the avatar menu.",
    children: [
      { key: "platform.hub", label: "Hub", routes: ["/hub"] },
      { key: "platform.profile", label: "Profile", routes: ["/profile"] },
      { key: "platform.inbox", label: "Inbox", routes: ["/inbox"] },
      { key: "platform.archived", label: "Archived", routes: ["/archived"] },
      { key: "platform.documents", label: "Documents", routes: ["/documents"] },
      { key: "platform.policies", label: "Policies", routes: ["/policies"] },
      { key: "platform.letters", label: "Letters", routes: ["/letters"] },
      { key: "platform.agreements", label: "Agreements", routes: ["/agreements"] },
      { key: "platform.communications", label: "Communications", routes: ["/communications"] },
      { key: "platform.dossier", label: "Dossier", routes: ["/dossier"] },
      { key: "platform.portal", label: "Portal", routes: ["/portal"] },
    ],
  },
];

/* ── Derived views. Computed ONCE at module load, not per call. ───────────── */

export interface FlatNode extends PermissionNode {
  /** 1 = module, 2 = sub-module, 3 = sub-sub-module. */
  depth: 1 | 2 | 3;
  /** Ancestors, outermost first — used to walk the inheritance chain. */
  ancestors: readonly string[];
}

function flatten(
  nodes: readonly PermissionNode[],
  depth: 1 | 2 | 3,
  ancestors: readonly string[],
  out: FlatNode[],
): void {
  for (const n of nodes) {
    out.push({ ...n, depth, ancestors });
    if (n.children?.length) {
      // The catalogue is three levels by design. A fourth would silently render
      // as a third on the matrix screen, so it is refused here rather than
      // being quietly flattened.
      if (depth === 3) {
        throw new Error(
          `Permission catalogue: "${n.key}" nests deeper than sub-sub-module. The matrix supports three levels.`,
        );
      }
      flatten(n.children, (depth + 1) as 2 | 3, [...ancestors, n.key], out);
    }
  }
}

const FLAT: readonly FlatNode[] = (() => {
  const out: FlatNode[] = [];
  flatten(PERMISSION_CATALOG, 1, [], out);
  return out;
})();

/** Every node, depth-first, in catalogue order. */
export function allPermissionNodes(): readonly FlatNode[] {
  return FLAT;
}

const BY_KEY: ReadonlyMap<string, FlatNode> = new Map(FLAT.map((n) => [n.key, n]));

export function permissionNode(key: string): FlatNode | undefined {
  return BY_KEY.get(key);
}

/** Is this a key the catalogue actually defines? The write path checks it, so a
 *  typo cannot create a grant that governs nothing. */
export function isPermissionNodeKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Route prefix → node key, longest prefix first.
 *
 * Sorted by descending length so `/tasks/kanban` matches `wms.tasks.kanban`
 * before `wms.tasks`. Built once; the lookup is a linear scan of ~200 entries,
 * which is far cheaper than the query it guards.
 */
const ROUTE_INDEX: readonly { route: string; key: string }[] = FLAT.flatMap((n) =>
  (n.routes ?? []).map((route) => ({ route, key: n.key })),
).sort((a, b) => b.route.length - a.route.length);

/**
 * The most specific node governing `pathname`, or null when nothing does.
 *
 * NULL IS NOT "DENIED". An ungoverned path is simply not in the matrix, and is
 * left entirely to the authorization the application already has. Adding a
 * route to the catalogue is how it becomes governable; until then the answer is
 * honestly "this matrix has no opinion".
 */
export function nodeKeyForPath(pathname: string): string | null {
  const path = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";
  for (const { route, key } of ROUTE_INDEX) {
    if (path === route || path.startsWith(`${route}/`)) return key;
  }
  return null;
}

/**
 * A node and its ancestors, outermost first: ["wms", "wms.tasks", "wms.tasks.kanban"].
 *
 * The inheritance chain the resolver walks. A module switched off must take its
 * sub-modules with it — otherwise hiding WMS would leave every WMS page reachable
 * by direct URL, which is the single most likely way for this feature to be
 * quietly useless.
 */
export function nodeChain(key: string): readonly string[] {
  const n = BY_KEY.get(key);
  if (!n) return [];
  return [...n.ancestors, n.key];
}

/** Every route the catalogue claims — used by the catalogue test. */
export function allCatalogRoutes(): readonly string[] {
  return ROUTE_INDEX.map((r) => r.route);
}
