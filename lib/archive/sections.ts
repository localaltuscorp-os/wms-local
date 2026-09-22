/**
 * THE ARCHIVE — where an ex-employee's work goes when they leave.
 *
 * Sir's rule (2026-09): "all inactive employees — all their tasks and history,
 * all their goals, KPIs, DCC, incentives — should all go in Archives. So
 * Archive Tasks, Archive Goals, Archive DCC, Archive Incentives, etc. in each
 * module. Here all past employee data will be stored in whatever condition and
 * state — specifically their done work or old records."
 *
 * TWO HALVES (Sir, 2026-09). Past Employees is the default and the reason the
 * Archive exists; Present Employees is the same fifteen readings pointed at
 * people still on the roster, for "show me everything of X's" without opening
 * nine modules. The switch lives at the top of every archive page and travels
 * in the URL as `?scope=present` — see ARCHIVE_SCOPES in ./map.
 *
 * HOW IT IS BUILT — a VIEW, not a move. The rows stay in the tables they were
 * written to; the Archive is the module-by-module reading of them scoped to one
 * side of `employees.is_active`. Physically relocating a leaver's rows into
 * parallel "archive_*" tables would break every foreign key pointed at them
 * (a task's events, a goal's actuals, a salary run's payments), rewrite history
 * the audit trail depends on, and give the app two shapes for the same record.
 * Scoping instead means "whatever condition and state" is literally true: the
 * row you see in the Archive IS the row as it was left, nothing copied and
 * nothing normalised.
 *
 * THE RAIL. Every room's sidebar carries an Archive item pinned at the bottom,
 * above the profile/logout bar (components/layout/sidebar-route-chrome.tsx).
 * A room with one section links straight to it and wears its name ("Archive
 * Tasks"); a room with several (Employees has DCC, Incentives, Attendance,
 * Leaves, Reimbursements) says "Archive" and opens on its first section, with
 * the rest one chip away.
 *
 * WHERE THE PIECES LIVE. `./map` holds the section ids and the room each one
 * belongs to — no icons, so `lib/workspaces.ts` can import it without dragging
 * an icon set into the app's one pure module. This file adds the names, icons
 * and blurbs on top of it, and re-exports the routing half so callers have one
 * import. The database half is lib/queries/archive.ts.
 */
import {
  Award,
  CalendarCheck,
  FolderArchive,
  FolderTree,
  Gauge,
  IndianRupee,
  ListTodo,
  Plane,
  Receipt,
  Target,
  Timer,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import { ARCHIVE_SECTION_WORKSPACE, type ArchiveSectionId } from "./map";

export {
  ARCHIVE_RECORD_KINDS,
  ARCHIVE_SCOPES,
  ARCHIVE_SCOPE_LABEL,
  ARCHIVE_SECTION_IDS,
  ARCHIVE_SECTION_WORKSPACE,
  archiveQuery,
  archiveWorkspaceForPath,
  isArchiveRecordKind,
  isArchiveScope,
  isArchiveSectionId,
  parseArchiveScope,
  type ArchiveRecordKind,
  type ArchiveScope,
  type ArchiveSectionId,
} from "./map";

export interface ArchiveSection {
  id: ArchiveSectionId;
  /** Rail + page title, in Sir's naming: "Archive <Module>". */
  label: string;
  /** The chip name inside a room that owns several sections. */
  short: string;
  workspace: WorkspaceId;
  Icon: LucideIcon;
  /** One line under the title: exactly which records this section holds. */
  blurb: string;
  /**
   * Does anything here carry an ARCHIVE FLAG of its own — a row somebody can
   * put away one at a time?
   *
   * It decides what the Present half shows. Tasks, goals, DCC items, KPI
   * assignments, claims, HR documents, plan items and Team Performance rows all
   * have an archive button behind them, so archiving one moves it into Present
   * Employees. An attendance punch, a leave application, a salary run, an
   * incentive entry and an appraisal score do NOT: nothing there can be put
   * away by hand, so those sections stand empty until the person leaves and the
   * Past half claims their whole trail.
   */
  archivable: boolean;
}

/** The registry as authored — the room comes from ./map, never re-typed here. */
type SectionCopy = Omit<ArchiveSection, "workspace">;

const SECTION_COPY: readonly SectionCopy[] = [
  {
    id: "tasks",
    archivable: true,
    label: "Archive Tasks",
    short: "Tasks",
    Icon: ListTodo,
    blurb:
      "Every WMS task they were the doer of — done, dropped or still open — plus the ones they raised for other people.",
  },
  {
    id: "goals",
    archivable: true,
    label: "Archive Goals",
    short: "Goals",
    Icon: Target,
    blurb:
      "Their weekly goals, their cascade goals and the daily commitments they planned, at whatever percentage each one stands.",
  },
  {
    id: "dcc",
    archivable: true,
    label: "Archive DCC",
    short: "DCC",
    Icon: Gauge,
    blurb: "The KPI items they owned, every entry they filled, and their day-close reviews.",
  },
  {
    id: "incentives",
    archivable: false,
    label: "Archive Incentives",
    short: "Incentives",
    Icon: Award,
    blurb: "Incentive entries booked against them, the requests they raised, and what was actually paid out.",
  },
  {
    id: "attendance",
    archivable: false,
    label: "Archive Attendance",
    short: "Attendance",
    Icon: CalendarCheck,
    blurb: "Their punch log and the imported monthly attendance sheets.",
  },
  {
    id: "leaves",
    archivable: false,
    label: "Archive Leaves",
    short: "Leaves",
    Icon: Plane,
    blurb: "Leave applications with the decision that was taken, plus any comp-off they had credited.",
  },
  {
    id: "reimbursements",
    archivable: true,
    label: "Archive Reimbursements",
    short: "Reimbursements",
    Icon: Receipt,
    blurb: "Reimbursement claims and their approval state.",
  },
  {
    id: "kpis",
    archivable: true,
    label: "Archive KPIs",
    short: "KPIs",
    Icon: Gauge,
    blurb: "KPI assignments as they stood, and the monthly performance scorecards computed for them.",
  },
  {
    id: "appraisals",
    archivable: false,
    label: "Archive Appraisals",
    short: "Appraisals",
    Icon: Award,
    blurb: "Scorecard lines, dimension scores and reviews from every appraisal cycle they have sat in.",
  },
  {
    id: "team-performance",
    archivable: true,
    label: "Archive Team Performance",
    short: "Team Performance",
    Icon: Users,
    blurb:
      "People taken off the Productivity › Team Performance board. Restore puts the row straight back; nothing about the person changed while it was away.",
  },
  {
    id: "salary",
    archivable: false,
    label: "Archive Salary",
    short: "Salary",
    Icon: Wallet,
    blurb: "Salary runs, payments and advances — the payroll record of the employment.",
  },
  {
    id: "overtime",
    archivable: false,
    label: "Archive Overtime",
    short: "Overtime",
    Icon: Timer,
    blurb: "Overtime hours they logged and how each entry was decided.",
  },
  {
    id: "hr-records",
    archivable: true,
    label: "Archive HR Records",
    short: "HR Records",
    Icon: FolderArchive,
    blurb: "The exit record where there is one, their documents, their help-desk tickets and the employment event log.",
  },
  {
    id: "sales",
    archivable: true,
    label: "Archive Sales",
    short: "Sales",
    Icon: IndianRupee,
    blurb: "Outstanding entries they owned and the references they recorded.",
  },
  {
    id: "plan",
    archivable: true,
    label: "Archive Project Work",
    short: "Project Work",
    Icon: FolderTree,
    blurb: "Plan nodes they owned or were on the team of, and the plan-linked tasks assigned to them.",
  },
] as const;

export const ARCHIVE_SECTIONS: readonly ArchiveSection[] = SECTION_COPY.map((s) => ({
  ...s,
  workspace: ARCHIVE_SECTION_WORKSPACE[s.id],
}));

const BY_ID = new Map<string, ArchiveSection>(ARCHIVE_SECTIONS.map((s) => [s.id, s]));

export function archiveSection(id: ArchiveSectionId): ArchiveSection {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown archive section: ${id}`);
  return s;
}

/** The sections a room owns, in registry order. Empty for rooms that hold no
 *  employee-linked records of their own (Admin, Billing, Events, Hand-holding —
 *  their tables key off clients and participants, not employees). */
export function sectionsForWorkspace(ws: WorkspaceId | null | undefined): ArchiveSection[] {
  if (!ws) return [];
  return ARCHIVE_SECTIONS.filter((s) => s.workspace === ws);
}

/** Where a room's rail Archive item points, and what it is called there. */
export function archiveRailFor(ws: WorkspaceId | null | undefined): { href: string; label: string } {
  const own = sectionsForWorkspace(ws);
  if (own.length === 0) return { href: "/archive", label: "Archive" };
  if (own.length === 1) return { href: `/archive/${own[0]!.id}`, label: own[0]!.label };
  return { href: `/archive/${own[0]!.id}`, label: "Archive" };
}

