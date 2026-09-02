import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the Next.js-style env files in the same order Next does at runtime,
// so `pnpm drizzle-kit ...` picks up DATABASE_URL from .env.local without
// any extra flags.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
