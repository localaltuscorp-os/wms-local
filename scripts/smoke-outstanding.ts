/**
 * RUNTIME smoke test for the rebuilt Outstanding Tracker.
 *
 * Seeds two contracts + their installments (materialized the same way the real
 * create path does, via `generateSchedule`) + one collection into the DEV DB,
 * then drives the real query layer (`loadOutstandingDashboard`) and prints the
 * dashboard totals / sample entries / collections so the engine+query+allocation
 * math can be verified against real DB rows. Cleans up everything it inserted.
 *
 * Every inserted row's client name starts with "SMOKE " so cleanup is trivial.
 *
 * The query layer imports `server-only`, which throws under plain node. Run with
 * the react-server export condition so that resolves to the no-op shim:
 *
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/smoke-outstanding.ts
 *
 * Pass `--keep` to skip cleanup (leaves SMOKE rows in the DB for manual inspection).
 */
import { sql, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
} from "@/db/schema";
import { generateSchedule } from "@/lib/outstanding/schedule";
import type { ContractInput } from "@/lib/outstanding/types";
import { loadOutstandingDashboard } from "@/lib/queries/outstanding";

// Roster + employee ids resolved at runtime so this works on any seeded dev DB.
import {
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  employees,
} from "@/db/schema";

const KEEP = process.argv.includes("--keep");

const HORIZON = "2027-12-01";
const TODAY = "2026-06-13";

async function countAll() {
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(outstandingContracts);
  const [i] = await db.select({ n: sql<number>`count(*)::int` }).from(outstandingInstallments);
  const [col] = await db.select({ n: sql<number>`count(*)::int` }).from(outstandingCollections);
  return { contracts: c?.n ?? 0, installments: i?.n ?? 0, collections: col?.n ?? 0 };
}

async function main() {
  const before = await countAll();
  console.log("BEFORE counts:", JSON.stringify(before));

  // 1. Resolve a real product / entity / payment_mode / responsible.
  const [product] = await db.select().from(outstandingProducts).limit(1);
  const [entity] = await db.select().from(outstandingEntitiesTbl).limit(1);
  const [mode] = await db.select().from(outstandingPaymentModes).limit(1);
  const [emp] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(sql`is_active = true`)
    .limit(1);
  if (!product || !entity || !mode || !emp) {
    throw new Error("Rosters/employees not seeded — cannot run smoke.");
  }
  console.log(
    `Using product=${product.name} entity=${entity.name} mode=${mode.name} responsible=${emp.name}`,
  );

  // 2. Insert two contracts.
  const [alpha] = await db
    .insert(outstandingContracts)
    .values({
      clientName: "SMOKE Test Alpha",
      productId: product.id,
      entityId: entity.id,
      responsibleId: emp.id,
      expectedModeId: mode.id,
      cycle: "subscription",
      baseAmount: (25000).toFixed(2),
      gstRate: 0,
      startDate: "2025-09-01",
      periods: 6,
      pdcReceived: false,
      createdById: emp.id,
    })
    .returning({ id: outstandingContracts.id });

  const [beta] = await db
    .insert(outstandingContracts)
    .values({
      clientName: "SMOKE Test Beta",
      productId: product.id,
      entityId: entity.id,
      responsibleId: emp.id,
      expectedModeId: mode.id,
      cycle: "full_payment",
      baseAmount: (50000).toFixed(2),
      gstRate: 18,
      startDate: "2026-07-01",
      periods: 1,
      pdcReceived: true,
      createdById: emp.id,
    })
    .returning({ id: outstandingContracts.id });

  if (!alpha || !beta) throw new Error("Contract insert returned no row.");
  console.log(`Inserted contract Alpha id=${alpha.id}`);
  console.log(`Inserted contract Beta  id=${beta.id}`);

  // 3. Materialize installments the same way the create path does
  //    (generateSchedule → insert rows).
  const alphaInput: ContractInput = {
    id: alpha.id,
    clientName: "SMOKE Test Alpha",
    cycle: "subscription",
    baseAmount: 25000,
    gstRate: 0,
    startDate: "2025-09-01",
    periods: 6,
    endDate: null,
    status: "active",
  };
  const betaInput: ContractInput = {
    id: beta.id,
    clientName: "SMOKE Test Beta",
    cycle: "full_payment",
    baseAmount: 50000,
    gstRate: 18,
    startDate: "2026-07-01",
    periods: 1,
    endDate: null,
    status: "active",
  };

  const alphaSpecs = generateSchedule(alphaInput, HORIZON);
  const betaSpecs = generateSchedule(betaInput, HORIZON);

  const insertedInstallments = await db
    .insert(outstandingInstallments)
    .values(
      [...alphaSpecs, ...betaSpecs].map((s) => ({
        contractId: s.contractId,
        periodIndex: s.periodIndex,
        dueDate: s.dueDate,
        amount: s.amount.toFixed(2),
        isOverride: false,
      })),
    )
    .returning({ id: outstandingInstallments.id });
  console.log(
    `Inserted ${insertedInstallments.length} installments ` +
      `(Alpha ${alphaSpecs.length}: ${alphaSpecs.map((s) => s.amount).join(",")}; ` +
      `Beta ${betaSpecs.length}: ${betaSpecs.map((s) => s.amount).join(",")})`,
  );

  // 4. One collection for Alpha.
  const [coll] = await db
    .insert(outstandingCollections)
    .values({
      clientName: "SMOKE Test Alpha",
      contractId: alpha.id,
      amount: (30000).toFixed(2),
      paymentModeId: mode.id,
      responsibleId: emp.id,
      collectedAt: "2025-10-05",
      createdById: emp.id,
    })
    .returning({ id: outstandingCollections.id });
  if (!coll) throw new Error("Collection insert returned no row.");
  console.log(`Inserted collection id=${coll.id} (Alpha, 30000)`);

  // 5. Drive the real query layer.
  console.log("\n=== loadOutstandingDashboard ===");
  const { dashboard, entries, collectionEntries } = await loadOutstandingDashboard(
    { employees: [], entities: [], months: [], years: [], cycles: [], modes: [], statuses: [], pdcOnly: false },
    TODAY,
    HORIZON,
  );

  console.log("totals:", JSON.stringify(dashboard.totals, null, 2));
  console.log("collections.totalCollected:", dashboard.collections.totalCollected);
  console.log(`entries.length=${entries.length} collectionEntries.length=${collectionEntries.length}`);
  console.log("\nfirst entries (client, dueDate, balance, state, daysOverdue):");
  for (const e of entries.slice(0, 8)) {
    console.log(
      `  ${e.clientName.padEnd(18)} due=${e.dueDate} balance=${e.balance} state=${e.state} daysOverdue=${e.daysOverdue}`,
    );
  }

  // Focused sanity numbers for the two SMOKE clients.
  const smokeEntries = entries.filter((e) => e.clientName.startsWith("SMOKE "));
  const alphaOpen = smokeEntries.filter((e) => e.clientName === "SMOKE Test Alpha");
  const betaOpen = smokeEntries.filter((e) => e.clientName === "SMOKE Test Beta");
  const alphaBalance = alphaOpen.reduce((s, e) => s + e.balance, 0);
  const betaBalance = betaOpen.reduce((s, e) => s + e.balance, 0);
  console.log("\n=== SMOKE expectations ===");
  console.log(`Alpha open installments=${alphaOpen.length} totalBalance=${alphaBalance} (expect 5 open, 120000)`);
  console.log(`Beta  open installments=${betaOpen.length} totalBalance=${betaBalance} (expect 1 open, 59000, not_due)`);
  console.log(`totalCollected=${dashboard.collections.totalCollected} (expect 30000)`);

  // 6. Cleanup.
  if (KEEP) {
    console.log("\n--keep set; leaving SMOKE rows in place.");
    return;
  }
  await db.delete(outstandingCollections).where(like(outstandingCollections.clientName, "SMOKE %"));
  // Installments cascade on contract delete, but delete explicitly first to be safe.
  await db.delete(outstandingInstallments).where(inArray(outstandingInstallments.contractId, [alpha.id, beta.id]));
  await db.delete(outstandingContracts).where(like(outstandingContracts.clientName, "SMOKE %"));

  const after = await countAll();
  console.log("\nAFTER counts:", JSON.stringify(after));
  const restored =
    after.contracts === before.contracts &&
    after.installments === before.installments &&
    after.collections === before.collections;
  console.log(restored ? "CLEANUP OK — counts restored." : "CLEANUP MISMATCH — see counts above.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Smoke failed:", err);
    process.exit(1);
  });
