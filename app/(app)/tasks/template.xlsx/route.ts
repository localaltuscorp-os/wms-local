import { requireUser } from "@/lib/auth/current";
import { templateResponse } from "@/lib/templates/download";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /tasks/template.xlsx
 *
 * The Tasks bulk-import workbook. Kept as a stable URL because it is the address
 * the importer's own documentation, the mobile build and a few bookmarks use —
 * the bytes are resolved by the same call the generic /api/templates/[key] door
 * makes, so it can never serve a different file from Upload Master.
 */
export async function GET(request: Request): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireUser();
  return templateResponse(TEMPLATE_KEYS.tasks);
}
