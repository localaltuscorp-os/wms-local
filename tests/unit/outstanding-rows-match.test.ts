import { describe, it, expect } from "vitest";
import {
  rowsPaise,
  totalPaise,
  rowsMatchTotal,
  type InstallmentRow,
} from "@/components/outstanding/cycle-fields";

function row(dueDate: string, amount: string): InstallmentRow {
  return { id: dueDate + amount, dueDate, amount };
}

describe("outstanding partial/slabs rows sum gate", () => {
  it("paise conversion is float-safe", () => {
    expect(rowsPaise([{ amount: "10.10" }, { amount: "0.20" }])).toBe(1030);
    expect(totalPaise(10.3)).toBe(1030);
  });

  it("confirms only when rows sum exactly to the total", () => {
    const total = 1180; // e.g. 1000 + 18% GST
    expect(
      rowsMatchTotal([row("2026-01-01", "590"), row("2026-02-01", "590")], total),
    ).toBe(true);
    // Off by a rupee → not confirmable.
    expect(
      rowsMatchTotal([row("2026-01-01", "590"), row("2026-02-01", "589")], total),
    ).toBe(false);
  });

  it("rejects empty rows, missing dates, and non-positive amounts", () => {
    expect(rowsMatchTotal([], 0)).toBe(false);
    expect(rowsMatchTotal([row("", "100")], 100)).toBe(false);
    expect(rowsMatchTotal([row("2026-01-01", "0")], 0)).toBe(false);
    expect(rowsMatchTotal([row("2026-01-01", "-5")], -5)).toBe(false);
  });

  it("handles fractional GST totals (float-safe)", () => {
    // 999.99 + 18% = 1179.9882 → rounds to 117999 paise
    const total = 999.99 * 1.18;
    expect(rowsMatchTotal([row("2026-01-01", "1179.99")], total)).toBe(true);
  });
});
