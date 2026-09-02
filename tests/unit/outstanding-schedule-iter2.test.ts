import { describe, it, expect } from "vitest";
import { generateSchedule } from "@/lib/outstanding/schedule";
import type { ContractInput } from "@/lib/outstanding/types";
const base: ContractInput = { id:"c1", clientName:"X", cycle:"full_payment", baseAmount:1000, gstRate:0, startDate:"2026-01-01", periods:null, endDate:null, status:"active" };
describe("schedule iter2", () => {
  it("monthly_bill: bill-date each month across the retainer (amount = Total incl GST)", () => {
    const rows = generateSchedule({ ...base, cycle:"monthly_bill", baseAmount:1000, gstRate:18, retainerStart:"2026-01-10", retainerEnd:"2026-03-10", billDate:12 }, "2027-01-01");
    expect(rows.map(r=>r.dueDate)).toEqual(["2026-01-12","2026-02-12","2026-03-12"]);
    expect(rows.every(r=>r.amount===1180)).toBe(true);
  });
  it("monthly_bill: bill-date clamps in short months (31 -> Feb end)", () => {
    const rows = generateSchedule({ ...base, cycle:"monthly_bill", baseAmount:1000, gstRate:0, retainerStart:"2026-01-15", retainerEnd:"2026-02-15", billDate:31 }, "2027-01-01");
    expect(rows.map(r=>r.dueDate)).toEqual(["2026-01-31","2026-02-28"]);
  });
  it("subscription: emiCount rows of Amount spaced by frequency from startDate (EMI start)", () => {
    const rows = generateSchedule({ ...base, cycle:"subscription", baseAmount:500, gstRate:0, emiCount:3, frequency:"10_days", startDate:"2026-01-01" }, "2027-01-01");
    expect(rows.map(r=>r.dueDate)).toEqual(["2026-01-01","2026-01-11","2026-01-21"]);
    expect(rows.every(r=>r.amount===500)).toBe(true);
  });
  it("subscription weekly steps 7 days", () => {
    const rows = generateSchedule({ ...base, cycle:"subscription", baseAmount:500, gstRate:0, emiCount:2, frequency:"weekly", startDate:"2026-01-01" }, "2027-01-01");
    expect(rows.map(r=>r.dueDate)).toEqual(["2026-01-01","2026-01-08"]);
  });
  it("subscription 30_days across a month boundary", () => {
    const rows = generateSchedule({ ...base, cycle:"subscription", baseAmount:100, gstRate:0, emiCount:2, frequency:"30_days", startDate:"2026-01-15" }, "2027-01-01");
    expect(rows.map(r=>r.dueDate)).toEqual(["2026-01-15","2026-02-14"]);
  });
  it("partial_payment + slabs: explicit rows verbatim", () => {
    for (const cycle of ["partial_payment","slabs"] as const) {
      const rows = generateSchedule({ ...base, cycle, explicitInstallments:[{dueDate:"2026-02-01",amount:600},{dueDate:"2026-03-01",amount:400}] }, "2027-01-01");
      expect(rows.map(r=>[r.dueDate,r.amount])).toEqual([["2026-02-01",600],["2026-03-01",400]]);
      expect(rows.map(r=>r.periodIndex)).toEqual([0,1]);
    }
  });
  it("full_payment still works (1 row at startDate, Total)", () => {
    const rows = generateSchedule({ ...base, cycle:"full_payment", baseAmount:1000, gstRate:18, startDate:"2026-05-01" }, "2027-01-01");
    expect(rows).toEqual([{ contractId:"c1", periodIndex:0, dueDate:"2026-05-01", amount:1180 }]);
  });
});
