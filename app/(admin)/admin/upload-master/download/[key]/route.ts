import { requireAdmin } from "@/lib/auth/current";
import { templateDef } from "@/lib/templates/registry";
import { templateResponse } from "@/lib/templates/download";

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
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  await requireAdmin();

  const { key } = await params;
  if (!templateDef(key)) return new Response("Not found", { status: 404 });

  return templateResponse(key);
}
