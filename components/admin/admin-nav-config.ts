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
  Settings as SettingsIcon,
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
      { href: "/admin/salary-profiles" as Route, label: "Salary Profiles", Icon: BadgeIndianRupee },
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
      { href: "/admin/temporary-access" as Route, label: "Temporary Access", Icon: KeyRound },
    ],
  },
  {
    label: "System",
    Icon: SettingsIcon,
    items: [
      { href: "/admin/notifications" as Route, label: "Notifications", Icon: Bell },
      { href: "/admin/task-reminders" as Route, label: "Task Reminders", Icon: BellRing },
      { href: "/admin/settings" as Route, label: "Settings", Icon: SettingsIcon },
    ],
  },
];

/** Active-state test shared by desktop + mobile. */
export function isAdminNavActive(pathname: string, it: AdminNavItem): boolean {
  if (it.exact) return pathname === it.href;
  return pathname === it.href || pathname.startsWith(`${it.href}/`);
}
