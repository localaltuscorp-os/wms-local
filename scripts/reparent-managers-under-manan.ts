/**
 * Pin the 4 managers (Jeevan, Rohan, Ruchita, Rutvisha) under Manan so the #11
 * compulsory gates make Manan responsible for giving them tasks/goals (matches
 * "Manan = top manager; Manan gives 5 goals to each Manager + Hetesh + Siddhesh").
 * Hetesh + Siddhesh are already under Manan; Mishtie stays under Rohan.
 * Run: pnpm tsx --env-file=.env.local scripts/reparent-managers-under-manan.ts
 */
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";

const MANAN = "1fbc08ff-fa3f-47c3-bcee-3539a9c0c299";
const MANAGERS = [
  "87c9b960-3ae7-4a8e-af47-8ab4e20f35ce", // Jeevan
  "0705ae8a-888b-44df-8a8e-ca6a98c5bbba", // Rohan
  "989ef576-db34-4d23-a095-5ae06b4e2873", // Ruchita
  "86ced82f-d3db-41f4-b473-8570a5822241", // Rutvisha
];

async function main() {
  // Only set where currently NULL (don't clobber if someone already reparented).
  const res = await db
    .update(employees)
    .set({ managerId: MANAN })
    .where(and(inArray(employees.id, MANAGERS), isNull(employees.managerId)))
    .returning({ name: employees.name });
  console.log(`✓ Reparented ${res.length} manager(s) under Manan: ${res.map((r) => r.name).join(", ") || "(none — already set)"}`);

  const reports = await db.select({ name: employees.name }).from(employees).where(eq(employees.managerId, MANAN));
  console.log(`Manan's direct reports now: ${reports.map((r) => r.name).join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
