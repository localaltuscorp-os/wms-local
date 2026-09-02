// One-off iter-2 data migration for the Outstanding tracker.
//
// DEFAULT = DRY-RUN: computes and prints a full report, writes NOTHING.
// Pass `--apply` to run the transactional migration for real.
//
// Run dry-run:  tsx --env-file=.env.local scripts/migrate-outstanding-iter2.ts
// Run apply:    tsx --env-file=.env.local scripts/migrate-outstanding-iter2.ts --apply
//
// What it does (apply mode):
//   1. Seed outstanding_responsibles from SEED_RESPONSIBLES, then re-map every
//      contract/collection responsible_id (currently an employee UUID, FK
//      dropped) to a roster id, matched by normalized name. Unmatched -> null.
//   2. Products: deactivate BSU; insert Billing + Retainer (idempotent seed).
//   3. Entities: insert missing SEED_ENTITIES; deactivate active entities not in
//      the seed list; re-map contracts on "Kotak - MJV HUF" -> "MJV HUF".
//   4. Payment modes: insert missing SEED_PAYMENT_MODES; re-map old labels to
//      new ones; deactivate old-only modes.
//   5. Backfill contract first_name/last_name from client_name where null.
//   6. (apply only) add the new FK constraints on responsible_id once values
//      are roster-ids-or-null.
//   7. Reconciliation: print Σ installment balance + Σ collections.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  SEED_RESPONSIBLES,
  SEED_ENTITIES,
  SEED_PAYMENT_MODES,
} from "@/db/enums";

const APPLY = process.argv.includes("--apply");

// ── name normalization ─────────────────────────────────────────────────────
// lowercase, collapse runs of whitespace, trim, then apply known variant fixes.
function normalizeName(raw: string): string {
  let n = raw.toLowerCase().replace(/\s+/g, " ").trim();
  // variant fixes (substring so first/last forms both catch)
  n = n.replace(/siddhesh/g, "siddesh");
  n = n.replace(/dhanshree/g, "dhanashree");
  return n;
}

const INR = (n: number) =>
  "₹" +
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lakhs(n: number): string {
  return (n / 100000).toFixed(2) + "L";
}

type IdName = { id: string; name: string };

async function main() {
  console.log("=".repeat(72));
  console.log(
    `Outstanding iter-2 data migration — ${APPLY ? "APPLY (WRITES)" : "DRY-RUN (no writes)"}`,
  );
  console.log("=".repeat(72));

  // ── current roster state (read) ───────────────────────────────────────────
  const respRoster = await db.execute<IdName & { is_active: boolean }>(sql`
    SELECT id, name, is_active FROM outstanding_responsibles ORDER BY name`);
  const products = await db.execute<IdName & { is_active: boolean }>(sql`
    SELECT id, name, is_active FROM outstanding_products ORDER BY name`);
  const entities = await db.execute<IdName & { is_active: boolean }>(sql`
    SELECT id, name, is_active FROM outstanding_entities ORDER BY name`);
  const modes = await db.execute<IdName & { is_active: boolean }>(sql`
    SELECT id, name, is_active FROM outstanding_payment_modes ORDER BY name`);

  // =========================================================================
  // 1. RESPONSIBLES
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("1. RESPONSIBLES ROSTER");
  console.log("-".repeat(72));

  // Build planned roster: existing seed rows (by name) keep their id; missing
  // names would be inserted. We compute a normalized-name -> roster-name map.
  const seedByNorm = new Map<string, string>();
  for (const name of SEED_RESPONSIBLES) seedByNorm.set(normalizeName(name), name);

  const existingRespByName = new Map<string, IdName>();
  for (const r of respRoster) existingRespByName.set(r.name, { id: r.id, name: r.name });

  const seedToInsert = SEED_RESPONSIBLES.filter((n) => !existingRespByName.has(n));
  console.log(`Seed responsibles: ${SEED_RESPONSIBLES.length} canonical names.`);
  console.log(
    `  Already in roster: ${SEED_RESPONSIBLES.length - seedToInsert.length}; would INSERT: ${seedToInsert.length}`,
  );
  if (seedToInsert.length) console.log(`  Inserting: ${seedToInsert.join(", ")}`);

  // Current responsible names referenced by contracts/collections come from the
  // employees table (responsible_id still holds employee UUIDs; FK dropped, but
  // the values are intact). LEFT JOIN so dangling ids surface as NULL name.
  const contractResp = await db.execute<{
    responsible_id: string | null;
    emp_name: string | null;
    contract_count: number;
    balance: number;
  }>(sql`
    SELECT c.responsible_id,
           e.name AS emp_name,
           count(*)::int AS contract_count,
           COALESCE(SUM(ib.bal), 0)::float8 AS balance
      FROM outstanding_contracts c
      LEFT JOIN employees e ON e.id = c.responsible_id
      LEFT JOIN (
        SELECT contract_id, SUM(amount)::float8 AS bal
          FROM outstanding_installments
         GROUP BY contract_id
      ) ib ON ib.contract_id = c.id
     GROUP BY c.responsible_id, e.name`);

  const collectionResp = await db.execute<{
    responsible_id: string | null;
    emp_name: string | null;
    collection_count: number;
  }>(sql`
    SELECT col.responsible_id,
           e.name AS emp_name,
           count(*)::int AS collection_count
      FROM outstanding_collections col
      LEFT JOIN employees e ON e.id = col.responsible_id
     GROUP BY col.responsible_id, e.name`);

  // Aggregate per distinct current responsible_id.
  type RespStat = {
    responsibleId: string | null;
    empName: string | null;
    contracts: number;
    collections: number;
    balance: number;
    matchedTo: string | null;
  };
  const stats = new Map<string, RespStat>();
  const keyOf = (id: string | null) => id ?? "__NULL__";

  for (const row of contractResp) {
    const k = keyOf(row.responsible_id);
    const s = stats.get(k) ?? {
      responsibleId: row.responsible_id,
      empName: row.emp_name,
      contracts: 0,
      collections: 0,
      balance: 0,
      matchedTo: null,
    };
    s.contracts += row.contract_count;
    s.balance += Number(row.balance);
    if (row.emp_name) s.empName = row.emp_name;
    stats.set(k, s);
  }
  for (const row of collectionResp) {
    const k = keyOf(row.responsible_id);
    const s = stats.get(k) ?? {
      responsibleId: row.responsible_id,
      empName: row.emp_name,
      contracts: 0,
      collections: 0,
      balance: 0,
      matchedTo: null,
    };
    s.collections += row.collection_count;
    if (row.emp_name) s.empName = row.emp_name;
    stats.set(k, s);
  }

  // Match each to a seed roster name by normalized employee name.
  for (const s of stats.values()) {
    if (!s.empName) {
      s.matchedTo = null; // null id or dangling employee -> unassigned
      continue;
    }
    s.matchedTo = seedByNorm.get(normalizeName(s.empName)) ?? null;
  }

  const matched = [...stats.values()].filter((s) => s.matchedTo);
  const unmatched = [...stats.values()].filter((s) => !s.matchedTo);

  const matchedContracts = matched.reduce((a, s) => a + s.contracts, 0);
  const matchedCollections = matched.reduce((a, s) => a + s.collections, 0);
  const unmatchedContracts = unmatched.reduce((a, s) => a + s.contracts, 0);
  const unmatchedCollections = unmatched.reduce((a, s) => a + s.collections, 0);
  const unmatchedBalance = unmatched.reduce((a, s) => a + s.balance, 0);

  console.log(
    `\nMatched current responsibles: ${matched.length} distinct -> ${matchedContracts} contracts, ${matchedCollections} collections.`,
  );
  for (const s of matched.sort((a, b) => b.contracts - a.contracts)) {
    console.log(
      `  "${s.empName}" -> "${s.matchedTo}"  (${s.contracts} contracts, ${s.collections} collections, bal ${INR(s.balance)})`,
    );
  }

  console.log(
    `\nUNMATCHED current responsibles: ${unmatched.length} distinct -> ${unmatchedContracts} contracts, ${unmatchedCollections} collections, Σ balance ${INR(unmatchedBalance)}.`,
  );
  console.log("  (these contracts/collections become responsible_id = NULL)");
  for (const s of unmatched.sort((a, b) => b.balance - a.balance)) {
    const label =
      s.empName ??
      (s.responsibleId ? `<dangling id ${s.responsibleId}>` : "<NULL responsible_id>");
    console.log(
      `  ${label}: ${s.contracts} contracts, ${s.collections} collections, Σ balance ${INR(s.balance)}`,
    );
  }

  // =========================================================================
  // 2. PRODUCTS
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("2. PRODUCTS");
  console.log("-".repeat(72));
  const productNames = new Set(products.map((p) => p.name));
  const productByName = new Map(products.map((p) => [p.name, p]));
  const bsu = productByName.get("BSU");
  if (bsu) {
    console.log(
      `  Would DEACTIVATE "BSU" (currently is_active=${bsu.is_active}).`,
    );
  } else {
    console.log(`  "BSU" not present — nothing to deactivate.`);
  }
  for (const want of ["Billing", "Retainer"]) {
    if (productNames.has(want)) {
      console.log(`  "${want}" already present — no insert.`);
    } else {
      console.log(`  Would INSERT product "${want}".`);
    }
  }

  // =========================================================================
  // 3. ENTITIES
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("3. ENTITIES");
  console.log("-".repeat(72));
  const seedEntitySet = new Set<string>(SEED_ENTITIES);
  const entityNames = new Set(entities.map((e) => e.name));
  const entityByName = new Map(entities.map((e) => [e.name, e]));

  const entitiesToInsert = SEED_ENTITIES.filter((n) => !entityNames.has(n));
  console.log(
    `  Missing seed entities to INSERT: ${entitiesToInsert.length}` +
      (entitiesToInsert.length ? ` (${entitiesToInsert.join(", ")})` : ""),
  );
  const entitiesToDeactivate = entities.filter(
    (e) => e.is_active && !seedEntitySet.has(e.name),
  );
  console.log(
    `  Active entities NOT in seed list to DEACTIVATE: ${entitiesToDeactivate.length}` +
      (entitiesToDeactivate.length
        ? ` (${entitiesToDeactivate.map((e) => e.name).join(", ")})`
        : ""),
  );

  // re-map contracts: "Kotak - MJV HUF" entity -> "MJV HUF"
  const kotakMjv = entityByName.get("Kotak - MJV HUF");
  if (kotakMjv) {
    const mjvRows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM outstanding_contracts
       WHERE entity_id = ${kotakMjv.id}`);
    const n = mjvRows[0]?.n ?? 0;
    const target = entityByName.get("MJV HUF");
    console.log(
      `  Entity re-map: "Kotak - MJV HUF" -> "MJV HUF": ${n} contracts affected` +
        (target ? "" : " (target MJV HUF will be inserted first)") +
        ".",
    );
  } else {
    console.log(`  No "Kotak - MJV HUF" entity present — no entity re-map.`);
  }

  // =========================================================================
  // 4. PAYMENT MODES
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("4. PAYMENT MODES");
  console.log("-".repeat(72));
  const modeByName = new Map(modes.map((m) => [m.name, m]));
  const seedModeSet = new Set<string>(SEED_PAYMENT_MODES);
  const missingModes = SEED_PAYMENT_MODES.filter((n) => !modeByName.has(n));
  console.log(
    `  Missing seed modes to INSERT: ${missingModes.length}` +
      (missingModes.length ? ` (${missingModes.join(", ")})` : ""),
  );

  // planned re-maps (old label -> new label). Cash unchanged; Unknown left as-is.
  const MODE_REMAP: Record<string, string> = {
    "Altus Kotak": "Kotak - Altus",
    "CMV Gpay": "Gpay - CMV",
    "MJV HUF": "Kotak - MJV HUF",
    "Altus Corp": "Kotak - Altus",
  };
  const AMBIGUOUS = new Set(["MJV HUF", "Altus Corp", "Unknown"]);

  // count contract.expected_mode_id + collection.payment_mode_id references per mode.
  const modeUsage = await db.execute<{
    mode_id: string;
    name: string;
    contract_refs: number;
    collection_refs: number;
  }>(sql`
    SELECT m.id AS mode_id, m.name,
           COALESCE(c.n, 0)::int AS contract_refs,
           COALESCE(col.n, 0)::int AS collection_refs
      FROM outstanding_payment_modes m
      LEFT JOIN (
        SELECT expected_mode_id, count(*)::int AS n
          FROM outstanding_contracts GROUP BY expected_mode_id
      ) c ON c.expected_mode_id = m.id
      LEFT JOIN (
        SELECT payment_mode_id, count(*)::int AS n
          FROM outstanding_collections GROUP BY payment_mode_id
      ) col ON col.payment_mode_id = m.id`);
  const usageByName = new Map(modeUsage.map((u) => [u.name, u]));

  console.log("\n  Planned mode re-maps (old label -> new label):");
  for (const [oldName, newName] of Object.entries(MODE_REMAP)) {
    const u = usageByName.get(oldName);
    if (!u) {
      console.log(`    "${oldName}" -> "${newName}": old mode not present, skip.`);
      continue;
    }
    const flag = AMBIGUOUS.has(oldName) ? "  [AMBIGUOUS]" : "";
    console.log(
      `    "${oldName}" -> "${newName}": ${u.contract_refs} contract refs + ${u.collection_refs} collection refs${flag}`,
    );
  }
  // Cash unchanged
  {
    const u = usageByName.get("Cash");
    console.log(
      `    "Cash" -> "Cash" (unchanged): ${u ? `${u.contract_refs} contract refs + ${u.collection_refs} collection refs` : "not present"}`,
    );
  }
  // Unknown: leave as-is, insert if referenced
  {
    const u = usageByName.get("Unknown");
    if (u) {
      console.log(
        `    "Unknown" -> "Unknown" (LEAVE AS-IS, ensure row exists): ${u.contract_refs} contract refs + ${u.collection_refs} collection refs  [AMBIGUOUS]`,
      );
    } else {
      console.log(
        `    "Unknown": no existing mode row. Will INSERT "Unknown" only if referenced (currently 0 refs).  [AMBIGUOUS]`,
      );
    }
  }

  console.log("\n  AMBIGUOUS mode mappings flagged for review:");
  console.log(`    - "MJV HUF" -> "Kotak - MJV HUF" (assuming Kotak bank account).`);
  console.log(`    - "Altus Corp" -> "Kotak - Altus" (assuming Altus Kotak account).`);
  console.log(`    - "Unknown" -> left as-is (no confident target).`);

  // old-only modes (referenced/active modes not in seed and not the Unknown keep)
  const oldOnly = modes.filter(
    (m) =>
      m.is_active &&
      !seedModeSet.has(m.name) &&
      m.name !== "Unknown",
  );
  console.log(
    `\n  Active modes NOT in seed list to DEACTIVATE (after remap): ${oldOnly.length}` +
      (oldOnly.length ? ` (${oldOnly.map((m) => m.name).join(", ")})` : ""),
  );

  // =========================================================================
  // 5. FIRST/LAST BACKFILL
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("5. FIRST/LAST NAME BACKFILL");
  console.log("-".repeat(72));
  const nullFirstRows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM outstanding_contracts WHERE first_name IS NULL`);
  const nullFirst = nullFirstRows[0]?.n ?? 0;
  console.log(
    `  Contracts with first_name IS NULL to backfill from client_name: ${nullFirst}`,
  );

  // =========================================================================
  // 7. RECONCILIATION (sanity anchor — labels change, amounts don't)
  // =========================================================================
  console.log("\n" + "-".repeat(72));
  console.log("RECONCILIATION (sanity anchor — amounts must not change)");
  console.log("-".repeat(72));
  const instRows = await db.execute<{ inst: number }>(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 AS inst FROM outstanding_installments`);
  const collRows = await db.execute<{ coll: number }>(sql`
    SELECT COALESCE(SUM(amount), 0)::float8 AS coll FROM outstanding_collections`);
  const inst = Number(instRows[0]?.inst ?? 0);
  const coll = Number(collRows[0]?.coll ?? 0);
  const net = inst - coll;
  console.log(
    `  Σ installment amount (gross):   ${INR(inst)}  (~${lakhs(inst)})`,
  );
  console.log(
    `  Σ collections:                  ${INR(coll)}  (~${lakhs(coll)})`,
  );
  console.log(
    `  Σ net outstanding balance:      ${INR(net)}  (~${lakhs(net)})  [gross − collections; matches ~₹97.52L anchor]`,
  );

  if (!APPLY) {
    console.log("\n" + "=".repeat(72));
    console.log("DRY-RUN complete. NOTHING was written. Re-run with --apply to migrate.");
    console.log("=".repeat(72));
    return;
  }

  // =========================================================================
  // --apply: transactional write path
  // =========================================================================
  console.log("\n" + "=".repeat(72));
  console.log("APPLYING (transactional)…");
  console.log("=".repeat(72));

  await db.transaction(async (tx) => {
    // 1. Seed responsibles roster (idempotent on unique name).
    if (seedToInsert.length) {
      const values = SEED_RESPONSIBLES.map(
        (name, i) => sql`(${name}, ${(i + 1) * 10})`,
      );
      await tx.execute(sql`
        INSERT INTO outstanding_responsibles (name, sort_order)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (name) DO NOTHING`);
    }
    // reload roster ids by name
    const roster = await tx.execute<IdName>(
      sql`SELECT id, name FROM outstanding_responsibles`,
    );
    const rosterIdByName = new Map(roster.map((r) => [r.name, r.id]));

    // Re-map responsible_id on contracts + collections.
    // Build: current employee-id -> roster-id (or null). Match by normalized name.
    const emps = await tx.execute<IdName>(sql`SELECT id, name FROM employees`);
    const empIdToRoster = new Map<string, string | null>();
    for (const e of emps) {
      const seedName = seedByNorm.get(normalizeName(e.name));
      empIdToRoster.set(e.id, seedName ? rosterIdByName.get(seedName) ?? null : null);
    }

    for (const [empId, rosterId] of empIdToRoster) {
      await tx.execute(sql`
        UPDATE outstanding_contracts SET responsible_id = ${rosterId}
         WHERE responsible_id = ${empId}`);
      await tx.execute(sql`
        UPDATE outstanding_collections SET responsible_id = ${rosterId}
         WHERE responsible_id = ${empId}`);
    }
    // Any responsible_id not matching a known employee id -> NULL (safety).
    await tx.execute(sql`
      UPDATE outstanding_contracts SET responsible_id = NULL
       WHERE responsible_id IS NOT NULL
         AND responsible_id NOT IN (SELECT id FROM outstanding_responsibles)`);
    await tx.execute(sql`
      UPDATE outstanding_collections SET responsible_id = NULL
       WHERE responsible_id IS NOT NULL
         AND responsible_id NOT IN (SELECT id FROM outstanding_responsibles)`);

    // 2. Products: deactivate BSU; insert Billing + Retainer.
    await tx.execute(sql`
      UPDATE outstanding_products SET is_active = false, updated_at = now()
       WHERE name = 'BSU'`);
    for (const want of ["Billing", "Retainer"]) {
      await tx.execute(sql`
        INSERT INTO outstanding_products (name, sort_order)
        VALUES (${want}, 100) ON CONFLICT (name) DO NOTHING`);
    }

    // 3. Entities: insert missing, deactivate non-seed, re-map Kotak - MJV HUF.
    for (const name of SEED_ENTITIES) {
      await tx.execute(sql`
        INSERT INTO outstanding_entities (name, sort_order)
        VALUES (${name}, 100) ON CONFLICT (name) DO NOTHING`);
    }
    await tx.execute(sql`
      UPDATE outstanding_entities SET is_active = false, updated_at = now()
       WHERE is_active = true
         AND name NOT IN (${sql.join(SEED_ENTITIES.map((n) => sql`${n}`), sql`, `)})`);
    // re-map contracts on Kotak - MJV HUF -> MJV HUF, then deactivate handled above.
    await tx.execute(sql`
      UPDATE outstanding_contracts SET entity_id = (
        SELECT id FROM outstanding_entities WHERE name = 'MJV HUF')
       WHERE entity_id = (
        SELECT id FROM outstanding_entities WHERE name = 'Kotak - MJV HUF')`);

    // 4. Payment modes: insert missing seed, re-map old labels, deactivate old-only.
    for (const name of SEED_PAYMENT_MODES) {
      await tx.execute(sql`
        INSERT INTO outstanding_payment_modes (name, sort_order)
        VALUES (${name}, 100) ON CONFLICT (name) DO NOTHING`);
    }
    // ensure Unknown exists only if referenced
    const unknownRefs = await tx.execute<{ n: number }>(sql`
      SELECT (
        (SELECT count(*) FROM outstanding_contracts c JOIN outstanding_payment_modes m
           ON m.id = c.expected_mode_id WHERE m.name = 'Unknown') +
        (SELECT count(*) FROM outstanding_collections col JOIN outstanding_payment_modes m
           ON m.id = col.payment_mode_id WHERE m.name = 'Unknown')
      )::int AS n`);
    if ((unknownRefs[0]?.n ?? 0) > 0) {
      await tx.execute(sql`
        INSERT INTO outstanding_payment_modes (name, sort_order)
        VALUES ('Unknown', 100) ON CONFLICT (name) DO NOTHING`);
    }
    // re-map references: move refs from old mode id to new mode id, then we can
    // deactivate old-only modes. Done per pair.
    for (const [oldName, newName] of Object.entries(MODE_REMAP)) {
      await tx.execute(sql`
        UPDATE outstanding_contracts SET expected_mode_id = (
          SELECT id FROM outstanding_payment_modes WHERE name = ${newName})
         WHERE expected_mode_id = (
          SELECT id FROM outstanding_payment_modes WHERE name = ${oldName})`);
      await tx.execute(sql`
        UPDATE outstanding_collections SET payment_mode_id = (
          SELECT id FROM outstanding_payment_modes WHERE name = ${newName})
         WHERE payment_mode_id = (
          SELECT id FROM outstanding_payment_modes WHERE name = ${oldName})`);
    }
    // deactivate active modes not in seed (except Unknown which we leave as-is).
    await tx.execute(sql`
      UPDATE outstanding_payment_modes SET is_active = false, updated_at = now()
       WHERE is_active = true
         AND name <> 'Unknown'
         AND name NOT IN (${sql.join(SEED_PAYMENT_MODES.map((n) => sql`${n}`), sql`, `)})`);

    // 5. first/last backfill from client_name.
    await tx.execute(sql`
      UPDATE outstanding_contracts
         SET first_name = split_part(trim(client_name), ' ', 1),
             last_name  = NULLIF(
               trim(substring(trim(client_name) FROM position(' ' IN trim(client_name)) + 1)),
               trim(client_name)
             )
       WHERE first_name IS NULL`);

    // 6. add the new FK constraints now that responsible_id is roster-ids-or-null.
    await tx.execute(sql`
      ALTER TABLE outstanding_contracts
        ADD CONSTRAINT outstanding_contracts_responsible_id_fkey
        FOREIGN KEY (responsible_id) REFERENCES outstanding_responsibles(id)
        ON DELETE SET NULL`);
    await tx.execute(sql`
      ALTER TABLE outstanding_collections
        ADD CONSTRAINT outstanding_collections_responsible_id_fkey
        FOREIGN KEY (responsible_id) REFERENCES outstanding_responsibles(id)
        ON DELETE SET NULL`);
  });

  console.log("APPLY complete. Re-run dry-run to confirm reconciliation totals unchanged.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ migration failed:", err);
    process.exit(1);
  });
