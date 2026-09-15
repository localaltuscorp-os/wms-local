import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listGoalLookups } from "@/lib/goals/lookups";
import { decorateGoalsTemplate } from "@/lib/goals/template-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /goals/template.xlsx?level=…&periodKey=…
 *
 * Serves the hand-crafted Altus Goals bulk-import workbook
 * (public/templates/Altus-Goals-Template.xlsx). Four sheets:
 *   1. "Goals"      — the entry grid the import reads. Header row 3:
 *                     Area · Client · Goal Title · Target Date · Measure ·
 *                     Actual · Target · Delegated · Type · Weight.
 *   2. "Examples"   — two pre-filled reference rows (never imported).
 *   3. "How to use" — column glossary.
 *   4. "Lists"      — dropdown master data.
 *
 * One template serves every level (the columns are level-agnostic; the level is
 * taken from the board context at upload time). `level`/`periodKey` only flavour
 * the download filename. The upload parser lives in app/(app)/goals/import.
 *
 * The file is force-included in this function's bundle via
 * `outputFileTracingIncludes` in next.config.ts, so the runtime readFile is safe
 * on Vercel (public/ assets are otherwise CDN-only, not on the function disk).
 */
const LEVEL_FILE_LABEL: Record<string, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

export async function GET(request: Request): Promise<Response> {
  await requireGoalsAccess();

  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "";
  const periodKey = url.searchParams.get("periodKey") ?? "";

  const [baseFile, clients, lookups, roster] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "templates", "Altus-Goals-Template.xlsx")),
    listActiveClientNames(),
    listGoalLookups(),
    db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(employees.name),
  ]);

  const buffer = await decorateGoalsTemplate(baseFile, {
    clients,
    areas: lookups.areas,
    measures: lookups.measures,
    types: lookups.types,
    roster: roster.map((r) => r.name).filter(Boolean),
  });

  const levelLabel = level
    ? LEVEL_FILE_LABEL[level] ?? level.charAt(0).toUpperCase() + level.slice(1)
    : "";
  const fname = `Altus-Goals-Template${levelLabel ? `-${levelLabel}` : ""}${
    periodKey ? `-${periodKey}` : ""
  }.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
