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
  CreditCard,
  UserCog,
  CalendarDays,
  BadgeIndianRupee,
  IdCard,
  Wallet,
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
      { href: "/admin/departments" as Route, label: "Departments", Icon: Building2 },
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
    label: "Clients & Billing",
    Icon: Briefcase,
    items: [
      { href: "/admin/clients" as Route, label: "Clients", Icon: Briefcase },
      { href: "/admin/subjects" as Route, label: "Subjects", Icon: Tag },
      { href: "/admin/paying-entities" as Route, label: "Paying Entities", Icon: Building2 },
    ],
  },
  {
    label: "Outstanding",
    Icon: Wallet,
    items: [
      { href: "/admin/outstanding-products" as Route, label: "Products", Icon: Package },
      { href: "/admin/outstanding-entities" as Route, label: "Entities", Icon: Landmark },
      { href: "/admin/outstanding-payment-modes" as Route, label: "Payment Modes", Icon: CreditCard },
      { href: "/admin/outstanding-responsibles" as Route, label: "Responsibles", Icon: UserCog },
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
