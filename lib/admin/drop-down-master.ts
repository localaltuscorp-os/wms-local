import type { Route } from "next";
import type { WorkspaceId } from "@/lib/workspaces";

export type DropDownMasterModule = {
  id: string;
  label: string;
  workspaceId?: WorkspaceId;
  entries: readonly DropDownMasterEntry[];
};

export type DropDownMasterEntry = {
  label: string;
  href: Route;
};

const FUNCTION: DropDownMasterEntry = { label: "Function", href: "/admin/functions" as Route };
const DESIGNATION: DropDownMasterEntry = { label: "Designation", href: "/admin/designations" as Route };
const CLIENT: DropDownMasterEntry = { label: "Client", href: "/admin/clients" as Route };
const SUBJECTS: DropDownMasterEntry = { label: "Subjects", href: "/admin/subjects" as Route };
const PRODUCTS: DropDownMasterEntry = { label: "Products", href: "/admin/products" as Route };
const PAYMENT_MODES: DropDownMasterEntry = { label: "Payment Modes", href: "/admin/outstanding-payment-modes" as Route };
const PAYING_ENTITY: DropDownMasterEntry = { label: "Paying Entity", href: "/admin/paying-entities" as Route };
const LEGACY_PRODUCTS: DropDownMasterEntry = { label: "Products (Legacy View)", href: "/admin/outstanding-products" as Route };

/**
 * Drop Down Master launcher order. This mirrors the approved Hub module order
 * for this surface. Entries only point to existing master pages: no values or
 * data sources live here.
 */
export const DROP_DOWN_MASTER_MODULES: readonly DropDownMasterModule[] = [
  { id: "admin", label: "Admin", entries: [FUNCTION, DESIGNATION] },
  { id: "incentive", label: "Incentive", workspaceId: "incentive", entries: [PRODUCTS] },
  { id: "operations", label: "Operations", workspaceId: "operations", entries: [CLIENT, SUBJECTS] },
  { id: "wms", label: "WMS", workspaceId: "wms", entries: [CLIENT, SUBJECTS, FUNCTION] },
  { id: "goals", label: "Goals", workspaceId: "goals", entries: [FUNCTION] },
  { id: "employees", label: "Employees", workspaceId: "employees", entries: [FUNCTION, DESIGNATION] },
  { id: "productivity", label: "Productivity", workspaceId: "productivity", entries: [FUNCTION] },
  { id: "project", label: "Project", workspaceId: "project-plan", entries: [CLIENT] },
  { id: "billing", label: "Billing", workspaceId: "billing", entries: [PRODUCTS, PAYMENT_MODES, PAYING_ENTITY, LEGACY_PRODUCTS] },
  { id: "accounts", label: "Accounts", workspaceId: "accounts", entries: [PRODUCTS] },
  { id: "hr", label: "HR", workspaceId: "hr", entries: [PAYING_ENTITY, FUNCTION, DESIGNATION] },
  { id: "sales", label: "Sales", workspaceId: "sales", entries: [DESIGNATION] },
];

export function dropDownMasterModule(id: string | undefined): DropDownMasterModule | undefined {
  return DROP_DOWN_MASTER_MODULES.find((module) => module.id === id);
}
