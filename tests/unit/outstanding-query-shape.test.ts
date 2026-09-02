import { describe, it, expect, vi } from "vitest";

// The query layer pulls in `server-only` (throws outside an RSC bundle) and
// `@/lib/db` (opens a real Postgres pool). Stub both so we can import the module
// purely to assert its exported surface — this is a compile/shape smoke test,
// not a DB integration test.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

describe("outstanding query layer surface", () => {
  it("exports loadOutstanding + loadOutstandingDashboard as functions", async () => {
    const mod = await import("@/lib/queries/outstanding");
    expect(typeof mod.loadOutstanding).toBe("function");
    expect(typeof mod.loadOutstandingDashboard).toBe("function");
    // old v1 export must survive alongside the new ones
    expect(typeof mod.listOutstandingEntries).toBe("function");
  });

  it("exposes the roster query surface", async () => {
    const mod = await import("@/lib/queries/outstanding-rosters");
    expect(typeof mod.listOutstandingProducts).toBe("function");
    expect(typeof mod.listOutstandingEntities).toBe("function");
    expect(typeof mod.listOutstandingPaymentModes).toBe("function");
    expect(typeof mod.listOutstandingProductsWithCounts).toBe("function");
    expect(typeof mod.listOutstandingEntitiesWithCounts).toBe("function");
    expect(typeof mod.listOutstandingPaymentModesWithCounts).toBe("function");
  });
});
