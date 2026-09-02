/**
 * READ-ONLY diagnostic for the "Dashboard is taking longer than usual" panel.
 *
 * That panel is not a timeout: app/(app)/dashboard/page.tsx renders it only
 * when one of the three CORE reads REJECTS. This runs those same three reads
 * directly, in the same order, and prints which one fails and why — the error
 * that would otherwise only exist in a server log as
 * "[dashboard] core load failed:".
 *
 * Executes SELECTs only. Nothing here writes, seeds or migrates.
 */
import { listEmployees } from "@/lib/queries/employees";
import { loadDashboardDataUncached } from "@/lib/queries/dashboard";
import { db } from "@/lib/db";
import { statusSettings } from "@/db/schema";
import { mergeStatusDisplay } from "@/lib/queries/status-display-merge";
import { parseFilters } from "@/lib/filters";

function report(name: string, err: unknown) {
  console.error(`\n✗ ${name} FAILED`);
  if (err instanceof Error) {
    console.error(`  ${err.name}: ${err.message}`);
    // Postgres driver errors carry these; they name the missing relation or
    // column outright, which is the whole point of running this.
    for (const k of ["code", "detail", "hint", "position", "routine", "table", "column"]) {
      const v = (err as unknown as Record<string, unknown>)[k];
      if (v != null) console.error(`  ${k}: ${String(v)}`);
    }
    if (err.cause) console.error(`  cause: ${String(err.cause)}`);
    console.error(err.stack?.split("\n").slice(0, 6).join("\n"));
  } else {
    console.error(`  ${String(err)}`);
  }
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`✓ ${name} — ${Date.now() - t0}ms`);
    return out;
  } catch (err) {
    console.log(`  (${Date.now() - t0}ms elapsed before failure)`);
    report(name, err);
    return null;
  }
}

async function main() {
  // The unfiltered default the dashboard loads with on first visit.
  const filters = parseFilters({});
  console.log("filters:", JSON.stringify(filters));

  const employees = await timed("listEmployees()", () => listEmployees());
  // Both of these are wrapped in unstable_cache in the app, which needs a Next
  // request context. Called uncached here so the DB error surfaces instead of
  // Next's "incrementalCache missing" invariant.
  const status = await timed("statusSettings query", async () =>
    mergeStatusDisplay(
      await db
        .select({
          status: statusSettings.status,
          label: statusSettings.label,
          colorToken: statusSettings.colorToken,
        })
        .from(statusSettings),
    ),
  );
  const data = await timed("loadDashboardDataUncached(filters)", () =>
    loadDashboardDataUncached(filters),
  );

  console.log("\n── summary ──");
  console.log("employees:", employees ? `${employees.length} rows` : "FAILED");
  console.log("statusDisplay:", status ? "ok" : "FAILED");
  console.log("dashboardData:", data ? "ok" : "FAILED");
  if (data) {
    const k = data.kpis?.total;
    console.log(
      "kpis.total keys:",
      k ? Object.keys(k).join(", ") : "MISSING",
    );
    console.log("has wmsSummaryByKpi:", Boolean(data.wmsSummaryByKpi));
  }
  process.exit(data && employees && status ? 0 : 1);
}

void main();
