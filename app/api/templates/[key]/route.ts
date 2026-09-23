import { requireTemplateAccess } from "@/lib/templates/access";
import { templateResponse } from "@/lib/templates/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/templates/[key]?level=…&periodKey=…&kind=…
 *
 * THE template download. Every "Download Template" button in the application
 * points here — Tasks, every Goals level, Weekly Goals, Projects, Accounts — so
 * there is one URL shape and one resolution rule behind all of them: the
 * administrator's replacement in Upload Master if one exists, else the built-in.
 *
 * The optional parameters only flavour the BUILT-IN (the Goals workbook is
 * pre-scoped to the level in view, the Project Plan workbook to the plan kind).
 * A replaced file is served for every variant, because the key is what an
 * administrator replaced — see the registry note in lib/templates/registry.ts.
 *
 * Access follows the module the template belongs to
 * (lib/templates/access.ts), so this door is not a way around the per-module
 * guards.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  await requireTemplateAccess(key);

  const url = new URL(request.url);
  return templateResponse(key, {
    level: url.searchParams.get("level"),
    periodKey: url.searchParams.get("periodKey"),
    kind: url.searchParams.get("kind"),
  });
}
