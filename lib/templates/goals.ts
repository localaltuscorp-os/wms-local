import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listGoalLookups } from "@/lib/goals/lookups";
import { decorateGoalsTemplate } from "@/lib/goals/template-workbook";

/**
 * The Goals bulk-import workbook — the built-in template served by
 * GET /goals/template.xlsx?level=…&periodKey=… and by the Upload Master download
 * route.
 *
 * Reads the hand-crafted static workbook (public/templates/Altus-Goals-
 * Template.xlsx) and decorates its dropdowns with live master data. One template
 * serves every level (the columns are level-agnostic; the level is taken from the
 * board context at upload time). `level`/`periodKey` only flavour the download
 * filename.
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

export async function buildGoalsTemplate(
  opts: { level?: string; periodKey?: string } = {},
): Promise<{ buffer: Buffer; fileName: string }> {
  const { level = "", periodKey = "" } = opts;

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
  const fileName = `Altus-Goals-Template${levelLabel ? `-${levelLabel}` : ""}${
    periodKey ? `-${periodKey}` : ""
  }.xlsx`;

  return { buffer: Buffer.from(buffer), fileName };
}
