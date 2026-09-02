import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** The subset of `documents` mutations need — an EXPLICIT column list (never a
 *  bare select on `documents`, whose migration-0142 goal_id/weekly_goal_id
 *  columns may be unapplied in prod and would 500 an unguarded query). */
type DocCore = {
  id: string;
  title: string;
  description: string | null;
  storagePath: string;
  uploadedById: string | null;
};

type DocGate =
  | { ok: false; res: NextResponse }
  | { ok: true; me: Employee; doc: DocCore };

/**
 * Auth + load, mirroring the web `authorizeDocumentMutation`: any signed-in
 * user, then uploader-OR-admin may mutate. Returns the doc row or a ready
 * NextResponse error.
 */
async function authorizeDocumentMutation(req: Request, id: string): Promise<DocGate> {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return { ok: false, res: NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS }) };
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, res: NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS }) };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, res: NextResponse.json({ error: "Invalid id" }, { status: 400, headers: MOBILE_CORS }) };
  }
  const [doc] = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      uploadedById: documents.uploadedById,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!doc) return { ok: false, res: NextResponse.json({ error: "Document not found" }, { status: 404, headers: MOBILE_CORS }) };
  if (!me.isAdmin && doc.uploadedById !== me.id) {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403, headers: MOBILE_CORS }) };
  }
  return { ok: true, me, doc };
}

const PatchSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title too long").optional(),
    description: z.string().nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/mobile/documents/:id — rename / re-describe a library document.
 * Uploader-or-admin only. Mirrors the web `updateDocument`; the WHERE is
 * ownership-scoped for non-admins so a concurrent transfer can't escalate.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await authorizeDocumentMutation(req, id);
  if (!gate.ok) return gate.res;
  const { me } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const fields = parsed.data;

  const patch: { title?: string; description?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) {
    patch.description = fields.description ? fields.description.trim().slice(0, 2000) : null;
  }

  await db
    .update(documents)
    .set(patch)
    .where(me.isAdmin ? eq(documents.id, id) : and(eq(documents.id, id), eq(documents.uploadedById, me.id)));
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}

/**
 * DELETE /api/mobile/documents/:id — remove a library document + its storage
 * object. Uploader-or-admin only. Mirrors the web `deleteDocument`.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await authorizeDocumentMutation(req, id);
  if (!gate.ok) return gate.res;
  const { me, doc } = gate;

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([doc.storagePath]).catch(() => {});
  await db
    .delete(documents)
    .where(me.isAdmin ? eq(documents.id, id) : and(eq(documents.id, id), eq(documents.uploadedById, me.id)));
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
