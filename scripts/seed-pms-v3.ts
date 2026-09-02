// Seed PMS v3: (1) persist the live config with Sir's ruling (non-manager
// Variant B; grade→block fractions already in the config defaults); (2) load the
// Constitution paragraphs (verbatim from the Google Doc) into
// pms_constitution_para with an even default weight split across scorable paras
// (admin can rebalance on the Constitution screen). Idempotent.
//   pnpm tsx --env-file=.env.local scripts/seed-pms-v3.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { DEFAULT_PMS_V3_CONFIG } from "@/lib/pms/v3/config";
import { CONSTITUTION_SEED } from "@/lib/pms/v3/constitution-data";

async function main() {
  // 1) Live config = defaults + Sir's Variant B.
  const cfg = { ...DEFAULT_PMS_V3_CONFIG, nonManagerActive: "b" as const };
  await db.execute(sql`
    insert into pms_v3_config (id, config, updated_at) values ('default', ${JSON.stringify(cfg)}::jsonb, now())
    on conflict (id) do update set config = excluded.config, updated_at = now()
  `);
  console.log(`✓ pms_v3_config set — nonManagerActive="b" (Variant B), ${cfg.gradeBands.length} grade bands, blockFractions ${cfg.gradeBands.map((b) => b.blockFraction).join("/")}`);

  // 2) Constitution paragraphs — even default weight across scorable paras.
  const existing = ((await db.execute(sql`select count(*)::int n from pms_constitution_para`)) as any)[0]?.n
    ?? ((await db.execute(sql`select count(*)::int n from pms_constitution_para`)) as any).rows?.[0]?.n ?? 0;
  if (Number(existing) > 0) {
    console.log(`⊘ pms_constitution_para already has ${existing} rows — leaving as-is (rerun after a manual clear to refresh).`);
  } else {
    const scorable = CONSTITUTION_SEED.filter((p) => !p.isHeading).length;
    const per = scorable > 0 ? Math.round((100 / scorable) * 100) / 100 : 0;
    for (const p of CONSTITUTION_SEED) {
      await db.execute(sql`
        insert into pms_constitution_para (position, is_heading, title, body, weight, active)
        values (${p.position}, ${p.isHeading}, ${p.title}, ${p.body}, ${p.isHeading ? 0 : per}, true)
      `);
    }
    console.log(`✓ seeded ${CONSTITUTION_SEED.length} constitution items (${scorable} scorable @ ~${per} weight each = 100).`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
