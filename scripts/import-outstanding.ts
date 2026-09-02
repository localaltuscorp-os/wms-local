#!/usr/bin/env tsx
/**
 * One-time importer for the legacy Outstanding Tracker (Google Sheets) data
 * into the native model.  Each Outstanding-sheet row is a dated installment;
 * rows group into contracts; Collection-sheet rows are payments.
 *
 *   tsx --env-file=.env.local scripts/import-outstanding.ts <outstanding.csv> <collection.csv>            # DRY RUN
 *   tsx --env-file=.env.local scripts/import-outstanding.ts <outstanding.csv> <collection.csv> --apply    # WRITE
 *
 * DRY RUN (default) parses + maps + prints a summary (contract / installment /
 * collection counts + total outstanding balance + total collected) so the
 * user can reconcile to the source dashboard (₹97.48L / ₹19.61L) WITHOUT
 * writing.  Only --apply inserts (in one transaction): contracts, their
 * installments (verbatim from the mapping, isOverride=false), and collections.
 *
 * Roster resolution: product / entity / payment-mode rows are looked up
 * case-insensitively and CREATED if missing (the import is self-sufficient).
 * `responsible` employees are matched case-insensitively by name; UNMATCHED
 * names are reported and left null (we never guess a person).
 *
 * Idempotent-ish: a contract is skipped if one with the same
 * (clientName, product, startDate) already exists.  Collections are skipped
 * if an identical (clientName, amount, collectedAt) row already exists.
 * Intended to run once on a clean table; re-runs only add what's missing.
 *
 * Header tolerance: CSV column names vary, so each row is normalised through
 * a small alias map before mapping (see pickOutstanding / pickCollection).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
} from "@/db/schema";
import {
  mapOutstandingRows,
  mapCollectionRows,
  type RawOutstandingRow,
  type RawCollectionRow,
  type ContractImportSpec,
  type CollectionImportSpec,
} from "@/lib/outstanding/import-map";

const APPLY = process.argv.includes("--apply");
const positionals = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [outstandingPath, collectionPath] = positionals;

// ── CSV → loose records ─────────────────────────────────────────────────
function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(resolve(path), "utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/** Find the first present value among candidate header names (case-insensitive). */
function pick(row: Record<string, string>, ...names: string[]): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function pickOutstanding(row: Record<string, string>): RawOutstandingRow {
  return {
    clientName: pick(row, "clientName", "client name", "client", "party", "name"),
    product: pick(row, "product", "service", "product/service"),
    cycle: pick(row, "cycle", "type", "billing", "frequency"),
    entity: pick(row, "entity", "company", "billed by", "billing entity"),
    responsible: pick(row, "responsible", "owner", "assigned to", "rm", "person"),
    dueDate: pick(row, "dueDate", "due date", "due", "date", "month"),
    amount: pick(row, "amount", "value", "outstanding", "expected", "installment", "instalment"),
    pdcReceived: pick(row, "pdcReceived", "pdc received", "pdc", "pdc?"),
  };
}

function pickCollection(row: Record<string, string>): RawCollectionRow {
  return {
    clientName: pick(row, "clientName", "client name", "client", "party", "name"),
    amount: pick(row, "amount", "value", "collected", "received", "payment"),
    paymentMode: pick(row, "paymentMode", "payment mode", "mode", "method", "received in"),
    responsible: pick(row, "responsible", "owner", "collected by", "rm", "person"),
    collectedAt: pick(row, "collectedAt", "collected at", "date", "collection date", "received on"),
    comments: pick(row, "comments", "remarks", "notes", "comment"),
  };
}

// ── Roster resolution ───────────────────────────────────────────────────
type RosterTable = typeof outstandingProducts | typeof outstandingEntitiesTbl | typeof outstandingPaymentModes;

/**
 * Resolve a roster name → id (case-insensitive).  On --apply, CREATE the row
 * if absent so the import is self-sufficient.  In dry-run, just report what
 * would be created.  A null/blank name resolves to null (no roster link).
 */
async function resolveRoster(
  table: RosterTable,
  label: string,
  name: string | null,
  createdSet: Set<string>,
): Promise<string | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${trimmed})`)
    .limit(1);
  if (existing) return existing.id;
  createdSet.add(`${label}: ${trimmed}`);
  if (!APPLY) return null;
  const [ins] = await db
    .insert(table)
    .values({ name: trimmed })
    .onConflictDoNothing()
    .returning({ id: table.id });
  if (ins) return ins.id;
  // Lost a race / conflict — re-read.
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = lower(${trimmed})`)
    .limit(1);
  return row?.id ?? null;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function lakhs(n: number): string {
  return (n / 100000).toFixed(2) + "L";
}

async function main() {
  if (!outstandingPath || !collectionPath) {
    console.error(
      "Usage: tsx --env-file=.env.local scripts/import-outstanding.ts <outstanding.csv> <collection.csv> [--apply]",
    );
    process.exit(1);
  }

  console.log(`\n${"═".repeat(68)}`);
  console.log(`Outstanding import  [${APPLY ? "APPLY (writing to DB)" : "DRY RUN (no writes)"}]`);
  console.log(`${"═".repeat(68)}\n`);

  // 1. Parse + map (pure).
  const outRows = readCsv(outstandingPath).map(pickOutstanding);
  const colRows = readCsv(collectionPath).map(pickCollection);
  const { contracts } = mapOutstandingRows(outRows);
  const collections = mapCollectionRows(colRows);

  // 2. Derived totals for reconciliation.
  const totalInstallments = contracts.reduce((s, c) => s + c.installments.length, 0);
  const totalScheduled = contracts.reduce(
    (s, c) => s + c.installments.reduce((a, i) => a + i.amount, 0),
    0,
  );
  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);
  const totalOutstanding = totalScheduled - totalCollected;

  console.log(`Parsed ${outRows.length} outstanding rows → ${contracts.length} contracts, ${totalInstallments} installments`);
  console.log(`Parsed ${colRows.length} collection rows  → ${collections.length} collections\n`);
  console.log(`Total scheduled (installments): ${inr(totalScheduled)}  (${lakhs(totalScheduled)})`);
  console.log(`Total collected:                ${inr(totalCollected)}  (${lakhs(totalCollected)})`);
  console.log(`Derived outstanding balance:    ${inr(totalOutstanding)}  (${lakhs(totalOutstanding)})`);
  console.log(`  (reconcile against the source dashboard: ~₹97.48L outstanding / ~₹19.61L collected)\n`);

  // 3. Resolve roster + responsible names.
  const createdRoster = new Set<string>();
  const unmatchedResponsible = new Set<string>();

  // Employee name → id (case-insensitive).
  const empRows = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const empByName = new Map(empRows.map((e) => [e.name.trim().toLowerCase(), e.id]));
  function resolveResponsible(name: string | null): string | null {
    const t = (name ?? "").trim();
    if (!t) return null;
    const id = empByName.get(t.toLowerCase());
    if (!id) {
      unmatchedResponsible.add(t);
      return null;
    }
    return id;
  }

  // Pre-resolve every distinct roster value (and report dry-run creates).
  const productId = new Map<string, string | null>();
  const entityId = new Map<string, string | null>();
  const modeId = new Map<string, string | null>();
  for (const c of contracts) {
    if (c.product && !productId.has(c.product.toLowerCase()))
      productId.set(c.product.toLowerCase(), await resolveRoster(outstandingProducts, "product", c.product, createdRoster));
    if (c.entity && !entityId.has(c.entity.toLowerCase()))
      entityId.set(c.entity.toLowerCase(), await resolveRoster(outstandingEntitiesTbl, "entity", c.entity, createdRoster));
    resolveResponsible(c.responsible);
  }
  for (const col of collections) {
    if (col.paymentMode && !modeId.has(col.paymentMode.toLowerCase()))
      modeId.set(col.paymentMode.toLowerCase(), await resolveRoster(outstandingPaymentModes, "payment_mode", col.paymentMode, createdRoster));
    resolveResponsible(col.responsible);
  }

  if (createdRoster.size) {
    console.log(`Roster rows ${APPLY ? "created" : "to create"} (${createdRoster.size}):`);
    for (const r of [...createdRoster].sort()) console.log(`    + ${r}`);
    console.log("");
  }
  if (unmatchedResponsible.size) {
    console.log(`⚠ UNMATCHED responsible names (${unmatchedResponsible.size}) — left NULL, not guessed:`);
    for (const n of [...unmatchedResponsible].sort()) console.log(`    ? ${n}`);
    console.log("");
  }

  // Collections with an unparseable date can't be inserted (collectedAt is NOT NULL).
  const badDateCollections = collections.filter((c) => !c.collectedAt);
  if (badDateCollections.length) {
    console.log(`⚠ ${badDateCollections.length} collection(s) have an unparseable date and will be SKIPPED.\n`);
  }

  if (!APPLY) {
    console.log("Dry run only — re-run with --apply to write.\n");
    process.exit(0);
  }

  // 4. Apply (one transaction).
  let contractsInserted = 0,
    contractsSkipped = 0,
    installmentsInserted = 0,
    collectionsInserted = 0,
    collectionsSkipped = 0;

  await db.transaction(async (tx) => {
    for (const c of contracts) {
      const startDate = c.startDate;
      // Idempotency: skip if an equivalent contract already exists.
      const [dup] = await tx
        .select({ id: outstandingContracts.id })
        .from(outstandingContracts)
        .where(
          and(
            sql`lower(${outstandingContracts.clientName}) = lower(${c.clientName})`,
            eq(outstandingContracts.startDate, startDate),
            c.product
              ? sql`${outstandingContracts.productId} = ${productId.get(c.product.toLowerCase()) ?? null}`
              : sql`${outstandingContracts.productId} is null`,
          ),
        )
        .limit(1);
      if (dup) {
        contractsSkipped++;
        continue;
      }

      const [insertedContract] = await tx
        .insert(outstandingContracts)
        .values({
          clientName: c.clientName,
          productId: c.product ? productId.get(c.product.toLowerCase()) ?? null : null,
          entityId: c.entity ? entityId.get(c.entity.toLowerCase()) ?? null : null,
          responsibleId: resolveResponsible(c.responsible),
          cycle: c.cycle,
          baseAmount: String(c.baseAmount),
          gstRate: c.gstRate,
          startDate,
          pdcReceived: c.pdcReceived,
          status: "active",
        })
        .returning({ id: outstandingContracts.id });
      const contractId = insertedContract!.id;
      contractsInserted++;

      // Installments inserted VERBATIM from the mapping (isOverride=false).
      let periodIndex = 0;
      for (const inst of c.installments) {
        await tx.insert(outstandingInstallments).values({
          contractId,
          periodIndex: periodIndex++,
          dueDate: inst.dueDate,
          amount: String(inst.amount),
          isOverride: false,
        });
        installmentsInserted++;
      }
    }

    for (const col of collections) {
      if (!col.collectedAt) {
        collectionsSkipped++;
        continue;
      }
      const [dup] = await tx
        .select({ id: outstandingCollections.id })
        .from(outstandingCollections)
        .where(
          and(
            sql`lower(${outstandingCollections.clientName}) = lower(${col.clientName})`,
            eq(outstandingCollections.amount, String(col.amount)),
            eq(outstandingCollections.collectedAt, col.collectedAt),
          ),
        )
        .limit(1);
      if (dup) {
        collectionsSkipped++;
        continue;
      }
      await tx.insert(outstandingCollections).values({
        clientName: col.clientName,
        amount: String(col.amount),
        paymentModeId: col.paymentMode ? modeId.get(col.paymentMode.toLowerCase()) ?? null : null,
        responsibleId: resolveResponsible(col.responsible),
        collectedAt: col.collectedAt,
        comments: col.comments,
      });
      collectionsInserted++;
    }
  });

  console.log(`${"─".repeat(68)}`);
  console.log(`Contracts inserted:     ${contractsInserted}  (skipped existing: ${contractsSkipped})`);
  console.log(`Installments inserted:  ${installmentsInserted}`);
  console.log(`Collections inserted:   ${collectionsInserted}  (skipped: ${collectionsSkipped})`);
  console.log(`${"─".repeat(68)}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
