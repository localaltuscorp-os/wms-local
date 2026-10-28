import { describe, expect, it } from "vitest";
import { directoryReport, directoryTypeLabel, safeDirectoryType } from "@/lib/hr/directory";
import type { ContactRow } from "@/lib/hr/registers-server";

const contact = (overrides: Partial<ContactRow> = {}): ContactRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  companyName: "Test Company",
  personName: "Test Contact",
  cellNo: "9876543210",
  alternateNo: null,
  email: "test@example.com",
  service: "Other",
  directoryType: "vendor",
  contact2Name: "Second Test",
  contact2CellNo: "9876543211",
  contact2Email: "second@example.com",
  notes: null,
  isActive: true,
  ...overrides,
});

describe("HR Directory report", () => {
  it("uses a safe Vendor fallback for legacy directory values", () => {
    expect(safeDirectoryType("unexpected")).toBe("vendor");
    expect(directoryTypeLabel("hr_consultant")).toBe("HR Consultants");
  });

  it("exports both primary and secondary contact details", () => {
    const report = directoryReport([contact(), contact({ isActive: false, personName: "Inactive Test" })]);
    expect(report.rows).toEqual([["Vendors", "Test Contact", "Test Company", "9876543210", "test@example.com", "Second Test", "9876543211", "second@example.com"]]);
    expect(report.summary).toBe("1 active contacts");
  });
});
