import { describe, expect, it } from "vitest";
import {
  parseSheetMonth,
  parseRupees,
  mapSalaryProfileRows,
} from "@/lib/salary/profile-sheet";

describe("parseSheetMonth", () => {
  it("parses Mmm-YYYY", () => {
    expect(parseSheetMonth("May-2026")).toBe("2026-05");
    expect(parseSheetMonth("Apr-2022")).toBe("2022-04");
    expect(parseSheetMonth("Sep 2024")).toBe("2024-09");
  });
  it("rejects junk + header labels", () => {
    expect(parseSheetMonth("MM-YY")).toBeNull();
    expect(parseSheetMonth("Auto")).toBeNull();
    expect(parseSheetMonth("")).toBeNull();
  });
});

describe("parseRupees", () => {
  it("strips ₹ and commas", () => {
    expect(parseRupees("₹228,000")).toBe(228000);
    expect(parseRupees("₹0")).toBe(0);
    expect(parseRupees("6000")).toBe(6000);
  });
  it("returns null for blank/non-numeric", () => {
    expect(parseRupees("")).toBeNull();
    expect(parseRupees("  ")).toBeNull();
    expect(parseRupees(undefined as unknown as string)).toBeNull();
  });
});

describe("mapSalaryProfileRows", () => {
  // Build a row with cells only at the columns the mapper reads.
  function row(opts: {
    month: string;
    name: string;
    designation?: string;
    entity?: string;
    ctc?: string;
    pt?: string;
  }): unknown[] {
    const r: unknown[] = [];
    r[2] = opts.month;
    r[3] = opts.name;
    r[4] = opts.designation ?? "";
    r[5] = opts.entity ?? "";
    r[18] = opts.ctc ?? "";
    r[21] = opts.pt ?? "";
    return r;
  }

  it("keeps the latest month per employee and parses CTC + PT-exempt", () => {
    const out = mapSalaryProfileRows([
      row({ month: "Apr-2026", name: "Devraj Kadam", ctc: "₹400,000", pt: "₹200" }),
      row({ month: "May-2026", name: "Devraj Kadam", ctc: "₹444,000", pt: "₹200", designation: "Business Consultant", entity: "Altus Corp" }),
      row({ month: "May-2026", name: "Dattaram Kap", ctc: "₹228,000", pt: "", designation: "Office Boy", entity: "Unleashed" }),
    ]);
    expect(out).toHaveLength(2);
    const devraj = out.find((r) => r.employeeName === "Devraj Kadam")!;
    expect(devraj.month).toBe("2026-05");
    expect(devraj.annualCtc).toBe(444000); // latest, not the Apr 400k
    expect(devraj.ptExempt).toBe(false); // PT ₹200 charged
    expect(devraj.payingEntity).toBe("Altus Corp");

    const datta = out.find((r) => r.employeeName === "Dattaram Kap")!;
    expect(datta.ptExempt).toBe(true); // blank PT → exempt
    expect(datta.designation).toBe("Office Boy");
  });

  it("collapses stray whitespace in names and skips junk/header/zero-CTC rows", () => {
    const out = mapSalaryProfileRows([
      [], // empty
      row({ month: "Auto", name: "x", ctc: "₹1" }), // bad month → skip
      row({ month: "MM-YY", name: "Employee Name", ctc: "" }), // header → skip
      row({ month: "May-2026", name: "Rahul A", ctc: "₹0" }), // zero CTC → skip
      row({ month: "May-2026", name: "Satish  Sonawane", ctc: "₹600,000", pt: "₹200" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.employeeName).toBe("Satish Sonawane"); // collapsed
    expect(out[0]!.annualCtc).toBe(600000);
  });
});
