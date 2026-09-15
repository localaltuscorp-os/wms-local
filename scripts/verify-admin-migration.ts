/**
 * Confirm that migrations 0217-0220 are actually in the database.
 *
 * A read-only check, run AFTER the apply, deliberately in its own process and
 * on its own connection: the apply script reported success from inside its own
 * transaction, and a transaction can report anything it likes about state it
 * has not committed. This asks the database from outside.
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('delegated_access_grants', 'delegated_access_events',
                          'module_permissions', 'module_permission_events',
                          'employee_manager_history')
     ORDER BY 1`;
  console.log("new tables:", tables.map((r) => r.table_name).join(", ") || "(none)");

  const code = await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'outstanding_products' AND column_name = 'code'`;
  console.log("outstanding_products.code:", code.length ? "present" : "MISSING");

  const modes = await sql`SELECT name FROM outstanding_payment_modes WHERE name IN ('IGV','IJV')`;
  const ents = await sql`SELECT name FROM outstanding_entities WHERE name IN ('IGV','IJV')`;
  console.log(
    "payment mode:", modes.map((r) => r.name).join(",") || "(none)",
    "| entity:", ents.map((r) => r.name).join(",") || "(none)",
  );

  const [pm] = await sql`SELECT count(*)::int AS n FROM outstanding_payment_modes`;
  const [pr] = await sql`SELECT count(*)::int AS n FROM outstanding_products`;
  const [cd] = await sql`SELECT count(*)::int AS n FROM outstanding_products WHERE code IS NOT NULL`;
  const [mh] = await sql`SELECT count(*)::int AS n FROM employee_manager_history`;
  const [op] = await sql`SELECT count(*)::int AS n FROM employee_manager_history WHERE effective_to IS NULL`;
  console.log(`modes=${pm!.n} products=${pr!.n} (coded=${cd!.n}) manager_history=${mh!.n} (open=${op!.n})`);

  const razor = await sql`SELECT name FROM outstanding_payment_modes WHERE name = 'Razorpay'`;
  console.log("Razorpay:", razor.length ? "present" : "MISSING");

  const gp = await sql`SELECT name, code FROM outstanding_products WHERE code = 'GP'`;
  console.log("GP product:", gp.length ? `${gp[0]!.code} / ${gp[0]!.name}` : "MISSING");

  const uncoded = await sql`SELECT name FROM outstanding_products WHERE code IS NULL ORDER BY name`;
  console.log("awaiting a code:", uncoded.map((r) => r.name).join(", ") || "(none)");

  await sql.end();
}

void main();
