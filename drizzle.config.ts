import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the Next.js-style env files in the same order Next does at runtime,
// so `pnpm drizzle-kit ...` picks up DATABASE_URL from .env.local without
// any extra flags.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  // Two HR features own their tables beside their module rather than in the
  // shared db/schema.ts, deliberately (see the header comments in each — it
  // keeps feature work out of a permanent merge-conflict hotspot). drizzle-kit
  // still has to SEE them: with only db/schema.ts listed, `generate` reads the
  // live database, finds tables no schema file declares, and proposes DROP TABLE
  // for both. Listing them here costs nothing and keeps them where they live.
  schema: ["./db/schema.ts", "./lib/hr/exit/schema.ts", "./lib/hr/forms/schema.ts"],
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
