import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listDocuments } from "@/lib/queries/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/documents — the shared document library, mobile twin of the
 * web `/documents` page. Visible to every signed-in user (it's a shared
 * library, not owner-scoped). Reuses the exact web loader `listDocuments`,
 * which returns each row with a fresh short-lived signed download URL.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }

  const rows = await listDocuments();
  return NextResponse.json(
    {
      documents: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        uploadedByName: r.uploadedByName,
        createdAt: r.createdAt.toISOString(),
        url: r.url,
      })),
    },
    { headers: MOBILE_CORS },
  );
}

const UploadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
    description: z.string().trim().max(2000).nullable().optional(),
    filePath: z.string().trim().min(1),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().max(255).nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

/**
 * POST /api/mobile/documents — add a file to the shared library, mirroring the
 * web `uploadDocument` (uploader = signed-in user). The app pre-uploads the
 * file via /api/mobile/storage/sign (which forces the `<me.id>/…` prefix) and
 * passes that path here as JSON — no multipart. Inserts the same `documents`
 * columns the web action writes.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = UploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  // The object must live under the caller's own storage folder — the same guard
  // /api/mobile/storage/sign enforces on upload.
  const filePath = d.filePath.replace(/^\/+/, "");
  if (!filePath.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "filePath must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  try {
    // EXPLICIT columns only — the schema carries migration-0142 columns
    // (goal_id / weekly_goal_id) that may be unapplied in prod; a bare
    // `.returning()` on documents would 500 there.
    const [row] = await db
      .insert(documents)
      .values({
        title: d.title,
        description: d.description ?? null,
        storagePath: filePath,
        mimeType: d.mimeType ?? null,
        sizeBytes: d.sizeBytes ?? null,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
    return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
