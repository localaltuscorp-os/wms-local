import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

/**
 * BILLING CONTRACTS against a real Postgres (migration 0234).
 *
 * The claims under test are about the DATABASE: that Raise Bill creates a real
 * tax invoice and links it, that a second click cannot bill the same row, that
 * the contract value holds as a ceiling across saves and retainer runs, and
 * that Paid / Unpaid / Not Due follow the invoice's own status.
 *
 *     pnpm test:integration:setup     # builds .pglite-test once
 *     pnpm test:integration
 */

const TEST_DIR = process.env.PLAN_MOVE_TEST_DIR;
const describeIfDb = TEST_DIR ? describe : describe.skip;

const { ACTOR_ID, CUSTOMER_ID } = vi.hoisted(() => ({
  ACTOR_ID: "99999999-9999-4999-8999-99999999c001",
  CUSTOMER_ID: "99999999-9999-4999-8999-99999999c002",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("server-only", () => ({}));

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/db/schema");
let core: typeof import("@/lib/billing/contract-core");
let queries: typeof import("@/lib/queries/billing-contracts");
let docs: typeof import("@/lib/billing/documents");
let validators: typeof import("@/lib/validators/billing-contracts");

const actor = { id: ACTOR_ID, email: "contracts@altus.test", name: "Contracts Tester" };
const created: string[] = [];

async function create(raw: Record<string, unknown>): Promise<string> {
  const parsed = validators.ContractSchema.parse({
    entityId: "altus-corp",
    customerId: CUSTOMER_ID,
    startDate: "2026-04-01",
    endDate: "2027-12-31",
    billingDate: "2026-04-01",
    ...raw,
  });
  const r = await core.saveContract(parsed, actor);
  if (!r.ok) throw new Error(r.error);
  created.push(r.id);
  return r.id;
}

describeIfDb("billing contracts — against the database", () => {
  beforeAll(async () => {
    process.env.DUMMY_MODE = "true";
    process.env.DUMMY_DB_DIR = TEST_DIR!;
    process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-placeholder-0000";

    db = (await import("@/lib/db")).db;
    schema = await import("@/db/schema");
    core = await import("@/lib/billing/contract-core");
    queries = await import("@/lib/queries/billing-contracts");
    docs = await import("@/lib/billing/documents");
    validators = await import("@/lib/validators/billing-contracts");

    await db
      .insert(schema.employees)
      .values({ id: ACTOR_ID, name: "Contracts Tester", email: "contracts@altus.test", role: "both" })
      .onConflictDoNothing();
    await db
      .insert(schema.billingCustomers)
      .values({ id: CUSTOMER_ID, name: "Contract Test Client Pvt Ltd", stateName: "Maharashtra", stateCode: "27" })
      .onConflictDoNothing();
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    const items = created.length
      ? await db
          .select({ documentId: schema.billingContractItems.documentId })
          .from(schema.billingContractItems)
          .where(inArray(schema.billingContractItems.contractId, created))
      : [];
    if (created.length) await db.delete(schema.billingContracts).where(inArray(schema.billingContracts.id, created));
    const docIds = items.map((i) => i.documentId).filter((x): x is string => Boolean(x));
    if (docIds.length) await db.delete(schema.billingDocuments).where(inArray(schema.billingDocuments.id, docIds));
    await db.delete(schema.billingCustomers).where(eq(schema.billingCustomers.id, CUSTOMER_ID));
  });

  it("milestones: raises a real draft tax invoice, once per row", async () => {
    const id = await create({
      totalValue: "100000",
      paymentType: "milestone",
      items: [
        { description: "Kick-off", amount: "40000", dueDate: "2026-05-01" },
        { description: "Delivery", amount: "60000" },
      ],
      pdcs: [
        { chequeNo: "000111", bankName: "HDFC", amount: "40000", drawerName: "Client" },
        { chequeNo: "000112", bankName: "HDFC", amount: "60000.50", drawerName: "Client" },
      ],
    });
    const before = await queries.getContract(id);
    expect(before!.schedule).toHaveLength(2);
    expect(before!.summary.pdc).toEqual({ count: 2, amount: 100000.5 });
    expect(before!.pdcs.map((p) => p.srNo)).toEqual([1, 2]);

    const m1 = before!.schedule[0]!.id;
    const raised = await core.raiseContractBill(id, m1, actor);
    expect(raised.ok).toBe(true);
    if (!raised.ok) return;
    const [doc] = await db.select().from(schema.billingDocuments).where(eq(schema.billingDocuments.id, raised.documentId));
    expect(doc!.docType).toBe("tax_invoice");
    expect(doc!.status).toBe("draft");
    expect(Number(doc!.taxableValue)).toBe(40000);
    expect(doc!.customerId).toBe(CUSTOMER_ID);

    const again = await core.raiseContractBill(id, m1, actor);
    expect(again.ok).toBe(false);

    // A billed row cannot be stopped; an unbilled one can, and then cannot be billed.
    expect((await core.stopContractItem(id, m1)).ok).toBe(false);
    const m2 = before!.schedule[1]!.id;
    expect((await core.stopContractItem(id, m2)).ok).toBe(true);
    expect((await core.raiseContractBill(id, m2, actor)).ok).toBe(false);

    // With m2 stopped and m1 billed, nothing is left: the contract completes.
    const after = await queries.getContract(id);
    expect(after!.contract.status).toBe("completed");
    expect(after!.summary.billedAmount).toBe(40000);
  });

  it("edits: holds the ceiling and protects billed rows", async () => {
    const id = await create({
      totalValue: "50000",
      paymentType: "subscription",
      items: [
        { dueDate: "2026-05-01", amount: "20000" },
        { dueDate: "2026-06-01", amount: "20000" },
      ],
    });
    const d = await queries.getContract(id);
    const [r1, r2] = d!.schedule;
    expect((await core.raiseContractBill(id, r1!.id, actor)).ok).toBe(true);

    const base = {
      id,
      entityId: "altus-corp",
      customerId: CUSTOMER_ID,
      totalValue: "50000",
      startDate: "2026-04-01",
      endDate: "2027-12-31",
      billingDate: "2026-04-01",
      paymentType: "subscription" as const,
    };
    // Changing a billed row's amount is refused.
    let r = await core.saveContract(
      validators.ContractSchema.parse({
        ...base,
        items: [
          { id: r1!.id, dueDate: "2026-05-01", amount: "25000" },
          { id: r2!.id, dueDate: "2026-06-01", amount: "20000" },
        ],
      }),
      actor,
    );
    expect(r.ok).toBe(false);
    // Removing a billed row is refused.
    r = await core.saveContract(
      validators.ContractSchema.parse({ ...base, items: [{ id: r2!.id, dueDate: "2026-06-01", amount: "20000" }] }),
      actor,
    );
    expect(r.ok).toBe(false);
    // Lowering the contract value below what is billed is refused — by the
    // schema (the rows no longer fit) or, failing that, by the core.
    const lowered = validators.ContractSchema.safeParse({
      ...base,
      totalValue: "10000",
      items: [{ id: r1!.id, dueDate: "2026-05-01", amount: "20000" }],
    });
    if (lowered.success) expect((await core.saveContract(lowered.data, actor)).ok).toBe(false);
    else expect(lowered.error.issues.map((i) => i.message)).toContain("Total cannot exceed Contract Value");
    // "+ Add more" within the ceiling is fine.
    r = await core.saveContract(
      validators.ContractSchema.parse({
        ...base,
        items: [
          { id: r1!.id, dueDate: "2026-05-01", amount: "20000" },
          { id: r2!.id, dueDate: "2026-06-01", amount: "20000" },
          { dueDate: "2026-07-01", amount: "10000" },
        ],
      }),
      actor,
    );
    expect(r.ok).toBe(true);
    expect((await queries.getContract(id))!.schedule.map((s) => s.seq)).toEqual([1, 2, 3]);
  });

  it("retainer: bills quarterly periods, cuts the last short and stops at the value", async () => {
    const id = await create({
      totalValue: "100000",
      paymentType: "retainer",
      billingFrequency: "quarterly",
      retainerAmount: "30000",
    });
    const amounts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await core.raiseContractBill(id, null, actor);
      expect(r.ok).toBe(true);
      const d = await queries.getContract(id);
      amounts.push(d!.schedule[d!.schedule.length - 1]!.amount);
    }
    expect(amounts).toEqual([30000, 30000, 30000, 10000]);
    const d = await queries.getContract(id);
    expect(d!.schedule.map((s) => s.dueDate)).toEqual(["2026-04-01", "2026-07-01", "2026-10-01", "2027-01-01"]);
    expect(d!.contract.status).toBe("completed");
    expect(d!.summary.billedAmount).toBe(100000);
    expect((await core.raiseContractBill(id, null, actor)).ok).toBe(false);
  });

  it("retainer: Stop Billing halts it and Resume restarts it", async () => {
    const id = await create({ totalValue: "60000", paymentType: "retainer", billingFrequency: "monthly", retainerAmount: "10000" });
    expect((await core.setContractBillingStopped(id, true, actor)).ok).toBe(true);
    expect((await core.raiseContractBill(id, null, actor)).ok).toBe(false);
    expect((await core.setContractBillingStopped(id, false, actor)).ok).toBe(true);
    expect((await core.raiseContractBill(id, null, actor)).ok).toBe(true);
  });

  it("full payment: defaults to the contract value; paid and cancelled invoices move the buckets", async () => {
    const id = await create({
      totalValue: "75000",
      paymentType: "full_payment",
      items: [],
    });
    const d = await queries.getContract(id);
    expect(d!.schedule).toHaveLength(1);
    expect(d!.schedule[0]!.amount).toBe(75000);

    const r = await core.raiseContractBill(id, d!.schedule[0]!.id, actor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Cancel the invoice: the row may be billed again.
    await docs.cancelBillingDocument(r.documentId, "Wrong GST rate", actor);
    const reopened = await queries.getContract(id);
    expect(reopened!.schedule[0]!.live).toBe(false);
    const again = await core.raiseContractBill(id, d!.schedule[0]!.id, actor);
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    // Paid once the invoice is generated and a payment is recorded — the
    // engine's own rule, which the contract view simply reads.
    const gen = await docs.generateBillingDocument(again.documentId, actor);
    expect(gen.ok).toBe(true);
    expect((await docs.markBillingDocumentPaid(again.documentId, 88500, "2026-09-01", actor)).ok).toBe(true);
    const paid = await queries.getContract(id);
    expect(paid!.summary.buckets.paid).toEqual({ count: 1, amount: 75000 });
    expect(paid!.summary.buckets.unpaid.count).toBe(0);

    const list = await queries.listContracts();
    expect(list.rows.some((c) => c.id === id)).toBe(true);
    expect(list.totals.paid.count).toBeGreaterThanOrEqual(1);
  });

  it("delete: only a contract that never raised a bill", async () => {
    const fresh = await create({ totalValue: "1000", paymentType: "milestone", items: [{ amount: "1000" }] });
    expect((await core.deleteContract(fresh)).ok).toBe(true);
    expect(await queries.getContract(fresh)).toBeNull();

    const billed = await create({ totalValue: "1000", paymentType: "milestone", items: [{ amount: "1000" }] });
    const d = await queries.getContract(billed);
    await core.raiseContractBill(billed, d!.schedule[0]!.id, actor);
    expect((await core.deleteContract(billed)).ok).toBe(false);
  });
});
