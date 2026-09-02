import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

// This module is evaluated at IMPORT time, and the root layout awaits
// getCurrentEmployee() -> db -> here, so every route (including the
// synthetic /_not-found) pulls it in during `next build`. A raw ZodError
// thrown here surfaces as "Failed to collect page data for /_not-found"
// with the message stripped by Next's ignore-listed frame filter. Name
// the offending variables explicitly so the build log is actionable.
if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid or missing environment variables:\n${detail}\n\n` +
      "Set these in the Vercel project (Settings -> Environment Variables) for " +
      "the environment being deployed, then redeploy. They are required at " +
      "BUILD time, not just runtime.",
  );
}

export const env = parsed.data;
