import { NextResponse } from "next/server";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { readDummyObject } from "@/lib/storage/objects";
import { previewContentType } from "@/lib/storage/previewable";
import { requireUser } from "@/lib/auth/current";

/**
 * Serve a file that DUMMY MODE put on disk — the stand-in for a Supabase signed
 * URL, and nothing more.
 *
 * DEAD OUTSIDE DUMMY MODE. `DUMMY_MODE` is hard-false under NODE_ENV=production
 * (lib/db/dummy-dir.ts), so a production build answers 404 here no matter what
 * is set in the environment. That is the point of checking the flag rather than
 * an env var directly: this route can read any byte under the storage root, and
 * it must be impossible to switch on where real files live.
 *
 * STILL BEHIND SIGN-IN. Dummy mode auto-signs-in a seeded admin, so this costs
 * nothing in practice — but the real bucket is private and served through
 * expiring signed URLs, and a dev stand-in that hands files to anyone who knows
 * a path teaches the wrong thing about how attachments are reached.
 *
 * Path traversal is refused in `resolveDummyObjectPath`, which is the only
 * place a database string becomes a filesystem path.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!DUMMY_MODE) return new NextResponse("Not found", { status: 404 });
  await requireUser();

  const { path } = await ctx.params;
  // `/<bucket>/<key…>` — the first segment names the bucket, the rest is the
  // key exactly as `storage_path` holds it.
  const [bucket, ...rest] = path ?? [];
  if (!bucket || rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = rest.join("/");
  const body = await readDummyObject(bucket, key);
  if (!body) return new NextResponse("Not found", { status: 404 });

  /**
   * VIEW OR DOWNLOAD.
   *
   * A PDF or an image is served inline so "View" opens it in a tab, which is
   * what Supabase does in production and what makes an attachment worth
   * opening at all. Everything else is an octet-stream download.
   *
   * The type comes from `previewContentType` — our own allow-list, keyed off
   * the extension — and never from the `file.type` the upload carried, which
   * is a string the uploader chose. `?download=1` forces the download path for
   * anything, so a previewable file can still be saved deliberately.
   */
  const forceDownload = new URL(req.url).searchParams.get("download") === "1";
  const inlineType = forceDownload ? null : previewContentType(key);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": inlineType ?? "application/octet-stream",
      // Belt and braces even on the inline path: the type above is one this
      // module chose, and `nosniff` stops the browser overriding it by peeking
      // at the bytes — which is how a file served as text/plain gets treated
      // as HTML and runs script from this origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": inlineType ? "inline" : "attachment",
      "Cache-Control": "no-store",
    },
  });
}
