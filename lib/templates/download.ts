import "server-only";

import { templateDef } from "./registry";
import { buildTemplate, resolveTemplate, type TemplateOptions } from "./resolve";

/**
 * THE ONE DOWNLOAD, in one place.
 *
 * Every download route in the application — the generic /api/templates/[key]
 * door, the three module routes kept for bookmarks, and Upload Master's own
 * button — ends here, so they cannot serve different bytes for the same key.
 *
 * `no-store` is not politeness: the whole promise of Upload Master is that a
 * replacement is live the moment the row commits, and a cached response would
 * hand somebody yesterday's workbook until it expired.
 */
export async function templateResponse(
  key: string,
  opts: TemplateOptions = {},
): Promise<Response> {
  const def = templateDef(key);
  if (!def) return new Response("Unknown template", { status: 404 });

  const { buffer, contentType, fileName } = await resolveTemplate(key, async () => {
    const built = await buildTemplate(key, opts);
    if (!built) throw new Error(`No built-in for template "${key}"`);
    return built;
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    },
  });
}
