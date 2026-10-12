import type { ContactRow, EmployeeContactRow } from "@/lib/hr/registers-server";
import type { SectionReport } from "@/lib/reports/section-report";

export const DIRECTORY_TYPES = ["vendor", "hr_consultant"] as const;
export type DirectoryType = (typeof DIRECTORY_TYPES)[number];

export function directoryTypeLabel(type: DirectoryType): string {
  return type === "vendor" ? "Vendors" : "HR Consultants";
}

export function safeDirectoryType(value: string): DirectoryType {
  return value === "hr_consultant" ? "hr_consultant" : "vendor";
}

/** A complete, server/client-safe Directory snapshot for PDF and email export. */
export function directoryReport(rows: ContactRow[]): SectionReport {
  return {
    title: "HR Directory",
    subtitle: "Vendors and HR Consultants",
    meta: [{ label: "Scope", value: "Complete active directory" }],
    summary: `${rows.filter((row) => row.isActive).length} active contacts`,
    columns: [
      { label: "Type", weight: 1.1 },
      { label: "Name", weight: 1.4 },
      { label: "Company", weight: 1.5 },
      { label: "Cell", weight: 1.2 },
      { label: "Email", weight: 1.7 },
      { label: "Contact 2", weight: 1.4 },
      { label: "Contact 2 Cell", weight: 1.2 },
      { label: "Contact 2 Email", weight: 1.7 },
    ],
    rows: rows
      .filter((row) => row.isActive)
      .map((row) => [
        directoryTypeLabel(safeDirectoryType(row.directoryType)),
        row.personName,
        row.companyName ?? "-",
        row.cellNo ?? "-",
        row.email ?? "-",
        row.contact2Name ?? "-",
        row.contact2CellNo ?? "-",
        row.contact2Email ?? "-",
      ]),
  };
}

/** A complete, server/client-safe Employee Directory snapshot for PDF export. */
export function employeeDirectoryReport(rows: EmployeeContactRow[]): SectionReport {
  return {
    title: "Employee Directory",
    subtitle: "Live details from onboarding submissions",
    meta: [{ label: "Scope", value: "Active employees" }],
    summary: `${rows.filter((row) => row.isActive).length} active employees`,
    columns: [
      { label: "First Name", weight: 1.1 },
      { label: "Last Name", weight: 1.1 },
      { label: "Cell No.", weight: 1.1 },
      { label: "Personal Email", weight: 1.8 },
      { label: "Contact 1 Name", weight: 1.3 },
      { label: "Contact 1 Cell No.", weight: 1.2 },
      { label: "Contact 2 Name", weight: 1.3 },
      { label: "Contact 2 Cell No.", weight: 1.2 },
    ],
    rows: rows
      .filter((row) => row.isActive)
      .map((row) => [row.firstName || "-", row.lastName || "-", row.cell ?? "-", row.email ?? "-", row.contact1Name ?? "-", row.contact1Cell ?? "-", row.contact2Name ?? "-", row.contact2Cell ?? "-"]),
  };
}
