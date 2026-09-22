import { requireGoalsAccess } from "@/lib/goals/access";
import { templateResponse } from "@/lib/templates/download";
import { goalLevelTemplateKey } from "@/lib/templates/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /goals/template.xlsx?level=…&periodKey=…
 *
 * The Goals bulk-import workbook. Kept as a stable URL for the cascade importer
 * and old links; the level in the query selects WHICH registry template answers,
 * so replacing the Monthly Goals template in Upload Master changes this route's
 * monthly download and nothing else.
 *
 * `level`/`periodKey` only flavour the built-in (see lib/templates/goals.ts).
 */
export async function GET(request: Request): Promise<Response> {
  await requireGoalsAccess();

  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "";
  const periodKey = url.searchParams.get("periodKey") ?? "";

  return templateResponse(goalLevelTemplateKey(level), { level, periodKey });
}
