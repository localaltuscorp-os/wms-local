import { describe, it, expect } from "vitest";
import {
  DUMMY_CUSTOMERS,
  DUMMY_ENTITY_PROFILES,
  DUMMY_PAYMENT_TERMS,
  DUMMY_PRODUCTS,
  DUMMY_SAC_CODES,
  enrichedAnyCustomer,
  isDummyMasterId,
  withDummyCustomerDetail,
  withDummyFallback,
} from "@/lib/billing/master";

describe("billing dummy Admin Master", () => {
  it("covers every master the form reads", () => {
    expect(DUMMY_CUSTOMERS.length).toBeGreaterThanOrEqual(10);
    expect(DUMMY_PRODUCTS.length).toBeGreaterThanOrEqual(5);
    expect(DUMMY_PAYMENT_TERMS.length).toBeGreaterThanOrEqual(5);
    expect(DUMMY_SAC_CODES.length).toBeGreaterThanOrEqual(5);
    expect(DUMMY_ENTITY_PROFILES.length).toBeGreaterThanOrEqual(1);
  });

  it("carries the sample invoice's seller facts", () => {
    const altus = DUMMY_ENTITY_PROFILES.find((p) => p.entityId === "altus-corp");
    expect(altus).toBeTruthy();
    expect(altus!.legalName).toBe("Altus Corp");
    expect(altus!.pan).toBe("ACPPV1393L");
    expect(altus!.gstin).toBe("27ACPPV1393L1ZQ");
    expect(altus!.bankIfsc).toBe("KKBK0000646");
    expect(altus!.stateCode).toBe("27");
    expect(altus!.interestClause).toContain("24%");
  });

  it("carries the sample invoice's customer", () => {
    const c = DUMMY_CUSTOMERS.find((c) => c.gstin === "27ACEFA9263B1ZJ");
    expect(c).toBeTruthy();
    expect(c!.contactName).toBe("Rajiv Sheth");
    expect(c!.phone).toBe("9833288638");
  });

  it("keeps unregistered customers unregistered — the no-GST path", () => {
    const individuals = DUMMY_CUSTOMERS.filter((c) => c.gstin === null);
    expect(individuals.length).toBeGreaterThan(0);
  });

  it("every dummy id is greppable and every real-looking id is not", () => {
    const ids = [
      ...DUMMY_CUSTOMERS.map((r) => r.id),
      ...DUMMY_PRODUCTS.map((r) => r.id),
      ...DUMMY_PAYMENT_TERMS.map((r) => r.id),
      ...DUMMY_SAC_CODES.map((r) => r.id),
      ...DUMMY_ENTITY_PROFILES.map((r) => r.id),
    ];
    expect(ids.every(isDummyMasterId)).toBe(true);
    expect(isDummyMasterId("b3f1c2de-0000-4000-8000-000000000000")).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exactly one default payment term", () => {
    expect(DUMMY_PAYMENT_TERMS.filter((t) => t.isDefault)).toHaveLength(1);
  });

  it("every product's SAC code exists in the SAC master", () => {
    const codes = new Set(DUMMY_SAC_CODES.map((s) => s.code));
    for (const p of DUMMY_PRODUCTS) {
      if (p.sacCode) expect(codes.has(p.sacCode)).toBe(true);
    }
  });

  describe("withDummyFallback — real wins", () => {
    const real = [{ id: "real-1" }];
    const dummy = [{ id: "dummy-1" }];

    it("uses the real rows when the table has any", () => {
      expect(withDummyFallback(real, dummy)).toEqual(real);
    });

    it("falls back only when the table is empty", () => {
      expect(withDummyFallback([], dummy)).toEqual(dummy);
    });

    it("never merges the two", () => {
      expect(withDummyFallback(real, dummy)).toHaveLength(1);
    });
  });
});

describe("field-level customer detail", () => {
  const bare = {
    id: "real-uuid-1",
    name: "Acme Widgets",
    legalName: null, contactName: null, email: null, whatsapp: null, phone: null,
    pan: null, gstin: null, addressLine1: null, addressLine2: null, city: null,
    stateName: null, stateCode: null, pincode: null, country: "India",
    clientId: null, outstandingEntityId: null, notes: null, isActive: true,
    createdAt: new Date(0), updatedAt: new Date(0), createdById: null, updatedById: null,
  } as never;

  it("fills every empty field", () => {
    const out = withDummyCustomerDetail(bare);
    expect(out.gstin).toBeTruthy();
    expect(out.stateCode).toBe("27");
    expect(out.contactName).toBeTruthy();
    expect(out.phone).toBeTruthy();
    expect(out.email).toBeTruthy();
  });

  it("marks synthetic identifiers unmistakably", () => {
    const out = withDummyCustomerDetail(bare);
    expect(out.gstin).toContain("DUMMY");
    expect(out.pan).toContain("DUMMY");
    expect(out.gstin!.length).toBe(15);
  });

  it("never overwrites a real value", () => {
    const real = { ...(bare as object), gstin: "27ACEFA9263B1ZJ", phone: "9833288638" } as never;
    const out = withDummyCustomerDetail(real);
    expect(out.gstin).toBe("27ACEFA9263B1ZJ");
    expect(out.phone).toBe("9833288638");
  });

  it("is stable — same name, same identifiers", () => {
    expect(withDummyCustomerDetail(bare).gstin).toBe(withDummyCustomerDetail(bare).gstin);
  });

  it("prefers the brief's real-looking values for a known name", () => {
    const known = { ...(bare as object), name: "Anant Avinya Technologies LLP" } as never;
    const out = withDummyCustomerDetail(known);
    expect(out.gstin).toBe("27ACEFA9263B1ZJ");
    expect(out.gstin).not.toContain("DUMMY");
  });

  it("flags enrichment for the badge", () => {
    expect(enrichedAnyCustomer([withDummyCustomerDetail(bare)])).toBe(true);
  });
});
