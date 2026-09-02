// Seed the outstanding-tracker rosters (products / entities / payment modes)
// from the canonical lists in db/enums.ts. Idempotent — `onConflictDoNothing`
// on the unique `name` preserves any admin rename/deactivation.
// Run via:  pnpm tsx --env-file=.env.local scripts/seed-outstanding-rosters.ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
} from "@/db/schema";
import { SEED_PRODUCTS, SEED_ENTITIES, SEED_PAYMENT_MODES } from "@/db/enums";

async function main() {
  await db
    .insert(outstandingProducts)
    .values(SEED_PRODUCTS.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })))
    .onConflictDoNothing({ target: outstandingProducts.name });

  await db
    .insert(outstandingEntitiesTbl)
    .values(SEED_ENTITIES.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })))
    .onConflictDoNothing({ target: outstandingEntitiesTbl.name });

  await db
    .insert(outstandingPaymentModes)
    .values(
      SEED_PAYMENT_MODES.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })),
    )
    .onConflictDoNothing({ target: outstandingPaymentModes.name });

  const [products] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outstandingProducts);
  const [entities] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outstandingEntitiesTbl);
  const [modes] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outstandingPaymentModes);

  console.log(`products=${products?.n}`);
  console.log(`entities=${entities?.n}`);
  console.log(`modes=${modes?.n}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Seed failed:", err);
    process.exit(1);
  });
