import postgres from "postgres";

/**
 * INCENTIVE MASTER — verify migration 0232 against the REAL database.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/verify-incentive-master.ts
 *
 * ── IT LEAVES THE DATABASE EXACTLY AS IT FOUND IT ──────────────────────────
 * The shape checks are pure reads of the catalogs. The behaviour checks have to
 * attempt writes — a constraint that is never exercised is a constraint nobody
 * has confirmed works — so each one runs inside a transaction that is
 * deliberately rolled back by throwing a sentinel after the probe. Nothing is
 * committed, including the probe incentive created for the cascade test.
 *
 * What it proves, beyond "the columns exist":
 *   · the CHECK constraints refuse a bad duration, an unknown incentive type
 *     and a removal dated before the grant it ends;
 *   · the partial unique index allows a removal followed by a RE-GRANT (so the
 *     history keeps both rows) while refusing two live grants at once;
 *   · deleting an incentive cascades to its eligibility and touches no request.
 */
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}${extra ? " · " + extra : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? " · " + extra : ""}`);
  }
};

const ROLLBACK = "__rollback_after_success__";

async function main() {

  const cols = await sql`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_name = 'incentive_catalog'
    order by ordinal_position`;
  const byName = new Map(cols.map((c) => [c.column_name as string, c]));

  console.log("\n== incentive_catalog · new columns ==");
  ok(
    "incentive_type text nullable",
    byName.get("incentive_type")?.data_type === "text" && byName.get("incentive_type")?.is_nullable === "YES",
  );
  ok(
    "product_id uuid nullable",
    byName.get("product_id")?.data_type === "uuid" && byName.get("product_id")?.is_nullable === "YES",
  );
  ok(
    "duration not null, defaults to permanent",
    byName.get("duration")?.is_nullable === "NO" && String(byName.get("duration")?.column_default).includes("permanent"),
  );
  ok(
    "valid_until date nullable",
    byName.get("valid_until")?.data_type === "date" && byName.get("valid_until")?.is_nullable === "YES",
  );

  console.log("\n== incentive_catalog · nothing was dropped ==");
  for (const c of [
    "id",
    "name",
    "description",
    "amount",
    "sales_eligible",
    "interns_eligible",
    "notes",
    "sort_order",
    "active",
    "created_at",
  ]) {
    ok(`kept ${c}`, byName.has(c));
  }

  console.log("\n== incentive_eligibility ==");
  const ec = await sql`
    select column_name, data_type, is_nullable
    from information_schema.columns where table_name = 'incentive_eligibility'`;
  const e = new Map(ec.map((c) => [c.column_name as string, c]));
  for (const c of [
    "id",
    "catalog_id",
    "employee_id",
    "effective_from",
    "removed_effective_from",
    "added_by_id",
    "removed_by_id",
    "created_at",
    "updated_at",
  ]) {
    ok(`column ${c}`, e.has(c));
  }
  ok("effective_from is NOT NULL", e.get("effective_from")?.is_nullable === "NO");
  ok("removed_effective_from is nullable", e.get("removed_effective_from")?.is_nullable === "YES");

  const idx = await sql`select indexname, indexdef from pg_indexes where tablename = 'incentive_eligibility'`;
  const defs = idx.map((i) => i.indexdef as string).join("\n");
  ok(
    "partial unique index — one LIVE grant per person per incentive",
    /UNIQUE INDEX incentive_eligibility_current_uq[\s\S]*catalog_id, employee_id[\s\S]*WHERE \(removed_effective_from IS NULL\)/.test(
      defs,
    ),
  );
  ok("catalog lookup index", /incentive_eligibility_catalog_idx/.test(defs));
  ok("employee lookup index", /incentive_eligibility_employee_idx/.test(defs));

  const chk = await sql`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = 'incentive_eligibility'::regclass`;
  const cd = chk.map((c) => `${c.conname} ${c.def}`).join("\n");
  ok("window check present", /incentive_eligibility_window_chk/.test(cd));
  ok("removed-by check present", /incentive_eligibility_removed_chk/.test(cd));
  ok("catalog FK cascades", /catalog_id[\s\S]*REFERENCES incentive_catalog\(id\) ON DELETE CASCADE/.test(cd));
  ok("employee FK cascades", /employee_id[\s\S]*REFERENCES employees\(id\) ON DELETE CASCADE/.test(cd));

  console.log("\n== incentive_catalog · constraints ==");
  const cat = await sql`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = 'incentive_catalog'::regclass`;
  const catd = cat.map((c) => `${c.conname} ${c.def}`).join("\n");
  ok("duration check", /incentive_catalog_duration_chk/.test(catd));
  ok("incentive_type check names the five real types", /incentive_catalog_type_chk/.test(catd) && /bss_conversion/.test(catd));
  ok("product FK sets null", /product_id[\s\S]*REFERENCES outstanding_products\(id\) ON DELETE SET NULL/.test(catd));

  console.log("\n== incentive_catalog_events ==");
  const ev = await sql`
    select column_name from information_schema.columns
    where table_name = 'incentive_catalog_events' and column_name = 'effective_date'`;
  ok("effective_date added", ev.length === 1);

  console.log("\n== live data is intact ==");
  const [n] = await sql`select count(*)::int as n from incentive_catalog`;
  console.log(`  incentive_catalog rows: ${n!.n}`);
  const [bad] = await sql`select count(*)::int as n from incentive_catalog where duration is null`;
  ok("every existing row got a duration", bad!.n === 0);
  const [named] = await sql`select count(*)::int as n from incentive_eligibility`;
  ok("the migration invented no eligibility", named!.n === 0, `rows=${named!.n}`);
  const [reqs] = await sql`select count(*)::int as n from incentive_requests`;
  const [entries] = await sql`select count(*)::int as n from incentive_entries`;
  console.log(`  history untouched: incentive_requests=${reqs!.n}, incentive_entries=${entries!.n}`);

  console.log("\n== the constraints actually refuse bad data ==");
  const [cid] = await sql`select id from incentive_catalog limit 1`;
  const [eid] = await sql`select id from employees limit 1`;

  type Probe = (t: postgres.TransactionSql) => Promise<unknown>;

  async function refuses(label: string, fn: Probe) {
    try {
      await sql.begin(async (t) => {
        await fn(t);
        throw new Error(ROLLBACK);
      });
      ok(label, false, "the database ACCEPTED it");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === ROLLBACK) ok(label, false, "the database ACCEPTED it");
      else ok(label, true, String((err as { code?: string }).code ?? msg).slice(0, 40));
    }
  }

  async function allows(label: string, fn: Probe) {
    try {
      await sql.begin(async (t) => {
        await fn(t);
        throw new Error(ROLLBACK);
      });
      ok(label, false, "unexpectedly committed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === ROLLBACK) ok(label, true);
      else ok(label, false, String((err as { code?: string }).code ?? msg).slice(0, 60));
    }
  }

  if (cid && eid) {
    await refuses("refuses an invalid duration", (t) =>
      t`update incentive_catalog set duration = 'weekly' where id = ${cid.id}`);
    await refuses("refuses an unknown incentive_type", (t) =>
      t`update incentive_catalog set incentive_type = 'made_up' where id = ${cid.id}`);
    await refuses("refuses a removal dated before its grant", (t) =>
      t`insert into incentive_eligibility (catalog_id, employee_id, effective_from, removed_effective_from, removed_by_id)
        values (${cid.id}, ${eid.id}, '2026-09-10', '2026-09-01', ${eid.id})`);
    await refuses("refuses two LIVE grants for the same person", (t) =>
      t`insert into incentive_eligibility (catalog_id, employee_id, effective_from)
        values (${cid.id}, ${eid.id}, '2026-09-01'), (${cid.id}, ${eid.id}, '2026-09-02')`);
    await refuses("refuses a grant for an incentive that does not exist", (t) =>
      t`insert into incentive_eligibility (catalog_id, employee_id, effective_from)
        values ('00000000-0000-0000-0000-000000000000', ${eid.id}, '2026-09-01')`);

    await allows("allows a re-grant after a removal — history keeps BOTH rows", async (t) => {
      await t`insert into incentive_eligibility (catalog_id, employee_id, effective_from, removed_effective_from, removed_by_id)
        values (${cid.id}, ${eid.id}, '2026-01-01', '2026-06-01', ${eid.id})`;
      await t`insert into incentive_eligibility (catalog_id, employee_id, effective_from)
        values (${cid.id}, ${eid.id}, '2026-07-01')`;
    });
    await allows("allows a removal on the same day as the grant", (t) =>
      t`insert into incentive_eligibility (catalog_id, employee_id, effective_from, removed_effective_from, removed_by_id)
        values (${cid.id}, ${eid.id}, '2026-09-01', '2026-09-01', ${eid.id})`);
    await allows("allows a null incentive_type and a null product", (t) =>
      t`update incentive_catalog set incentive_type = null, product_id = null, valid_until = null where id = ${cid.id}`);

    console.log("\n== deleting an incentive takes its eligibility and NOTHING else ==");
    await allows("cascade removes only the eligibility rows", async (t) => {
      const [row] = await t`insert into incentive_catalog (name, amount) values ('__probe_0232__', 1) returning id`;
      await t`insert into incentive_eligibility (catalog_id, employee_id, effective_from)
        values (${row!.id}, ${eid.id}, '2026-09-01')`;
      const [before] = await t`select count(*)::int as n from incentive_requests`;
      await t`delete from incentive_catalog where id = ${row!.id}`;
      const [gone] = await t`select count(*)::int as n from incentive_eligibility where catalog_id = ${row!.id}`;
      const [after] = await t`select count(*)::int as n from incentive_requests`;
      if (gone!.n !== 0) throw new Error(`eligibility survived the delete: ${gone!.n}`);
      if (before!.n !== after!.n) throw new Error("deleting an incentive changed incentive_requests");
    });
  } else {
    console.log("  (skipped — no catalog row or employee to probe with)");
  }

  console.log(`\n=== PASS: ${pass} · FAIL: ${fail} · ${fail === 0 ? "ALL PASS" : "FAILURES"} ===`);
  await sql.end();
  process.exit(fail === 0 ? 0 : 1);

}

void main();
