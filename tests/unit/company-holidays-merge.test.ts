import { describe, it, expect } from "vitest";
import { fyStartYearForYmd, mergeCompanyHolidays } from "@/lib/hr/company-holidays";
import type { Holiday } from "@/lib/monthly-events/types";

function master(holidayDate: string, name: string, appliesTo: Holiday["appliesTo"] = "all"): Holiday {
  const at = new Date(`${holidayDate}T00:00:00Z`);
  return {
    id: `m-${holidayDate}-${name}`,
    name,
    fyStartYear: 2026,
    holidayDate,
    appliesTo,
    isOptional: false,
    isOfficeClosed: true,
    isFestivalMarker: false,
    isExamMarker: false,
    notes: null,
    createdById: null,
    updatedById: null,
    createdAt: at,
    updatedAt: at,
  };
}

describe("mergeCompanyHolidays", () => {
  it("shows ad-hoc and published days alongside the Events Master", () => {
    const out = mergeCompanyHolidays({
      fyStartYear: 2026,
      master: [master("2026-10-20", "Dussehra")],
      published: [{ date: "2027-01-26", label: "Republic Day" }],
      adHoc: [{ holidayDate: "2026-09-30", label: "Office Offsite" }],
      suppressed: [],
    });
    expect(out.map((h) => [h.holidayDate, h.source])).toEqual([
      ["2026-09-30", "adhoc"],
      ["2026-10-20", "events"],
      ["2027-01-26", "published"],
    ]);
    expect(out[0]?.appliesTo).toBe("all");
    expect(out[0]?.isOfficeClosed).toBe(true);
  });

  it("never lists one date twice — Events Master, then published, then ad-hoc", () => {
    const out = mergeCompanyHolidays({
      fyStartYear: 2026,
      master: [master("2026-10-20", "Dussehra")],
      published: [
        { date: "2026-10-20", label: "Dussehra (published)" },
        { date: "2026-11-08", label: "Diwali" },
      ],
      adHoc: [{ holidayDate: "2026-11-08", label: "Diwali (ad-hoc)" }],
      suppressed: [],
    });
    expect(out.filter((h) => h.holidayDate === "2026-10-20").map((h) => h.source)).toEqual(["events"]);
    expect(out.filter((h) => h.holidayDate === "2026-11-08").map((h) => h.source)).toEqual(["published"]);
  });

  it("a religion-only master row does not hide the company-wide day from everyone else", () => {
    const out = mergeCompanyHolidays({
      fyStartYear: 2026,
      master: [master("2026-12-25", "Christmas", "christian")],
      published: [{ date: "2026-12-25", label: "Company Day" }],
      adHoc: [],
      suppressed: [],
    });
    expect(out.map((h) => h.source).sort()).toEqual(["events", "published"]);
  });

  it("drops a published day an inactive holidays row withdraws", () => {
    const out = mergeCompanyHolidays({
      fyStartYear: 2026,
      master: [],
      published: [{ date: "2026-08-15", label: "Independence Day" }],
      adHoc: [],
      suppressed: ["2026-08-15"],
    });
    expect(out).toHaveLength(0);
  });

  it("gives synthetic rows unique ids", () => {
    const out = mergeCompanyHolidays({
      fyStartYear: 2026,
      master: [],
      published: [{ date: "2026-08-15", label: "Independence Day" }],
      adHoc: [{ holidayDate: "2026-09-30", label: "Offsite" }],
      suppressed: [],
    });
    expect(new Set(out.map((h) => h.id)).size).toBe(out.length);
  });
});

describe("fyStartYearForYmd", () => {
  it("April onwards belongs to that year's financial year", () => {
    expect(fyStartYearForYmd("2026-09-15")).toBe(2026);
    expect(fyStartYearForYmd("2026-04-01")).toBe(2026);
    expect(fyStartYearForYmd("2027-03-31")).toBe(2026);
  });
});
