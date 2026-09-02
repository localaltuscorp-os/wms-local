/**
 * One-off: pin Mishtie under Rohan (manager_id), and print the manager structure
 * for the #11 gate scope (Jeevan, Rohan, Rutvisha, Ruchita, Manan, Hetesh,
 * Siddhesh, Mishtie). Run: pnpm tsx --env-file=.env.local scripts/set-mishtie-under-rohan.ts
 */
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { ilike, or, eq } from "drizzle-orm";

async function main() {
  const names = ["mishtie", "rohan", "jeevan", "rutvisha", "ruchita", "manan", "hetesh", "siddhesh"];
  const rows = await db
    .select({ id: employees.id, name: employees.name, email: employees.email, managerId: employees.managerId, isActive: employees.isActive })
    .from(employees)
    .where(or(...names.map((n) => ilike(employees.name, `%${n}%`))));

  console.log("Matched employees:");
  for (const r of rows) console.log(`  ${r.name}  id=${r.id}  manager_id=${r.managerId ?? "—"}  active=${r.isActive}`);

  const rohan = rows.find((r) => /rohan/i.test(r.name));
  const mishtie = rows.find((r) => /mishtie/i.test(r.name));
  if (!rohan) { console.error("\n✗ Could not find Rohan — aborting."); process.exit(1); }
  if (!mishtie) { console.error("\n✗ Could not find Mishtie — aborting."); process.exit(1); }

  if (mishtie.managerId === rohan.id) {
    console.log(`\n✓ Mishtie is already under Rohan (no change).`);
  } else {
    await db.update(employees).set({ managerId: rohan.id }).where(eq(employees.id, mishtie.id));
    console.log(`\n✓ Set Mishtie (${mishtie.id}) manager_id → Rohan (${rohan.id}).`);
  }

  // Print who reports to each named manager (for gate scope sanity).
  console.log("\nDirect reports per manager:");
  for (const m of rows) {
    const reports = await db.select({ name: employees.name }).from(employees).where(eq(employees.managerId, m.id));
    if (reports.length) console.log(`  ${m.name}: ${reports.map((x) => x.name).join(", ")}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
