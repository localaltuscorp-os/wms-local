// Seed Manan Vasa's cascade from his sheet (Image #13) so the redesigned board
// has real, connected data: Y1 Sales · BSS 2 batches · 60 seats · ₹1.8Cr →
// quarters (÷4) → current-quarter months → a few example month cards.
// Idempotent: skips if a year goal already exists for Manan in the FY.
//   pnpm tsx --env-file=.env.local scripts/seed-manan-goals.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

// FY 2026 (Apr 2026–Mar 2027). Current quarter Q2 = Jul–Sep.
const FY = "2026";
const Q_KEYS = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];
const Q2_MONTHS = ["2026-07", "2026-08", "2026-09"];

async function insertGoal(v: {
  employeeId: string;
  period: string;
  periodKey: string;
  parentGoalId?: string | null;
  title: string;
  area?: string;
  uom?: string;
  targetQty?: number | null;
  targetAmount?: number | null;
  source: string;
  category: string;
  position: number;
  pctDone?: number;
}): Promise<string> {
  const [row] = await sql`
    insert into goals (employee_id, period, period_key, parent_goal_id, title, area, uom,
      target_qty, target_amount, source, category, position, pct_done)
    values (${v.employeeId}, ${v.period}, ${v.periodKey}, ${v.parentGoalId ?? null}, ${v.title},
      ${v.area ?? null}, ${v.uom ?? null}, ${v.targetQty ?? null}, ${v.targetAmount ?? null},
      ${v.source}, ${v.category}, ${v.position}, ${v.pctDone ?? 0})
    returning id`;
  return (row as { id: string }).id;
}

async function main() {
  const [manan] = (await sql`select id, name from employees where name ilike '%manan%' limit 1`) as unknown as {
    id: string;
    name: string;
  }[];
  if (!manan) throw new Error("Manan not found");

  const existing = await sql`select id from goals where employee_id = ${manan.id} and period = 'year' and period_key = ${FY} limit 1`;
  if (existing.length > 0) {
    console.log("Already seeded — Manan has a year goal for FY", FY, "→ skipping.");
    await sql.end();
    return;
  }

  // Y1 — the yearly goal.
  const y1 = await insertGoal({
    employeeId: manan.id, period: "year", periodKey: FY,
    title: "BSS 2 batches", area: "Sales", uom: "seats",
    targetQty: 60, targetAmount: 18000000, source: "manual", category: "target", position: 1, pctDone: 40,
  });

  // Q1–Q4 — auto-derived (÷4): 15 seats, ₹45L each.
  const quarters: string[] = [];
  for (let i = 0; i < 4; i++) {
    quarters.push(
      await insertGoal({
        employeeId: manan.id, period: "quarter", periodKey: Q_KEYS[i]!, parentGoalId: y1,
        title: "BSS 2 batches", area: "Sales", uom: "seats",
        targetQty: 15, targetAmount: 4500000, source: "cascade", category: "target", position: 1,
        pctDone: i === 0 ? 40 : i === 1 ? 33 : 0,
      }),
    );
  }
  const q2 = quarters[1]!;

  // Q2 months (Jul/Aug/Sep) — auto-derived (÷3): 5 seats, ₹15L each.
  for (let i = 0; i < 3; i++) {
    await insertGoal({
      employeeId: manan.id, period: "month", periodKey: Q2_MONTHS[i]!, parentGoalId: q2,
      title: "BSS 2 batches", area: "Sales", uom: "seats",
      targetQty: 5, targetAmount: 1500000, source: "cascade", category: "target", position: 1,
      pctDone: i === 0 ? 40 : 0,
    });
  }

  // Example manual month cards in July (matches the mockup's card variety).
  await insertGoal({ employeeId: manan.id, period: "month", periodKey: "2026-07", title: "Close 3 Enterprise Deals", area: "Sales", source: "manual", category: "milestone", position: 2, pctDone: 100 });
  await insertGoal({ employeeId: manan.id, period: "month", periodKey: "2026-07", title: "Complete Batch 1 Curriculum", area: "Delivery", source: "manual", category: "operational", position: 3, pctDone: 80 });
  await insertGoal({ employeeId: manan.id, period: "month", periodKey: "2026-08", title: "Hiring: Marketing Lead", area: "People", source: "manual", category: "operational", position: 2, pctDone: 10 });

  console.log(`Seeded Manan (${manan.id}): Y1 + 4 quarters + Q2 months + 3 example cards.`);
  await sql.end();
}
main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
