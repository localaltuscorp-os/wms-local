import { describe, it, expect } from "vitest";
import {
  CreateContractSchema,
  CreateCollectionSchema,
} from "@/lib/validators/outstanding";

describe("CreateContractSchema", () => {
  // Canonical valid subscription: split first/last name + emiCount + frequency
  // (the iter-2 cycle requirements). clientName is also accepted (back-compat).
  const valid = {
    clientName: "Acme Corp",
    firstName: "Acme",
    lastName: "Corp",
    cycle: "subscription" as const,
    baseAmount: 10000,
    gstRate: 18,
    startDate: "2026-01-01",
    emiCount: 12,
    frequency: "30_days" as const,
    pdcReceived: false,
  };

  it("accepts a minimal valid contract", () => {
    expect(CreateContractSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional periods/endDate/comments", () => {
    const r = CreateContractSchema.safeParse({
      ...valid,
      periods: 12,
      endDate: "2026-12-01",
      comments: "first invoice pending",
      contactPhone: "+91 99999 99999",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid GST rate", () => {
    expect(CreateContractSchema.safeParse({ ...valid, gstRate: 17 }).success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(CreateContractSchema.safeParse({ ...valid, baseAmount: 0 }).success).toBe(false);
  });

  it("rejects a malformed start date", () => {
    expect(CreateContractSchema.safeParse({ ...valid, startDate: "2026/01/01" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown cycle", () => {
    expect(
      CreateContractSchema.safeParse({ ...valid, cycle: "weekly" as never }).success,
    ).toBe(false);
  });

  it("rejects unknown extra keys (strict)", () => {
    expect(
      CreateContractSchema.safeParse({ ...valid, surprise: true } as never).success,
    ).toBe(false);
  });

  it("rejects periods out of range", () => {
    expect(CreateContractSchema.safeParse({ ...valid, periods: 0 }).success).toBe(false);
    expect(CreateContractSchema.safeParse({ ...valid, periods: 601 }).success).toBe(false);
  });

  // ── iter-2: cycle-specific fields + per-cycle validation ──────────────────

  it("accepts a valid full_payment (first/last name + startDate)", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "full_payment",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      pdcReceived: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects monthly_bill missing billDate", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "monthly_bill",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      retainerStart: "2026-01-01",
      retainerEnd: "2026-06-01",
      pdcReceived: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts monthly_bill with retainer + billDate", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "monthly_bill",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      retainerStart: "2026-01-01",
      retainerEnd: "2026-06-01",
      billDate: 5,
      pdcReceived: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects subscription missing frequency", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "subscription",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      emiCount: 12,
      pdcReceived: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts subscription with emiCount + frequency", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "subscription",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      emiCount: 12,
      frequency: "30_days",
      pdcReceived: false,
    });
    expect(r.success).toBe(true);
  });

  it("accepts partial_payment whose rows sum to the GST-inclusive total", () => {
    // base 10000 + 18% GST = 11800 total; rows must sum to 11800.
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "partial_payment",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      explicitInstallments: [
        { dueDate: "2026-01-01", amount: 5800 },
        { dueDate: "2026-02-01", amount: 6000 },
      ],
      pdcReceived: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects partial_payment whose rows do NOT sum to the total (message names the total)", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "partial_payment",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      explicitInstallments: [
        { dueDate: "2026-01-01", amount: 5000 },
        { dueDate: "2026-02-01", amount: 5000 },
      ],
      pdcReceived: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(" | ");
      expect(msg).toContain("sum to the total");
      expect(msg).toContain("11,800");
    }
  });

  it("rejects partial_payment with no rows", () => {
    const r = CreateContractSchema.safeParse({
      firstName: "Acme",
      lastName: "Corp",
      cycle: "partial_payment",
      baseAmount: 10000,
      gstRate: 18,
      startDate: "2026-01-01",
      explicitInstallments: [],
      pdcReceived: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a gstRate of 5 (only 0 / 18 accepted by the form)", () => {
    expect(CreateContractSchema.safeParse({ ...valid, gstRate: 5 }).success).toBe(false);
  });

  it("rejects a contract with no client name at all", () => {
    const { clientName, firstName, lastName, ...rest } = valid;
    void clientName;
    void firstName;
    void lastName;
    expect(CreateContractSchema.safeParse(rest).success).toBe(false);
  });
});

describe("CreateCollectionSchema", () => {
  const valid = {
    clientName: "Acme Corp",
    amount: 5000,
    paymentModeId: "11111111-1111-4111-8111-111111111111",
    responsibleId: "22222222-2222-4222-8222-222222222222",
  };

  it("accepts a minimal valid collection", () => {
    expect(CreateCollectionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional contractId/collectedAt/comments", () => {
    const r = CreateCollectionSchema.safeParse({
      ...valid,
      contractId: "33333333-3333-4333-8333-333333333333",
      collectedAt: "2026-06-01",
      comments: "UPI received",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing payment mode", () => {
    const { paymentModeId, ...rest } = valid;
    void paymentModeId;
    expect(CreateCollectionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-uuid responsible id", () => {
    expect(
      CreateCollectionSchema.safeParse({ ...valid, responsibleId: "nope" }).success,
    ).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(CreateCollectionSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });
});
