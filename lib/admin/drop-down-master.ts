import type { Route } from "next";

export type DropDownMasterEntry = {
  label: string;
  href: Route;
};

export type DropDownMasterModule = {
  id: "people" | "attendance" | "masters" | "billing" | "hr";
  label: "People" | "Attendance" | "Masters" | "Billing" | "HR";
  entries: readonly DropDownMasterEntry[];
};

/**
 * One launcher for existing Admin configuration routes. This is deliberately
 * routing metadata only: each destination still owns its own data, CRUD,
 * permission checks and server actions.
 */
export const DROP_DOWN_MASTER_MODULES: readonly DropDownMasterModule[] = [
  {
    id: "people",
    label: "People",
    entries: [
      { label: "Functions", href: "/admin/functions" as Route },
      { label: "Designations", href: "/admin/designations" as Route },
      { label: "Temporary Break", href: "/admin/temporary-break" as Route },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    entries: [
      { label: "Client Locations", href: "/admin/client-locations" as Route },
      { label: "Leave Categories", href: "/admin/leave-categories" as Route },
    ],
  },
  {
    id: "masters",
    label: "Masters",
    entries: [
      { label: "Clients", href: "/admin/clients" as Route },
      { label: "Subjects", href: "/admin/subjects" as Route },
      { label: "Products", href: "/admin/products" as Route },
      { label: "Payment Modes", href: "/admin/outstanding-payment-modes" as Route },
      { label: "Entities", href: "/admin/outstanding-entities" as Route },
      { label: "Products (Legacy View)", href: "/admin/outstanding-products" as Route },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    entries: [
      { label: "Billing Master", href: "/admin/billing-master" as Route },
      { label: "Paying Entities", href: "/admin/paying-entities" as Route },
      { label: "Billing Profiles", href: "/admin/billing-profiles" as Route },
    ],
  },
  {
    id: "hr",
    label: "HR",
    entries: [{ label: "Holidays", href: "/admin/holidays" as Route }],
  },
];

/** The Admin sidebar keeps the Dropdown index open for its launcher and child pages. */
export function isDropDownMasterPath(pathname: string): boolean {
  return (
    pathname === "/admin/drop-down-master" ||
    DROP_DOWN_MASTER_MODULES.some((module) =>
      module.entries.some((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`)),
    )
  );
}
