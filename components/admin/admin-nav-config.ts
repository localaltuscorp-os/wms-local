import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BellRing,
  Users,
  UsersRound,
  BadgeIndianRupee,
  Gift,
  IdCard,
  KeyRound,
  ShieldCheck,
  FileUp,
  Settings as SettingsIcon,
  ScrollText,
  ListFilter,
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

// Shared by desktop rail, legacy top navigation and mobile drawer.
export const ADMIN_TOP_LEVEL: readonly AdminNavItem[] = [
  { href: "/admin/drop-down-master" as Route, label: "Dropdown", Icon: ListFilter },
];

export const ADMIN_GROUPS: readonly AdminNavGroup[] = [
  {
    label: "People",
    Icon: UsersRound,
    items: [
      { href: "/admin/employees" as Route, label: "Employees", Icon: Users },
      { href: "/admin/employee-master" as Route, label: "Employee Master", Icon: IdCard },
      { href: "/admin/salary-profiles" as Route, label: "Salary Breakup", Icon: BadgeIndianRupee },
      { href: "/admin/salary-lineage" as Route, label: "Salary Lineage", Icon: ScrollText },
    ],
  },
  {
    // Upload Master owns application-wide import templates; it is not a
    // dropdown configuration route and remains a separate Admin destination.
    label: "Masters",
    Icon: ListFilter,
    items: [{ href: "/admin/upload-master" as Route, label: "Upload Master", Icon: FileUp }],
  },
  {
    label: "Billing",
    Icon: BadgeIndianRupee,
    items: [
      { href: "/admin/billing-details" as Route, label: "Billing Details", Icon: BadgeIndianRupee },
      { href: "/admin/outstanding-products" as Route, label: "Products (Legacy View)", Icon: Gift },
      { href: "/admin/outstanding-payment-modes" as Route, label: "Payment Modes", Icon: ListFilter },
    ],
  },
  {
    label: "Incentive",
    Icon: BadgeIndianRupee,
    items: [{ href: "/admin/incentive-master" as Route, label: "Incentive Master", Icon: Gift }],
  },
  {
    label: "Access",
    Icon: KeyRound,
    items: [{ href: "/admin/access-control" as Route, label: "Task Visibility", Icon: ShieldCheck }],
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
