import { requireAdmin } from "@/lib/auth/current";
import { templateDef } from "@/lib/templates/registry";
import { buildTemplate, resolveTemplate } from "@/lib/templates/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /admin/upload-master/download/[key]
 *
 * The Upload Master's own download door onto a template. Serves the uploaded
 * override if one exists, else the built-in — WITHOUT the module access the
 * per-flow routes impose, because the admin managing the file is not necessarily
 * a member of the Goals/Accounts/Tasks room.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  await requireAdmin();

  const { key } = await params;
  const def = templateDef(key);
  if (!def) return new Response("Not found", { status: 404 });

  const { buffer, contentType, fileName } = await resolveTemplate(key, async () => {
    const built = await buildTemplate(key);
    if (!built) throw new Error(`No builder for template "${key}"`);
    return built;
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
