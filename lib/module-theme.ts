import {
  ShieldCheck,
  LayoutGrid,
  Users,
  TrendingUp,
  BriefcaseBusiness,
  GraduationCap,
  CalendarDays,
  Target,
  ReceiptIndianRupee,
  type LucideIcon,
  Gauge,
  Users2,
  FolderTree,
} from "lucide-react";
import type { Route } from "next";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * THE module identity + color system (meeting 2026-06-29: "every module has a
 * specific color so we know which module we're in"). One source of truth for
 * each workspace's accent, deep accent, hero photo, icon, label and tagline —
 * consumed by the Hub front door AND by each module's own bespoke chrome, so a
 * module is instantly recognizable by color everywhere inside it.
 *
 * WMS keeps the Altus red identity (its existing look is unchanged). Every other
 * module gets a distinct, accessible accent.
 */
export interface ModuleTheme {
  id: WorkspaceId;
  label: string;
  tagline: string;
  href: Route;
  Icon: LucideIcon;
  /** Primary accent (buttons, active states, headers). */
  accent: string;
  /** Darker accent for text-on-tint + gradients. */
  accentDeep: string;
  /** Hero photo for the Hub card (public/hub/*). WMS has none — the founder is
   *  designing its logo treatment, so its card stays a branded logo card. */
  image: string | null;
}

export const MODULE_THEME: Record<WorkspaceId, ModuleTheme> = {
  wms: {
    id: "wms",
    label: "WMS",
    tagline: "The work dashboard - tasks, goals & the daily loop.",
    href: "/ws/wms" as Route,
    Icon: LayoutGrid,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
  admin: {
    id: "admin",
    label: "Accounts",
    tagline: "Accounts, compliance & the control room.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3A32A6",
    image: "/hub/admin.png",
  },
  employees: {
    id: "employees",
    label: "Employees",
    tagline: "Attendance, performance, salary, incentives & people ops.",
    href: "/ws/employees" as Route,
    Icon: Users,
    accent: "#16a34a",
    accentDeep: "#0F5B2E",
    image: "/hub/employees.png",
  },
  // HR — the paperwork room: dossier, agreements, policies, letters, queries &
  // support. Teal identity — distinct from Employees green and Events cyan.
  hr: {
    id: "hr",
    label: "HR",
    tagline: "Dossier, agreements, policies, letters & employee support.",
    href: "/ws/hr" as Route,
    Icon: BriefcaseBusiness,
    accent: "#0d9488",
    accentDeep: "#0B5A54",
    image: null,
  },
  sales: {
    id: "sales",
    label: "Sales",
    tagline: "Collections, references & breakthroughs.",
    href: "/ws/sales" as Route,
    Icon: TrendingUp,
    accent: "#7c3aed",
    accentDeep: "#5b21b6",
    image: "/hub/sales.png",
  },
  // Marketing retired as a room (2026-07): its only surface (/index-hub) now
  // lives inside WMS as "Important Links".
  training: {
    id: "training",
    label: "Training",
    tagline: "Material library, tests, induction & feedback.",
    href: "/ws/training" as Route,
    Icon: GraduationCap,
    accent: "#2563eb",
    accentDeep: "#1d4ed8",
    image: "/hub/training.png",
  },
  // Accounts is no longer a top-level hub card — it now lives INSIDE the Admin
  // module (which opens to it). It inherits Admin's indigo identity so the two
  // read as one module. Kept here so MODULE_THEME covers every WorkspaceId.
  accounts: {
    id: "accounts",
    label: "Accounts",
    tagline: "Compliance, trackers & the accountant's checklist.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3A32A6",
    image: null,
  },
  // Monthly Events Master — cyan identity, distinct from the other rooms. Sir's
  // monthly Event Master planning sheet, rebuilt in the WMS.
  events: {
    id: "events",
    label: "Monthly Events Master",
    tagline: "The company calendar - batches, holidays & obligations in one grid.",
    href: "/ws/events" as Route,
    Icon: CalendarDays,
    accent: "#0891b2",
    accentDeep: "#0B5567",
    image: null,
  },
  // Goals — Sir's yearly-goal sheet as a live Y→Q→M→W cascade + the Saturday
  // commit / Monday approve / Plan-Your-Day daily loop. Deep amber-gold identity,
  // distinct from WMS red and Employees green.
  goals: {
    id: "goals",
    label: "Goals",
    tagline: "Yearly → quarterly → monthly → weekly, committed and delivered daily.",
    href: "/ws/goals" as Route,
    Icon: Target,
    accent: "#b45309",
    accentDeep: "#7C3D09",
    image: null,
  },
  // Productivity Dashboard — a top-level module of its own, sitting beside Goals
  // rather than inside it. Distinct slate/indigo accent so the hub reads it as a
  // separate room, not a Goals sub-surface.
  productivity: {
    id: "productivity",
    label: "Team Productivity",
    tagline: "One cockpit per person - incentive, goals, tasks, training at a glance.",
    href: "/ws/productivity" as Route,
    Icon: Gauge,
    accent: "#4338ca",
    accentDeep: "#312e81",
    image: null,
  },
  // Billing — invoices, payments, billing cycles & revenue. Purple identity:
  // adjacent to Sales' violet (they share the money story) but a clearly
  // distinct hue, so the two rooms never read as one.
  billing: {
    id: "billing",
    label: "Billing",
    tagline: "Invoices, payments, billing cycles & revenue management.",
    href: "/billing" as Route,
    Icon: ReceiptIndianRupee,
    accent: "#9333ea",
    accentDeep: "#7e22ce",
    image: null,
  },
  // Hand-holding — who is staffed on which client. Orange, its own identity:
  // it left Billing and should not read as a purple annex of it.
  "people-allocation": {
    id: "people-allocation",
    label: "HandHolding",
    tagline: "Who is staffed on which client, product and team.",
    href: "/people-allocation" as Route,
    Icon: Users2,
    accent: "#ea580c",
    accentDeep: "#c2410c",
    image: null,
  },
  // Project — the planning hierarchy (Project → Milestone → Result → Action).
  // The WMS red on purpose: its executable rows ARE WMS tasks (one `tasks`
  // record, shown from a second angle), so the two rooms are meant to read as
  // one family rather than as neighbours.
  "project-plan": {
    id: "project-plan",
    label: "Project",
    tagline: "Projects, milestones, results & the actions under them.",
    href: "/project-plan" as Route,
    Icon: FolderTree,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
};

/** Hub display order. */
// The hub grid renders THIS list, not MODULE_THEME's keys — a module with a
// theme entry but no place here is fully configured and still invisible, which
// is exactly how Productivity shipped without a card. Adding a room means adding
// it in both places.
export const MODULE_ORDER: WorkspaceId[] = [
  "wms",          // 1
  "goals",        // 2
  "productivity", // 3  — "Team Productivity"
  "billing",      // 4
  "hr",           // 5
  "sales",        // 6
  "admin",        // 7  — the card labelled "Accounts"
  "training",     // 8
  "employees",    // 9
  "events",       // 0  — "Monthly Events Master"
  // Past the tenth there is no digit left, so this one renders unnumbered.
  "people-allocation", // 11 — "HandHolding"
  "project-plan",      // 12 — "Project" (sits beside HandHolding)
];

/**
 * Keyboard shortcut for the module at `index` in MODULE_ORDER: the first nine
 * are 1–9 and the tenth is 0, matching a keyboard's number row left to right.
 *
 * Derived from POSITION rather than stored per module, so the order above stays
 * the only thing anyone edits — the hub badges, the footer prefixes and the
 * key handler all read the same list and cannot drift apart. Past the tenth
 * module there is no digit left, so it returns null and those render unnumbered
 * rather than repeating a shortcut.
 */
export function moduleShortcut(index: number): string | null {
  if (index < 0 || index > 9) return null;
  return index === 9 ? "0" : String(index + 1);
}

/** The module a pressed digit should open, or undefined if none. */
export function moduleForShortcut(key: string): WorkspaceId | undefined {
  if (!/^[0-9]$/.test(key)) return undefined;
  return MODULE_ORDER[key === "0" ? 9 : Number(key) - 1];
}
