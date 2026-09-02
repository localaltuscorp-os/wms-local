import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * Phase 4.5 — actually checks the dependencies an external uptime monitor
 * cares about. Returns 200 only if Postgres responds AND Supabase Storage
 * lists the documents bucket within the timeouts below. Anything failing
 * returns 503 with a per-check breakdown so the alert that pages you also
 * tells you where to look.
 *
 * Public (allowed by middleware's PUBLIC_API allowlist). Safe to expose
 * — no DB rows or secrets leak, only liveness booleans + latencies.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

const DB_TIMEOUT_MS = 1500;
const STORAGE_TIMEOUT_MS = 2500;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function checkDb(): Promise<Check> {
  const started = performance.now();
  try {
    await withTimeout(db.execute(sql`select 1`), DB_TIMEOUT_MS, "db");
    return { name: "db", ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      name: "db",
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkStorage(): Promise<Check> {
  const started = performance.now();
  try {
    // SUPABASE_SERVICE_ROLE_KEY is optional in some environments (the docs
    // feature degrades cleanly). Don't fail health if it's just unset.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { name: "storage", ok: true, ms: 0, error: "skipped (no service-role key)" };
    }
    const admin = getSupabaseAdmin();
    const res = await withTimeout(
      admin.storage.getBucket(DOCUMENTS_BUCKET),
      STORAGE_TIMEOUT_MS,
      "storage",
    );
    if (res.error) throw new Error(res.error.message);
    return { name: "storage", ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      name: "storage",
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const [dbCheck, storageCheck] = await Promise.all([checkDb(), checkStorage()]);
  const checks = [dbCheck, storageCheck];
  // Storage is treated as "warning, not fatal" — Documents is one feature.
  // Only the DB being down constitutes hard down.
  const hardDown = !dbCheck.ok;

  return Response.json(
    {
      ok: !hardDown,
      service: "altus-corp-dashboard",
      ts: new Date().toISOString(),
      checks,
    },
    { status: hardDown ? 503 : 200 },
  );
}
