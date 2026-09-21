import { requireUser } from "@/lib/auth/current";
import { resolveTemplate } from "@/lib/templates/resolve";
import { XLSX_CONTENT_TYPE } from "@/lib/templates/registry";
import { buildTasksTemplate } from "@/lib/templates/tasks";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /tasks/template.xlsx
 *
 * The enterprise Tasks bulk-import workbook. Serves the admin's uploaded
 * replacement if one exists (Upload Master), else the built-in generated from
 * lib/tasks/template-columns — see lib/templates/tasks.ts.
 */
export async function GET(request: Request): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireUser();

  const { buffer, contentType, fileName } = await resolveTemplate("tasks", async () => ({
    buffer: await buildTasksTemplate(),
    contentType: XLSX_CONTENT_TYPE,
    fileName: "Altus-Tasks-Template.xlsx",
  }));

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
