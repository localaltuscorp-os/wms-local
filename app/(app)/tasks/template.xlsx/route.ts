import { requireUser } from "@/lib/auth/current";
import { templateResponse } from "@/lib/templates/download";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";

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
export async function GET(): Promise<Response> {
  await requireUser();
  return templateResponse(TEMPLATE_KEYS.tasks);
}
