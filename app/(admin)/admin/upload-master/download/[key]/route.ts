import { requireAdmin } from "@/lib/auth/current";
import { templateDef } from "@/lib/templates/registry";
import { templateResponse } from "@/lib/templates/download";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /admin/upload-master/download/[key]
 *
 * Upload Master's own download door onto a template. Serves the uploaded
 * replacement if one exists, else the built-in — WITHOUT the module access the
 * per-flow routes impose, because the administrator managing the file is not
 * necessarily a member of the Goals/Accounts/Projects room.
 *
 * A parameterised built-in (Goals by level, Projects by kind) is served at its
 * DEFAULT variant here: the administrator is inspecting the file, and the
 * modules' own buttons are where a level-scoped download belongs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireAdmin();

  const { key } = await params;
  if (!templateDef(key)) return new Response("Not found", { status: 404 });

  return templateResponse(key);
}
