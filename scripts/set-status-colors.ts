// Apply Manan's status colour scheme to the authoritative status_settings
// rows. Tokens resolve to CSS vars (--color-<token>) on every surface.
import { db } from "@/lib/db";
import { statusSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TaskStatus } from "@/db/enums";

const COMMIT = process.argv.includes("--commit");

const COLORS: Record<TaskStatus, string> = {
  dont_know:    "stone",   // light grey
  not_started:  "blue",    // light blue
  initiated:    "yellow",
  follow_up:    "orange",
  need_help:    "red",
  on_hold:      "slate",
  need_info:    "red",
  follow_up_1:  "orange",
  follow_up_2:  "orange",
  follow_up_3:  "orange",
  done:         "green",
  approved:     "purple",
  not_approved: "rose",    // light red
  cancelled:    "slate",   // dark grey
  transferred:  "brown",
};

// Tier-3 statuses that were never seeded into status_settings. Insert them
// so they're admin-editable + DB-authoritative (colours match the fallback).
const MISSING_SEED: { status: TaskStatus; label: string; colorToken: string; displayOrder: number }[] = [
  { status: "need_info",   label: "Need Info",   colorToken: "red",    displayOrder: 25 },
  { status: "follow_up_1", label: "Follow Up 1", colorToken: "orange", displayOrder: 42 },
  { status: "follow_up_2", label: "Follow Up 2", colorToken: "orange", displayOrder: 44 },
  { status: "follow_up_3", label: "Follow Up 3", colorToken: "orange", displayOrder: 46 },
];

async function main() {
  const rows = await db
    .select({ status: statusSettings.status, color: statusSettings.colorToken, label: statusSettings.label })
    .from(statusSettings);
  console.log(`status_settings rows: ${rows.length}\n`);
  for (const r of rows) {
    const next = COLORS[r.status];
    const change = r.color === next ? "(unchanged)" : `→ ${next}`;
    console.log(`  ${r.status.padEnd(13)} ${String(r.color).padEnd(8)} ${change}`);
    if (COMMIT && next && r.color !== next) {
      await db.update(statusSettings).set({ colorToken: next }).where(eq(statusSettings.status, r.status));
    }
  }
  // Seed any missing Tier-3 rows.
  const present = new Set(rows.map((r) => r.status));
  const toSeed = MISSING_SEED.filter((m) => !present.has(m.status));
  for (const m of toSeed) {
    console.log(`  + seed ${m.status.padEnd(13)} ${m.colorToken}  "${m.label}" (order ${m.displayOrder})`);
    if (COMMIT) {
      await db.insert(statusSettings).values(m).onConflictDoNothing();
    }
  }
  console.log(COMMIT ? "\n✓ Committed." : "\nDry run — re-run with --commit.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
