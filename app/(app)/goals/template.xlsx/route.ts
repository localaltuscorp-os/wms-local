import { requireGoalsAccess } from "@/lib/goals/access";
import { resolveTemplate } from "@/lib/templates/resolve";
import { XLSX_CONTENT_TYPE } from "@/lib/templates/registry";
import { buildGoalsTemplate } from "@/lib/templates/goals";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /goals/template.xlsx?level=…&periodKey=…
 *
 * The Goals bulk-import workbook. Serves the admin's uploaded replacement if one
 * exists (Upload Master), else the built-in hand-crafted workbook decorated with
 * live master data — see lib/templates/goals.ts.
 *
 * One template serves every level (the columns are level-agnostic; the level is
 * taken from the board context at upload time). `level`/`periodKey` only flavour
 * the built-in download filename.
 */
export async function GET(request: Request): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireGoalsAccess();

  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "";
  const periodKey = url.searchParams.get("periodKey") ?? "";

  const { buffer, contentType, fileName } = await resolveTemplate("goals", async () => {
    const built = await buildGoalsTemplate({ level, periodKey });
    return { buffer: built.buffer, contentType: XLSX_CONTENT_TYPE, fileName: built.fileName };
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
