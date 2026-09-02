import { describe, it, expect } from "vitest";
import { buildDashboard } from "@/lib/outstanding/aggregate";
import type { DerivedInstallment } from "@/lib/outstanding/types";

const di = (o: Partial<DerivedInstallment>): DerivedInstallment => ({
  id: "i", contractId: "c1", clientName: "A", periodIndex: 0, dueDate: "2025-09-01",
  amount: 25000, paid: 0, balance: 25000, state: "overdue", daysOverdue: 100,
  responsibleName: "Manan Vasa", entityName: "Cash", pdcReceived: false, ...o,
});

describe("buildDashboard", () => {
  it("totals split overdue vs not due", () => {
    const d = buildDashboard(
      [
        di({ id: "i1", state: "overdue", balance: 25000, daysOverdue: 100 }),
        di({ id: "i2", state: "not_due", balance: 50000, daysOverdue: 0 }),
        di({ id: "i3", state: "paid", balance: 0 }),
      ],
      [],
    );
    expect(d.totals.totalOutstanding).toBe(75000);
    expect(d.totals.overdue).toBe(25000);
    expect(d.totals.notDue).toBe(50000);
  });
  it("paid rows are excluded from totals and pdc count", () => {
    const d = buildDashboard(
      [
        di({ id: "i1", state: "overdue", balance: 25000 }),
        di({ id: "i2", state: "paid", balance: 0, pdcReceived: false }),
      ],
      [],
    );
    expect(d.totals.totalOutstanding).toBe(25000);
    // i2 is paid → excluded from pdcNotReceived despite pdcReceived===false
    expect(d.totals.pdcNotReceived).toBe(1);
  });
  it("pdcNotReceived counts only pdcReceived===false (undefined/true excluded)", () => {
    const d = buildDashboard(
      [
        di({ id: "u", state: "overdue", pdcReceived: undefined }),
        di({ id: "f", state: "overdue", pdcReceived: false }),
        di({ id: "t", state: "overdue", pdcReceived: true }),
      ],
      [],
    );
    expect(d.totals.pdcNotReceived).toBe(1);
  });
  it("due_soon rows count within the Not Due total and stay open with state preserved", () => {
    const d = buildDashboard(
      [
        di({ id: "i1", state: "overdue", balance: 25000, daysOverdue: 100 }),
        di({ id: "i2", state: "not_due", balance: 50000, daysOverdue: 0 }),
        di({ id: "i3", state: "due_soon", balance: 10000, daysOverdue: 0 }),
      ],
      [],
    );
    // due_soon contributes to notDue (not overdue, not paid) and to total
    expect(d.totals.notDue).toBe(60000);
    expect(d.totals.overdue).toBe(25000);
    expect(d.totals.totalOutstanding).toBe(85000);
    // appears in per-employee entries with notDue bumped and state preserved on the row
    const emp = d.byEmployee.find((e) => e.name === "Manan Vasa");
    expect(emp!.notDue).toBe(60000);
  });
  it("collection totals", () => {
    const d = buildDashboard([], [
      { clientName: "A", amount: 1000, paymentMode: "Cash", responsible: "Manan Vasa" },
      { clientName: "B", amount: 2000, paymentMode: "Cash", responsible: "Manan Vasa" },
    ]);
    expect(d.collections.totalCollected).toBe(3000);
    expect(d.collections.topMode).toBe("Cash");
    expect(d.collections.topCollector).toBe("Manan Vasa");
  });
});
