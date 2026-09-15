import "server-only";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";
import { isExternalUrl, type BroadcastAttachment } from "@/lib/ecos/labels";

/** How long a broadcast's signed media/file URLs stay good for. */
const TTL_SECONDS = 60 * 60;

/**
 * Resolve every attachment on a broadcast to something the browser can load:
 * a pasted http(s) link passes through untouched, an object in our private
 * bucket comes back as a short-lived signed URL (or a dev-only disk URL under
 * DUMMY_MODE — `createSignedObjectUrl` owns that seam).
 *
 * Best-effort per attachment: a path that cannot be signed maps to null and
 * renders as a non-clickable chip, rather than taking the whole message down.
 * Shared by the read view and the centre-screen popup so both show the same
 * image, from one implementation.
 */
export async function signAttachmentUrls(
  atts: BroadcastAttachment[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(
    atts.map(async (a) => {
      if (!a.path) return;
      if (isExternalUrl(a.path)) {
        out.set(a.path, a.path);
        return;
      }
      try {
        out.set(a.path, await createSignedObjectUrl(DOCUMENTS_BUCKET, a.path, TTL_SECONDS));
      } catch {
        out.set(a.path, null);
      }
    }),
  );
  for (const a of atts) if (a.path && !out.has(a.path)) out.set(a.path, null);
  return out;
}
