import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SEED_ENTITIES, SEED_PAYMENT_MODES, SEED_PRODUCTS } from "@/db/enums";
import { productLabel } from "@/lib/products/label";
import { codeOf } from "../fixtures/source-code";

/**
 * PAYMENT MODES and the PRODUCT MASTER.
 *
 * Two kinds of assertion here, and both are needed:
 *
 *   · the SEED CONSTANTS in db/enums.ts, which populate an EMPTY database, and
 *   · migration 0217, which is what actually runs against the LIVE one.
 *
 * Testing only the constants would pass while production still said "IGV",
 * because nothing reseeds a populated database. So the migration's own SQL is
 * read and asserted on — it is the artefact that does the work.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "db/migrations");
const M0217 = readFileSync(join(MIGRATIONS, "0217_masters_payment_modes_and_products.sql"), "utf8");

/** The 15 accounts the brief lists under "Add". */
const REQUIRED_MODES = [
  "Razorpay",
  "Altus Kotak",
  "Unleashed Kotak",
  "KAS Kotak",
  "MJV HUF Kotak",
  "JSV HUF Kotak",
  "JSV HUF ICICI",
  "CMV G Pay",
  "MJV G Pay",
  "Pay U",
  "Jodo",
  "Parvez Kotak",
  "Dattaram Kotak",
  "Smita",
  "Sunil Kotak",
] as const;

/** The products the brief lists. "GP — Graduate Programs" is stored under its
 *  NAME, with "GP" as the code. */
const REQUIRED_PRODUCTS = [
  "BSS",
  "PS",
  "Altus Conclave",
  "PSO",
  "BSSO",
  "OS",
  "Commission",
  "Rent",
  "Billing",
  "Retainer",
  "Graduate Programs",
] as const;

describe("payment modes — IGV became IJV", () => {
  it("the seed list carries IJV and no longer carries IGV", () => {
    expect(SEED_PAYMENT_MODES).toContain("IJV");
    expect(SEED_PAYMENT_MODES).not.toContain("IGV");
  });

  it("the ENTITY was renamed too — one counterparty, one spelling", () => {
    // 0070 renamed "Cash" to "IGV" in both rosters because they are the same
    // company. Leaving the entity behind would put two spellings of it on
    // adjacent dropdowns.
    expect(SEED_ENTITIES).toContain("IJV");
    expect(SEED_ENTITIES).not.toContain("IGV");
  });

  it("the migration RENAMES the live row rather than inserting a new one", () => {
    // This is the whole of "without breaking historical records". Every
    // reference is a uuid FK, so an UPDATE carries all history with it; an
    // INSERT would strand past contracts under a name the company stopped using.
    expect(M0217).toMatch(/UPDATE outstanding_payment_modes\s+SET name = 'IJV'/);
    expect(M0217).toMatch(/UPDATE outstanding_entities\s+SET name = 'IJV'/);
    expect(M0217).toMatch(/WHERE name = 'IGV'/);
    // And it must not try to create IJV separately.
    expect(M0217).not.toMatch(/INSERT INTO outstanding_payment_modes[\s\S]{0,400}\('IJV'\)/);
  });

  it("the rename is guarded against an existing IJV row", () => {
    // Renaming into an occupied name would violate the unique index. The guard
    // skips instead, leaving two rows for an admin to merge — no FK is silently
    // repointed.
    const renames = M0217.match(/SET name = 'IJV'[\s\S]*?;/g) ?? [];
    expect(renames.length).toBe(2);
    for (const r of renames) expect(r).toMatch(/NOT EXISTS/);
  });

  it("every payment mode the brief asks for is in the seed list", () => {
    for (const m of REQUIRED_MODES) expect(SEED_PAYMENT_MODES, m).toContain(m);
  });

  it("Razorpay is present — the brief calls it out explicitly", () => {
    expect(SEED_PAYMENT_MODES).toContain("Razorpay");
    expect(M0217).toMatch(/\('Razorpay'\)/);
  });

  it("every new mode is also inserted by the migration", () => {
    for (const m of REQUIRED_MODES) {
      expect(M0217, m).toContain(`('${m}')`);
    }
  });

  it("keeps the pre-existing modes, so historical references stay valid", () => {
    // "Pay U" and "Jodo" were already seeded; the migration uses ON CONFLICT DO
    // NOTHING so they keep their ids and their sort order.
    for (const m of ["Kotak - Altus", "Barter", "PDC", "Pay U", "Jodo"]) {
      expect(SEED_PAYMENT_MODES, m).toContain(m);
    }
    expect(M0217).toMatch(/INSERT INTO outstanding_payment_modes[\s\S]*?ON CONFLICT \(name\) DO NOTHING/);
  });

  it("has no duplicate entries", () => {
    expect(new Set(SEED_PAYMENT_MODES).size).toBe(SEED_PAYMENT_MODES.length);
    expect(new Set(SEED_ENTITIES).size).toBe(SEED_ENTITIES.length);
  });
});

describe("product master — code and name are separate", () => {
  it("adds a code COLUMN rather than reusing the name", () => {
    expect(M0217).toMatch(/ALTER TABLE outstanding_products\s+ADD COLUMN IF NOT EXISTS code text/);
  });

  it("makes the code unique case-insensitively, but only where one exists", () => {
    // A plain UNIQUE would allow 'bss' beside 'BSS'; a non-partial index would
    // refuse a second un-coded product.
    expect(M0217).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS outstanding_products_code_lower_idx/);
    expect(M0217).toMatch(/ON outstanding_products \(lower\(code\)\)/);
    expect(M0217).toMatch(/WHERE code IS NOT NULL/);
  });

  it("does NOT invent a code for a product whose name is not one", () => {
    // The backfill only copies all-caps tokens. "Altus Conclave", "Commission",
    // "Rent", "Billing", "Retainer" arrive with NULL for an admin to fill in —
    // a guessed identifier in a master an accountant reads is worse than a gap.
    expect(M0217).toMatch(/name ~ '\^\[A-Z\]\[A-Z0-9\]\{1,7\}\$'/);
    expect(M0217).toMatch(/\('Altus Conclave',\s+NULL\)/);
    expect(M0217).toMatch(/\('Commission',\s+NULL\)/);
    expect(M0217).toMatch(/\('Retainer',\s+NULL\)/);
  });

  it("stores GP as code + Graduate Programs as name, exactly as the brief writes it", () => {
    expect(M0217).toMatch(/\('Graduate Programs',\s*'GP'\)/);
    expect(SEED_PRODUCTS).toContain("Graduate Programs");
  });

  it("gives the all-caps products their own name as the code", () => {
    for (const code of ["BSS", "PS", "PSO", "BSSO", "OS"]) {
      expect(M0217, code).toMatch(new RegExp(`\\('${code}',\\s*'${code}'\\)`));
    }
  });

  it("every product the brief asks for is seeded", () => {
    for (const p of REQUIRED_PRODUCTS) {
      // "Graduate Programs" is the stored name for the brief's "GP".
      expect(M0217, p).toContain(`('${p}',`);
    }
    for (const p of REQUIRED_PRODUCTS) {
      if (p === "Graduate Programs") continue;
      expect(SEED_PRODUCTS, p).toContain(p);
    }
  });

  it("keeps a product the brief does not list rather than deleting it", () => {
    // "Consulting" is referenced by existing contracts. The brief's own rule is
    // is_active = false by an admin, never a delete by a migration.
    expect(SEED_PRODUCTS).toContain("Consulting");
    expect(M0217).not.toMatch(/DELETE FROM outstanding_products/);
    expect(M0217).not.toMatch(/DROP TABLE/i);
  });

  it("inserts products idempotently, so existing ids survive", () => {
    // `outstanding_contracts.product_id` points at them; a re-seed that
    // replaced rows would break every past contract.
    expect(M0217).toMatch(/INSERT INTO outstanding_products[\s\S]*?ON CONFLICT \(name\) DO NOTHING/);
  });

  it("has no duplicate entries", () => {
    expect(new Set(SEED_PRODUCTS).size).toBe(SEED_PRODUCTS.length);
  });
});

describe("the forms product dropdown keeps its non-product options", () => {
  it("the hardcoded DEFAULT_PRODUCT_OPTIONS array is gone", () => {
    // Comments stripped: the file explains at length WHY the array was
    // deleted, and that explanation names it.
    const src = codeOf("lib/forms/field-types.ts");
    expect(src).not.toMatch(/export const DEFAULT_PRODUCT_OPTIONS/);
  });

  it("the field now reads the product master", () => {
    const src = codeOf("lib/forms/server.ts");
    expect(src).toMatch(/listActiveProductNames/);
    expect(src).not.toMatch(/DEFAULT_PRODUCT_OPTIONS/);
  });

  it("0217 seeds the options that were only in that constant", () => {
    // Otherwise deleting the constant would silently remove choices these forms
    // offer today. Note the doubled quote — it is SQL, not JS.
    for (const label of ["Collaboration", "Key Note", "Inhouse PSO", "Being Arjun", "2 Days"]) {
      expect(M0217, label).toContain(`('${label}',`);
    }
    expect(M0217).toContain("('Don''t Know',");
    expect(M0217).toMatch(/INSERT INTO product_options[\s\S]*?ON CONFLICT \(label\) DO NOTHING/);
  });
});

describe("productLabel", () => {
  it("shows the code beside the name when they differ", () => {
    expect(productLabel({ code: "GP", name: "Graduate Programs" })).toBe(
      "GP · Graduate Programs",
    );
  });

  it("does not repeat a code that IS the name", () => {
    expect(productLabel({ code: "BSS", name: "BSS" })).toBe("BSS");
  });

  it("falls back to the name when there is no code", () => {
    expect(productLabel({ code: null, name: "Altus Conclave" })).toBe("Altus Conclave");
  });
});

describe("every new migration is safe to re-apply", () => {
  // `pnpm db:migrate` applies un-ledgered files in filename order, unattended,
  // and is run casually to pick up somebody else's column. Anything not
  // idempotent breaks the second run.
  const NEW = [
    "0217_masters_payment_modes_and_products.sql",
    "0218_delegated_access.sql",
    "0219_permission_matrix.sql",
    "0220_manager_hierarchy_history.sql",
  ];

  it("all four are present and in order", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    for (const n of NEW) expect(files, n).toContain(n);
  });

  it("creates nothing without IF NOT EXISTS", () => {
    for (const name of NEW) {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8");
      const creates = sql.match(/CREATE (TABLE|UNIQUE INDEX|INDEX)[^\n]*/gi) ?? [];
      for (const c of creates) expect(c, `${name}: ${c}`).toMatch(/IF NOT EXISTS/i);
      const adds = sql.match(/ADD COLUMN[^\n]*/gi) ?? [];
      for (const a of adds) expect(a, `${name}: ${a}`).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("destroys no rows — the migration runner's destructive guard must not fire", () => {
    for (const name of NEW) {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8");
      expect(sql, name).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(sql, name).not.toMatch(/\bDROP\s+COLUMN\b/i);
      expect(sql, name).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql, name).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });

  it("carries no unresolved merge-conflict markers", () => {
    for (const name of NEW) {
      const sql = readFileSync(join(MIGRATIONS, name), "utf8");
      expect(sql, name).not.toMatch(/^<{7}|^={7}$|^>{7}/m);
    }
  });
});
