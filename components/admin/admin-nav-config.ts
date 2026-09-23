import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  MapPin,
  Activity as ActivityIcon,
  Bell,
  BellRing,
  Users,
  UsersRound,
  Building2,
  Briefcase,
  Tag,
  Package,
  Landmark,
  ReceiptIndianRupee,
  CreditCard,
  UserCog,
  CalendarDays,
  BadgeIndianRupee,
  Gift,
  IdCard,
  Wallet,
  Network,
  KeyRound,
  ShieldCheck,
  FileUp,
  Settings as SettingsIcon,
  ScrollText,
  Eye,
  Clock,
} from "lucide-react";

export interface AdminNavItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  /** Exact match (Overview = /admin, must not light up on every sub-page). */
  exact?: boolean;
}
export interface AdminNavGroup {
  label: string;
  Icon: LucideIcon;
  items: AdminNavItem[];
}

// Shared admin nav config — consumed by the desktop header (AdminTopNav,
// grouped dropdowns) AND the mobile drawer (AdminMobileBar, flat sections),
// so the two never drift.
export const ADMIN_TOP_LEVEL: readonly AdminNavItem[] = [
  { href: "/admin" as Route, label: "Overview", Icon: LayoutGrid, exact: true },
  { href: "/admin/activity" as Route, label: "Activity", Icon: ActivityIcon },
];

export const ADMIN_GROUPS: readonly AdminNavGroup[] = [
  {
    label: "People",
    Icon: UsersRound,
    items: [
      { href: "/admin/employees" as Route, label: "Employees", Icon: Users },
      // The consolidated employee record (0225). Sits directly under Employees
      // because it is a second door onto the SAME rows, not a replacement: the
      // Employees screen keeps the invite, offboarding and previous-employee
      // flows, and this one is the master view with the workspace and bulk edit.
      { href: "/admin/employee-master" as Route, label: "Employee Master", Icon: IdCard },
      // The org chart as a Kanban board. Sits directly under Employees because
      // it edits the same relationship the employee editor's Manager field does
      // — one write path (setReportingManager), two doors onto it.
      { href: "/admin/hierarchy" as Route, label: "Reporting Hierarchy", Icon: Network },
      { href: "/admin/functions" as Route, label: "Functions", Icon: Building2 },
      { href: "/admin/designations" as Route, label: "Designations", Icon: IdCard },
      { href: "/admin/holidays" as Route, label: "Holidays", Icon: CalendarDays },
      { href: "/admin/salary-profiles" as Route, label: "Salary Breakup", Icon: BadgeIndianRupee },
    ],
  },
  {
    label: "Attendance",
    Icon: MapPin,
    items: [
      { href: "/admin/client-locations" as Route, label: "Client Locations", Icon: MapPin },
      { href: "/admin/leave-categories" as Route, label: "Leave Categories", Icon: Tag },
    ],
  },
  {
    // The CANONICAL masters — the lists every dropdown in the application reads.
    // Grouped together and named "Masters" rather than left split across
    // "Clients & Billing" and "Outstanding": Products and Payment Modes are not
    // Outstanding's private lookups any more, and burying the product master in
    // a module-specific group is how a second one gets created by somebody who
    // did not find the first.
    label: "Masters",
    Icon: Briefcase,
    items: [
      { href: "/admin/clients" as Route, label: "Clients", Icon: Briefcase },
      { href: "/admin/subjects" as Route, label: "Subjects", Icon: Tag },
      { href: "/admin/products" as Route, label: "Products", Icon: Package },
      { href: "/admin/outstanding-payment-modes" as Route, label: "Payment Modes", Icon: CreditCard },
      { href: "/admin/billing-master" as Route, label: "Billing Master", Icon: ReceiptIndianRupee },
      { href: "/admin/paying-entities" as Route, label: "Paying Entities", Icon: Building2 },
      { href: "/admin/upload-master" as Route, label: "Upload Master", Icon: FileUp },
    ],
  },
  {
    label: "Outstanding",
    Icon: Wallet,
    items: [
      { href: "/admin/outstanding-entities" as Route, label: "Entities", Icon: Landmark },
      { href: "/admin/outstanding-responsibles" as Route, label: "Responsibles", Icon: UserCog },
      // The older products screen, kept because it is bookmarked and linked from
      // the Outstanding module. Same table, same rows, no code column — see
      // app/(admin)/admin/products/page.tsx.
      { href: "/admin/outstanding-products" as Route, label: "Products (legacy view)", Icon: Package },
    ],
  },
  // BILLING — back as a group with ONE entry, Billing Profiles (Manan,
  // 2026-09-19: the Billing Admin Master's Edit links land here, so it has to
  // be findable from the rail). The other four billing masters stay off it,
  // per the note below.
  {
    label: "Billing",
    Icon: ReceiptIndianRupee,
    items: [
      { href: "/admin/billing-profiles" as Route, label: "Billing Profiles", Icon: Building2 },
    ],
  },
  // (Previously:) NO "Billing" GROUP. It held five masters — Billing Profiles, Customers,
  // Product Billing Fields, Payment Terms, SAC Codes. Manan, 2026-09-16,
  // against a screenshot of the group: "remove this also".
  //
  // The ROUTES are untouched: app/(admin)/admin/billing-* still exist and still
  // render, and their permission nodes in lib/permissions/catalog.ts still
  // govern them. Only the rail entry is gone, so the pages are reachable by URL
  // but are no longer offered in the admin nav.
  {
    // The Incentive Master and its Incentive Chart. A group of its own rather
    // than another line under "Masters": it is not just a list the dropdowns
    // read — it decides who is eligible to earn from each scheme — and the
    // brief's own structure is Admin Panel → Incentive → Incentive Master.
    label: "Incentive",
    Icon: BadgeIndianRupee,
    items: [
      { href: "/admin/incentive-master" as Route, label: "Incentive Master", Icon: Gift },
    ],
  },
  {
    label: "Access",
    Icon: KeyRound,
    items: [
      // Task Visibility stays its own heading; Temporary Access moved under
      // Control Panel (below), its one canonical location.
      { href: "/admin/access-control" as Route, label: "Task Visibility", Icon: ShieldCheck },
    ],
  },
  {
    // THE CONTROL PANEL — the central surface for managing who has access to
    // what. Temporary Access relocated here (reused, not rebuilt).
    label: "Control Panel",
    Icon: ShieldCheck,
    items: [
      { href: "/admin/control-panel/users" as Route, label: "Users", Icon: Users },
      { href: "/admin/control-panel/roles" as Route, label: "Roles", Icon: UserCog },
      { href: "/admin/control-panel/permissions" as Route, label: "Permissions", Icon: KeyRound },
      { href: "/admin/control-panel/effective-access" as Route, label: "Effective Access", Icon: Eye },
      { href: "/admin/control-panel/temporary-access" as Route, label: "Temporary Access", Icon: Clock },
    ],
  },
  {
    label: "System",
    Icon: SettingsIcon,
    items: [
      { href: "/admin/notifications" as Route, label: "Notifications", Icon: Bell },
      { href: "/admin/task-reminders" as Route, label: "Task Reminders", Icon: BellRing },
      { href: "/admin/logs" as Route, label: "Logs", Icon: ScrollText },
      { href: "/admin/settings" as Route, label: "Settings", Icon: SettingsIcon },
    ],
  },
];

/** Active-state test shared by desktop + mobile. */
export function isAdminNavActive(pathname: string, it: AdminNavItem): boolean {
  if (it.exact) return pathname === it.href;
  return pathname === it.href || pathname.startsWith(`${it.href}/`);
}
