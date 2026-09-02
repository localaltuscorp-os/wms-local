#!/usr/bin/env tsx
/**
 * Importer for the real `Outstanding Tracker.xlsx` (repo root).  Reads the
 * `Outstanding` (dated installments) and `Collection` (payments) sheets, runs
 * them through the tested pure mappers, resolves roster + responsible names
 * against the DB, and prints a reconciliation report.
 *
 *   DRY RUN (default — NO writes):
 *     npx tsx --env-file=.env.local scripts/import-outstanding-xlsx.ts
 *
 *   APPLY (writes additively to the configured DB, in one transaction):
 *     npx tsx --env-file=.env.local scripts/import-outstanding-xlsx.ts --apply
 *
 * ⚠ The default makes NO DATABASE WRITES (only SELECTs for name resolution).
 * Only `--apply` writes. Writes are purely additive inserts into the
 * outstanding_* tables, wrapped in a single transaction (all-or-nothing),
 * with idempotency guards (skip duplicates).
 */
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
} from "@/db/schema";
import {
  mapOutstandingRows,
  mapCollectionRows,
  parseAmount,
  type RawOutstandingRow,
  type RawCollectionRow,
} from "@/lib/outstanding/import-map";

const FILE = "Outstanding Tracker.xlsx";
const APPLY = process.argv.includes("--apply");

// Employee name aliases (sheet spelling → canonical roster name),
// case-insensitive on the LHS. Applied at responsible-name resolution.
const EMPLOYEE_ALIASES: Record<string, string> = {
  "rohan chaudhary": "Rohan Choudhary",
};

function aliasEmployee(name: string): string {
  return EMPLOYEE_ALIASES[name.trim().toLowerCase()] ?? name;
}

// ── Column indices in the `Outstanding` sheet (header at row 0) ───────────
// S. No.(0) First Name(1) Last Name(2) Cell No(3) Product(4)
// Responsible Person(5) Amount(6) GST(7) Total(8) Paid Amt(9) Balance(10)
// Payment Cycle(11) Due Date(12) … Entity(21) Payment Mode(22)
// PDC Received(23) Other Comments(24) Attachments(25)
const O = {
  firstName: 1,
  lastName: 2,
  product: 4,
  responsible: 5,
  total: 8,
  balance: 10,
  cycle: 11,
  dueDate: 12,
  entity: 21,
  paymentMode: 22,
  pdcReceived: 23,
} as const;

// ── Column indices in the `Collection` sheet ──────────────────────────────
// S.No(0) Name(1) Amount(2) Payment Mode(3) Responsible Person(4)
// Other Comments(5) Attachments(6)
const C = {
  name: 1,
  amount: 2,
  paymentMode: 3,
  responsible: 4,
  comments: 5,
} as const;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Robust Excel-serial → "YYYY-MM-DD".  Handles:
 *   - number (Excel serial, e.g. 46068)                → via SSF.parse_date_code
 *   - numeric string ("46068")                          → same
 *   - a real Date object (cellDates / pre-parsed)       → calendar date
 *   - an already-formatted date string                  → passed through (the
 *     mapper's parseDate copes with ISO / dd-Mon-yyyy / dd/mm/yyyy)
 * Returns "" when the cell is blank or unconvertible (the mapper then skips
 * the row, and we count it as a parse failure for reporting).
 */
function serialToYmd(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }

  let serial: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) serial = v;
  else if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) serial = Number(v.trim());

  if (serial !== null) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (!d || !d.y) return "";
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }

  // Non-numeric string — hand the raw text to the mapper's parseDate by
  // returning it verbatim; parseDate understands the sheet's textual formats.
  return str(v);
}

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function lakhs(n: number): string {
  return (n / 100000).toFixed(2) + "L";
}

interface DateFailure {
  rowNumber: number; // 1-based data row
  clientName: string;
  rawDue: unknown;
}

/** Standalone verify against the LIVE DB via the real query engine. */
async function verifyOnly() {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`LIVE VERIFY — loadOutstandingDashboard (real query engine)`);
  console.log(`${"═".repeat(72)}`);
  const { loadOutstandingDashboard } = await import("@/lib/queries/outstanding");
  const { rollingHorizon } = await import("@/lib/outstanding/horizon");
  const emptyFilters: Parameters<typeof loadOutstandingDashboard>[0] = {
    employees: [],
    entities: [],
    months: [],
    years: [],
    cycles: [],
    modes: [],
    statuses: [],
    pdcOnly: false,
  };
  const verifyToday = new Date().toISOString().slice(0, 10);
  const { dashboard, entries } = await loadOutstandingDashboard(
    emptyFilters,
    verifyToday,
    rollingHorizon(verifyToday),
  );
  console.log(`totals.totalOutstanding: ${inr(dashboard.totals.totalOutstanding)}  (${lakhs(dashboard.totals.totalOutstanding)})`);
  console.log(`totals.overdue:          ${inr(dashboard.totals.overdue)}  (${lakhs(dashboard.totals.overdue)})`);
  console.log(`totals.notDue:           ${inr(dashboard.totals.notDue)}  (${lakhs(dashboard.totals.notDue)})`);
  console.log(`totals.pdcNotReceived:   ${dashboard.totals.pdcNotReceived} (count)`);
  console.log(`collections.totalCollected: ${inr(dashboard.collections.totalCollected)}  (${lakhs(dashboard.collections.totalCollected)})`);
  console.log(`entries.length (open installments): ${entries.length}`);

  const [cc] = await db.execute<{ n: number }>(sql`select count(*)::int as n from outstanding_contracts`);
  const [ic] = await db.execute<{ n: number }>(sql`select count(*)::int as n from outstanding_installments`);
  const [coc] = await db.execute<{ n: number }>(sql`select count(*)::int as n from outstanding_collections`);
  console.log("");
  console.log(`outstanding_contracts:    ${cc?.n}`);
  console.log(`outstanding_installments: ${ic?.n}`);
  console.log(`outstanding_collections:  ${coc?.n}`);
  console.log("");
}

async function main() {
  if (process.argv.includes("--verify-only")) {
    await verifyOnly();
    return;
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(
    `Outstanding Tracker.xlsx importer  [${APPLY ? "APPLY — WRITING TO DB" : "DRY RUN — NO DATABASE WRITES"}]`,
  );
  console.log(`${"═".repeat(72)}\n`);

  const wb = XLSX.readFile(FILE);
  const wsOut = wb.Sheets["Outstanding"];
  const wsCol = wb.Sheets["Collection"];
  if (!wsOut) throw new Error(`Sheet "Outstanding" not found in ${FILE}`);
  if (!wsCol) throw new Error(`Sheet "Collection" not found in ${FILE}`);

  // raw:true so Due Date stays an Excel serial we convert ourselves.
  const outArr = XLSX.utils.sheet_to_json(wsOut, {
    header: 1,
    blankrows: false,
    raw: true,
  }) as unknown[][];
  const colArr = XLSX.utils.sheet_to_json(wsCol, {
    header: 1,
    blankrows: false,
    raw: true,
  }) as unknown[][];

  // ── Build RawOutstandingRow[] (skip header row 0) ───────────────────────
  const outRows: RawOutstandingRow[] = [];
  const dateFailures: DateFailure[] = [];
  let sumTotalColumn = 0;
  let sumBalanceColumn = 0;

  for (let i = 1; i < outArr.length; i++) {
    const r = outArr[i]!;
    const first = str(r[O.firstName]);
    const last = str(r[O.lastName]);
    const clientName = `${first} ${last}`.replace(/\s+/g, " ").trim();

    const rawDue = r[O.dueDate];
    const dueDate = serialToYmd(rawDue);

    // Cross-check sums use the sheet's own Total / Balance columns directly,
    // restricted to rows that actually carry a client (skip structural rows).
    if (clientName) {
      sumTotalColumn += parseAmount(r[O.total] as string | number | null);
      sumBalanceColumn += parseAmount(r[O.balance] as string | number | null);
    }

    // Report rows that have a client but whose Due Date won't parse — these
    // are dropped by the mapper and would silently vanish from the import.
    if (clientName && !dueDate) {
      dateFailures.push({ rowNumber: i, clientName, rawDue });
    }

    outRows.push({
      clientName,
      product: str(r[O.product]),
      cycle: str(r[O.cycle]),
      entity: str(r[O.entity]),
      responsible: str(r[O.responsible]), // TRIM — source has leading spaces
      dueDate,
      amount: r[O.total] as string | number | null, // gross billed (incl GST)
      pdcReceived: (r[O.pdcReceived] as string | null) ?? null,
    });
  }

  // ── Build RawCollectionRow[] (skip header row 0) ────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const colRows: RawCollectionRow[] = [];
  for (let i = 1; i < colArr.length; i++) {
    const r = colArr[i]!;
    colRows.push({
      clientName: str(r[C.name]),
      amount: r[C.amount] as string | number | null,
      paymentMode: str(r[C.paymentMode]),
      responsible: str(r[C.responsible]),
      comments: str(r[C.comments]),
      collectedAt: today, // sheet has no date; irrelevant to oldest-first alloc
    });
  }

  // ── Map (pure) ──────────────────────────────────────────────────────────
  const { contracts } = mapOutstandingRows(outRows);
  const collections = mapCollectionRows(colRows);

  // ── Derived reconciliation totals ───────────────────────────────────────
  const totalInstallments = contracts.reduce((s, c) => s + c.installments.length, 0);
  const sumInstallmentAmounts = contracts.reduce(
    (s, c) => s + c.installments.reduce((a, ins) => a + ins.amount, 0),
    0,
  );
  const sumCollections = collections.reduce((s, c) => s + c.amount, 0);
  const derivedOutstanding = sumInstallmentAmounts - sumCollections;

  // ── Name → id resolution (REPORT ONLY) ──────────────────────────────────
  const empRows = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const empByName = new Map(empRows.map((e) => [e.name.trim().toLowerCase(), e.id]));

  const prodRows = await db.select({ name: outstandingProducts.name }).from(outstandingProducts);
  const entRows = await db.select({ name: outstandingEntitiesTbl.name }).from(outstandingEntitiesTbl);
  const modeRows = await db.select({ name: outstandingPaymentModes.name }).from(outstandingPaymentModes);
  const prodSet = new Set(prodRows.map((p) => p.name.trim().toLowerCase()));
  const entSet = new Set(entRows.map((e) => e.name.trim().toLowerCase()));
  const modeSet = new Set(modeRows.map((m) => m.name.trim().toLowerCase()));

  const resolved = { product: 0, entity: 0, mode: 0, responsible: 0 };
  const total = { product: 0, entity: 0, mode: 0, responsible: 0 };
  const unmatched = {
    product: new Set<string>(),
    entity: new Set<string>(),
    mode: new Set<string>(),
    responsible: new Set<string>(),
  };

  function checkRoster(kind: "product" | "entity" | "mode", set: Set<string>, name: string | null) {
    const t = (name ?? "").trim();
    if (!t) return;
    total[kind]++;
    if (set.has(t.toLowerCase())) resolved[kind]++;
    else unmatched[kind].add(t);
  }
  function checkResponsible(name: string | null) {
    const t = aliasEmployee((name ?? "").trim());
    if (!t) return;
    total.responsible++;
    if (empByName.has(t.toLowerCase())) resolved.responsible++;
    else unmatched.responsible.add(t);
  }

  for (const c of contracts) {
    checkRoster("product", prodSet, c.product);
    checkRoster("entity", entSet, c.entity);
    checkResponsible(c.responsible);
  }
  for (const col of collections) {
    checkRoster("mode", modeSet, col.paymentMode);
    checkResponsible(col.responsible);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  OUTPUT
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`Source rows: ${outArr.length - 1} Outstanding, ${colArr.length - 1} Collection\n`);

  console.log(`${"─".repeat(72)}`);
  console.log(`RECONCILIATION`);
  console.log(`${"─".repeat(72)}`);
  console.log(`Contracts:                 ${contracts.length}`);
  console.log(`Installments:              ${totalInstallments}   (expect ~148)`);
  console.log(`Collections:               ${collections.length}   (expect ~23)`);
  console.log("");
  console.log(`Σ installment amounts (Σ Total, mapped): ${inr(sumInstallmentAmounts)}  (${lakhs(sumInstallmentAmounts)})`);
  console.log(`Σ Total column (sheet, direct):          ${inr(sumTotalColumn)}  (${lakhs(sumTotalColumn)})`);
  console.log(`Σ collection amounts:                    ${inr(sumCollections)}  (${lakhs(sumCollections)})`);
  console.log(`Derived outstanding (ΣTotal − Σcoll):    ${inr(derivedOutstanding)}  (${lakhs(derivedOutstanding)})`);
  console.log(`Σ Balance column (sheet, cross-check):   ${inr(sumBalanceColumn)}  (${lakhs(sumBalanceColumn)})`);
  console.log("");
  console.log(`  Targets — outstanding ~₹97.48L, collected ~₹19.61L, ΣTotal ~₹1,17,14,212`);
  console.log("");

  // ── Roster resolution report ────────────────────────────────────────────
  console.log(`${"─".repeat(72)}`);
  console.log(`NAME RESOLUTION (against current DB rosters — REPORT ONLY, no writes)`);
  console.log(`${"─".repeat(72)}`);
  console.log(`Products:     ${resolved.product}/${total.product} resolved`);
  console.log(`Entities:     ${resolved.entity}/${total.entity} resolved`);
  console.log(`Payment modes:${resolved.mode}/${total.mode} resolved`);
  console.log(`Responsibles: ${resolved.responsible}/${total.responsible} resolved`);
  console.log("");

  function reportUnmatched(label: string, s: Set<string>) {
    if (s.size === 0) {
      console.log(`✓ All ${label} matched.`);
      return;
    }
    console.log(`⚠ UNMATCHED ${label} (${s.size}) — must be created/fixed before --apply:`);
    for (const n of [...s].sort()) console.log(`    ? ${n}`);
  }
  reportUnmatched("products", unmatched.product);
  reportUnmatched("entities", unmatched.entity);
  reportUnmatched("payment modes", unmatched.mode);
  reportUnmatched("responsibles", unmatched.responsible);
  console.log("");

  // ── Mapping sanity ──────────────────────────────────────────────────────
  console.log(`${"─".repeat(72)}`);
  console.log(`MAPPING SANITY`);
  console.log(`${"─".repeat(72)}`);
  const top5 = [...contracts]
    .sort((a, b) => b.installments.length - a.installments.length)
    .slice(0, 5);
  console.log(`Top 5 contracts by installment count:`);
  for (const c of top5) {
    const tot = c.installments.reduce((a, i) => a + i.amount, 0);
    console.log(
      `    ${c.installments.length}×  ${c.clientName}  |  ${c.product ?? "—"}  |  ${c.cycle}  |  total ${inr(tot)}`,
    );
  }
  console.log("");

  console.log(`Due-date parse failures (rows with a client but unparseable Due Date): ${dateFailures.length}`);
  for (const f of dateFailures.slice(0, 5)) {
    console.log(`    row ${f.rowNumber}: ${f.clientName} — rawDue=${JSON.stringify(f.rawDue)}`);
  }
  if (dateFailures.length > 5) console.log(`    … ${dateFailures.length - 5} more`);
  console.log("");

  // ── Will-create products (referenced by contracts but absent from roster) ──
  const missingProducts = [...unmatched.product];
  if (missingProducts.length) {
    console.log(`${"─".repeat(72)}`);
    console.log(`PRODUCTS TO CREATE ON --apply (referenced but missing):`);
    for (const p of missingProducts.sort()) console.log(`    + ${p}  (will be inserted into outstanding_products)`);
    console.log("");
  }

  if (!APPLY) {
    console.log(`${"═".repeat(72)}`);
    console.log(`DRY RUN COMPLETE — nothing was written to the database.`);
    console.log(`Re-run with --apply to write.`);
    console.log(`${"═".repeat(72)}\n`);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  APPLY — additive inserts in a single transaction (all-or-nothing)
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`${"═".repeat(72)}`);
  console.log(`APPLY — writing to the database…`);
  console.log(`${"═".repeat(72)}\n`);

  const money = (n: number) => n.toFixed(2);

  const counts = {
    productsCreated: 0,
    contractsInserted: 0,
    contractsSkipped: 0,
    installmentsInserted: 0,
    collectionsInserted: 0,
    collectionsSkipped: 0,
  };

  await db.transaction(async (tx) => {
    // 1. Create any missing products referenced by the contracts (e.g.
    //    "Commission"). sortOrder 60 per spec. All other entities + modes
    //    already resolve, so only products may need creating.
    const prodIdByName = new Map<string, string>(); // lower(name) → id
    {
      const rows = await tx
        .select({ id: outstandingProducts.id, name: outstandingProducts.name })
        .from(outstandingProducts);
      for (const r of rows) prodIdByName.set(r.name.trim().toLowerCase(), r.id);
    }
    for (const name of missingProducts) {
      const inserted = await tx
        .insert(outstandingProducts)
        .values({ name, sortOrder: 60 })
        .returning({ id: outstandingProducts.id, name: outstandingProducts.name });
      const row = inserted[0]!;
      prodIdByName.set(row.name.trim().toLowerCase(), row.id);
      counts.productsCreated++;
      console.log(`  + created product "${name}" (id=${row.id})`);
    }

    // Re-read entity + mode id maps (fresh in-txn).
    const entIdByName = new Map<string, string>();
    {
      const rows = await tx
        .select({ id: outstandingEntitiesTbl.id, name: outstandingEntitiesTbl.name })
        .from(outstandingEntitiesTbl);
      for (const r of rows) entIdByName.set(r.name.trim().toLowerCase(), r.id);
    }
    const modeIdByName = new Map<string, string>();
    {
      const rows = await tx
        .select({ id: outstandingPaymentModes.id, name: outstandingPaymentModes.name })
        .from(outstandingPaymentModes);
      for (const r of rows) modeIdByName.set(r.name.trim().toLowerCase(), r.id);
    }
    const empIdByName = new Map<string, string>();
    {
      const rows = await tx.select({ id: employees.id, name: employees.name }).from(employees);
      for (const r of rows) empIdByName.set(r.name.trim().toLowerCase(), r.id);
    }

    const resolveProduct = (n: string | null) =>
      n ? prodIdByName.get(n.trim().toLowerCase()) ?? null : null;
    const resolveEntity = (n: string | null) =>
      n ? entIdByName.get(n.trim().toLowerCase()) ?? null : null;
    const resolveMode = (n: string | null) =>
      n ? modeIdByName.get(n.trim().toLowerCase()) ?? null : null;
    const resolveEmp = (n: string | null) =>
      n ? empIdByName.get(aliasEmployee(n).trim().toLowerCase()) ?? null : null;

    // Idempotency snapshot: capture the keys of contracts/collections that
    // already existed BEFORE this run, so re-running is a no-op. We do NOT
    // dedup WITHIN this batch — the legacy sheet legitimately carries distinct
    // rows that share (clientName,startDate,product) or (clientName,amount,date)
    // (e.g. two Tarun Shahu Consulting contracts; two equal cash collections),
    // and collapsing those would silently drop real data.
    const preExistingContractKeys = new Set<string>();
    {
      const rows = await tx
        .select({
          clientName: outstandingContracts.clientName,
          startDate: outstandingContracts.startDate,
          productId: outstandingContracts.productId,
        })
        .from(outstandingContracts);
      for (const r of rows)
        preExistingContractKeys.add(`${r.clientName}|${r.startDate}|${r.productId ?? ""}`);
    }
    const preExistingCollectionKeys = new Set<string>();
    {
      const rows = await tx
        .select({
          clientName: outstandingCollections.clientName,
          amount: outstandingCollections.amount,
          collectedAt: outstandingCollections.collectedAt,
        })
        .from(outstandingCollections);
      for (const r of rows)
        preExistingCollectionKeys.add(`${r.clientName}|${r.amount}|${r.collectedAt}`);
    }

    // 2. Contracts + their installments (verbatim).
    for (const c of contracts) {
      const productId = resolveProduct(c.product);
      const entityId = resolveEntity(c.entity);
      const responsibleId = resolveEmp(c.responsible);

      // Idempotency guard (re-run safety only): skip if a contract with the
      // same (clientName, startDate, productId) existed BEFORE this run.
      const ckey = `${c.clientName}|${c.startDate}|${productId ?? ""}`;
      if (preExistingContractKeys.has(ckey)) {
        counts.contractsSkipped++;
        continue;
      }

      const insertedContract = await tx
        .insert(outstandingContracts)
        .values({
          clientName: c.clientName,
          productId,
          entityId,
          responsibleId,
          expectedModeId: null,
          cycle: c.cycle,
          baseAmount: money(c.baseAmount),
          gstRate: 0,
          startDate: c.startDate,
          periods: null, // verbatim import — do NOT let the app re-materialize
          endDate: null,
          pdcReceived: c.pdcReceived,
          comments: null,
          status: "active",
          createdById: null,
        })
        .returning({ id: outstandingContracts.id });
      const contractId = insertedContract[0]!.id;
      counts.contractsInserted++;

      // Installments verbatim. installments are already sorted by dueDate in
      // the mapper; periodIndex = index in that sorted array. isOverride=true
      // protects imported rows from any re-materialization.
      const rows = c.installments.map((ins, idx) => ({
        contractId,
        periodIndex: idx,
        dueDate: ins.dueDate,
        amount: money(ins.amount),
        isOverride: true,
      }));
      if (rows.length) {
        await tx.insert(outstandingInstallments).values(rows);
        counts.installmentsInserted += rows.length;
      }
    }

    // 3. Collections.
    for (const col of collections) {
      const paymentModeId = resolveMode(col.paymentMode);
      const responsibleId = resolveEmp(col.responsible);
      const collectedAt = col.collectedAt || today;

      // Idempotency guard (re-run safety only): skip if a collection with the
      // same (clientName, amount, collectedAt) existed BEFORE this run.
      const colKey = `${col.clientName}|${money(col.amount)}|${collectedAt}`;
      if (preExistingCollectionKeys.has(colKey)) {
        counts.collectionsSkipped++;
        continue;
      }

      await tx.insert(outstandingCollections).values({
        clientName: col.clientName,
        contractId: null,
        amount: money(col.amount),
        paymentModeId,
        responsibleId,
        collectedAt,
        comments: col.comments,
        createdById: null,
      });
      counts.collectionsInserted++;
    }
  });

  console.log("");
  console.log(`${"─".repeat(72)}`);
  console.log(`WRITE SUMMARY`);
  console.log(`${"─".repeat(72)}`);
  console.log(`Products created:        ${counts.productsCreated}`);
  console.log(`Contracts inserted:      ${counts.contractsInserted}   (skipped ${counts.contractsSkipped})`);
  console.log(`Installments inserted:   ${counts.installmentsInserted}`);
  console.log(`Collections inserted:    ${counts.collectionsInserted}   (skipped ${counts.collectionsSkipped})`);
  console.log("");

  // ── Row counts (raw SQL) ───────────────────────────────────────────────
  const [contractCount] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from outstanding_contracts`,
  );
  const [installmentCount] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from outstanding_installments`,
  );
  const [collectionCount] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from outstanding_collections`,
  );
  console.log(`${"─".repeat(72)}`);
  console.log(`ROW COUNTS (post-apply)`);
  console.log(`${"─".repeat(72)}`);
  console.log(`outstanding_contracts:    ${contractCount?.n}   (expect ~38)`);
  console.log(`outstanding_installments: ${installmentCount?.n}   (expect ~148)`);
  console.log(`outstanding_collections:  ${collectionCount?.n}   (expect ~23)`);
  console.log("");

  // ── LIVE verify via the real query layer (engine + allocation) ──────────
  // The query layer is `import "server-only"`, which throws under plain tsx.
  // Run this script with `--conditions=react-server` to exercise the verify
  // here; otherwise it degrades to a hint (writes are already committed).
  console.log(`${"─".repeat(72)}`);
  console.log(`LIVE VERIFY — loadOutstandingDashboard (real query engine)`);
  console.log(`${"─".repeat(72)}`);
  try {
    const { loadOutstandingDashboard } = await import("@/lib/queries/outstanding");
    const { rollingHorizon } = await import("@/lib/outstanding/horizon");
    const emptyFilters: Parameters<typeof loadOutstandingDashboard>[0] = {
      employees: [],
      entities: [],
      months: [],
      years: [],
      cycles: [],
      modes: [],
      statuses: [],
      pdcOnly: false,
    };
    const verifyToday = new Date().toISOString().slice(0, 10);
    const { dashboard, entries } = await loadOutstandingDashboard(
      emptyFilters,
      verifyToday,
      rollingHorizon(verifyToday),
    );
    console.log(`totals.totalOutstanding: ${inr(dashboard.totals.totalOutstanding)}  (${lakhs(dashboard.totals.totalOutstanding)})`);
    console.log(`totals.overdue:          ${inr(dashboard.totals.overdue)}  (${lakhs(dashboard.totals.overdue)})`);
    console.log(`totals.notDue:           ${inr(dashboard.totals.notDue)}  (${lakhs(dashboard.totals.notDue)})`);
    console.log(`totals.pdcNotReceived:   ${dashboard.totals.pdcNotReceived} (count)`);
    console.log(`collections.totalCollected: ${inr(dashboard.collections.totalCollected)}  (${lakhs(dashboard.collections.totalCollected)})`);
    console.log(`entries.length (open installments): ${entries.length}`);
    console.log("");
    console.log(`  EXPECT — totalOutstanding ≈ ₹97.5L, totalCollected = ₹19,61,580`);
    console.log("");
  } catch (err) {
    console.log(`(verify skipped: ${(err as Error).message})`);
    console.log(`Re-run the verify with:`);
    console.log(`  npx tsx --conditions=react-server --env-file=.env.local scripts/import-outstanding-xlsx.ts --verify-only`);
    console.log("");
  }

  console.log(`${"═".repeat(72)}`);
  console.log(`APPLY COMPLETE.`);
  console.log(`${"═".repeat(72)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
