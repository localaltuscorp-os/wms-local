import { describe, it, expect } from "vitest";
import {
  parseAmount,
  parseDate,
  mapOutstandingRows,
  mapCollectionRows,
  type RawOutstandingRow,
  type RawCollectionRow,
} from "@/lib/outstanding/import-map";

describe("parseAmount", () => {
  it("strips currency symbols and commas", () => {
    expect(parseAmount("₹25,000")).toBe(25000);
    expect(parseAmount("25000")).toBe(25000);
    expect(parseAmount("25,000.00")).toBe(25000);
    expect(parseAmount("₹ 5,000.50")).toBe(5000.5);
    expect(parseAmount("Rs. 1,00,000")).toBe(100000);
  });
  it("returns 0 for blank / non-numeric", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("   ")).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount("n/a")).toBe(0);
  });
  it("accepts numbers directly", () => {
    expect(parseAmount(25000)).toBe(25000);
  });
});

describe("parseDate", () => {
  it("normalizes the sheet formats to YYYY-MM-DD", () => {
    expect(parseDate("2025-09-01")).toBe("2025-09-01");
    expect(parseDate("01-Sep-2025")).toBe("2025-09-01");
    expect(parseDate("1-Sep-2025")).toBe("2025-09-01");
    expect(parseDate("01/09/2025")).toBe("2025-09-01"); // dd/mm/yyyy (day-first)
    expect(parseDate("9/1/2025")).toBe("2025-01-09"); // d/m/yyyy (day-first: 9 Jan)
  });
  it("returns null for blank / unparseable", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("mapOutstandingRows", () => {
  it("groups a 3-row subscription for one client into ONE contract with verbatim non-uniform installments", () => {
    const rows: RawOutstandingRow[] = [
      {
        clientName: "Acme Pvt Ltd",
        product: "BSS",
        cycle: "Subscription",
        entity: "Altus Corp",
        responsible: "Anand Singh",
        dueDate: "01-Sep-2025",
        amount: "₹5,000",
        pdcReceived: "Yes",
      },
      {
        clientName: "Acme Pvt Ltd",
        product: "BSS",
        cycle: "Subscription",
        entity: "Altus Corp",
        responsible: "Anand Singh",
        dueDate: "01-Oct-2025",
        amount: "₹25,000",
        pdcReceived: "Yes",
      },
      {
        clientName: "Acme Pvt Ltd",
        product: "BSS",
        cycle: "Subscription",
        entity: "Altus Corp",
        responsible: "Anand Singh",
        dueDate: "01-Nov-2025",
        amount: "₹25,000",
        pdcReceived: "Yes",
      },
    ];
    const { contracts } = mapOutstandingRows(rows);
    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.clientName).toBe("Acme Pvt Ltd");
    expect(c.product).toBe("BSS");
    expect(c.cycle).toBe("subscription");
    expect(c.entity).toBe("Altus Corp");
    expect(c.responsible).toBe("Anand Singh");
    expect(c.startDate).toBe("2025-09-01");
    expect(c.pdcReceived).toBe(true);
    // installments preserved verbatim, non-uniform amounts intact
    expect(c.installments).toEqual([
      { dueDate: "2025-09-01", amount: 5000 },
      { dueDate: "2025-10-01", amount: 25000 },
      { dueDate: "2025-11-01", amount: 25000 },
    ]);
    // baseAmount = modal amount (25000 appears twice)
    expect(c.baseAmount).toBe(25000);
  });

  it("splits different clients into separate contracts", () => {
    const rows: RawOutstandingRow[] = [
      { clientName: "Acme", product: "BSS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
      { clientName: "Beta", product: "BSS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
    ];
    const { contracts } = mapOutstandingRows(rows);
    expect(contracts).toHaveLength(2);
    expect(contracts.map((c) => c.clientName).sort()).toEqual(["Acme", "Beta"]);
  });

  it("splits the same client across different product/cycle into separate contracts", () => {
    const rows: RawOutstandingRow[] = [
      { clientName: "Acme", product: "BSS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
      { clientName: "Acme", product: "PS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
      { clientName: "Acme", product: "BSS", cycle: "Full Payment", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
    ];
    const { contracts } = mapOutstandingRows(rows);
    expect(contracts).toHaveLength(3);
  });

  it("uses the earliest due date as startDate regardless of row order", () => {
    const rows: RawOutstandingRow[] = [
      { clientName: "Acme", product: "BSS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-11-01", amount: "25000" },
      { clientName: "Acme", product: "BSS", cycle: "Subscription", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
    ];
    const { contracts } = mapOutstandingRows(rows);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]!.startDate).toBe("2025-09-01");
  });

  it("derives gstRate=0 when amounts give no GST signal", () => {
    const rows: RawOutstandingRow[] = [
      { clientName: "Acme", product: "BSS", cycle: "Full Payment", entity: "Altus Corp", responsible: "A", dueDate: "2025-09-01", amount: "5000" },
    ];
    const { contracts } = mapOutstandingRows(rows);
    expect(contracts[0]!.gstRate).toBe(0);
  });
});

describe("mapCollectionRows", () => {
  it("maps rows straight through with amount parsed to number", () => {
    const rows: RawCollectionRow[] = [
      {
        clientName: "Acme Pvt Ltd",
        amount: "₹25,000",
        paymentMode: "Altus Kotak",
        responsible: "Anand Singh",
        collectedAt: "05-Sep-2025",
        comments: "First payment",
      },
    ];
    const specs = mapCollectionRows(rows);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toEqual({
      clientName: "Acme Pvt Ltd",
      amount: 25000,
      paymentMode: "Altus Kotak",
      responsible: "Anand Singh",
      collectedAt: "2025-09-05",
      comments: "First payment",
    });
  });

  it("skips fully-blank rows and rows with no client/amount", () => {
    const rows: RawCollectionRow[] = [
      { clientName: "", amount: "", paymentMode: "", responsible: "", collectedAt: "", comments: "" },
      { clientName: "Acme", amount: "1000", paymentMode: "Cash", responsible: "A", collectedAt: "2025-09-01", comments: "" },
    ];
    const specs = mapCollectionRows(rows);
    expect(specs).toHaveLength(1);
    expect(specs[0]!.clientName).toBe("Acme");
  });
});
