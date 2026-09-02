import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_CYCLES, OUTSTANDING_CYCLE_LABELS, INSTALLMENT_STATES,
  SUBSCRIPTION_FREQUENCIES, SEED_RESPONSIBLES, SEED_ENTITIES,
  SEED_PRODUCTS, SEED_PAYMENT_MODES,
} from "@/db/enums";
describe("iter2 enums", () => {
  it("cycles include partial + slabs", () => {
    expect(OUTSTANDING_CYCLES).toEqual(["subscription","monthly_bill","full_payment","partial_payment","slabs"]);
    for (const c of OUTSTANDING_CYCLES) expect(OUTSTANDING_CYCLE_LABELS[c]).toBeTruthy();
  });
  it("installment states include due_soon", () => { expect(INSTALLMENT_STATES).toContain("due_soon"); });
  it("frequencies", () => { expect(SUBSCRIPTION_FREQUENCIES).toEqual(["10_days","15_days","30_days","weekly"]); });
  it("responsibles = 12 names", () => {
    expect(SEED_RESPONSIBLES).toHaveLength(12);
    expect(SEED_RESPONSIBLES).toContain("Manan Vasa");
    expect(SEED_RESPONSIBLES).toContain("Siddesh Walve");
  });
  it("rosters updated", () => {
    expect(SEED_PRODUCTS).toContain("Billing");
    expect(SEED_PRODUCTS).toContain("Retainer");
    expect(SEED_PRODUCTS).not.toContain("BSU");
    expect(SEED_ENTITIES).toContain("Dharav Enterprises");
    expect(SEED_PAYMENT_MODES).toContain("Kotak - Altus");
    expect(SEED_PAYMENT_MODES).toContain("Barter");
  });
});
