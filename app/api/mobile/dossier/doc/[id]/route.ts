import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { dossierEnabled } from "@/lib/dossier/access";
import { isDossierDocType } from "@/lib/dossier/types";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type DocGate =
  | { ok: false; res: NextResponse }
  | { ok: true; me: Employee; row: typeof employeeDocuments.$inferSelect };

/** Admin-or-403 gate + the loaded row, shared by PATCH and DELETE. Mirrors the
 *  web `isAdmin(me)` + `loadOwned(id)` pair in the dossier server actions. */
async function requireAdminDoc(req: Request, id: string): Promise<DocGate> {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return { ok: false, res: NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS }) };
  }
  const me = auth.employee;
  if (!dossierEnabled()) {
    return { ok: false, res: NextResponse.json({ error: "module-disabled" }, { status: 403, headers: MOBILE_CORS }) };
  }
  if (!(me.isAdmin || isSuperAdmin(me.email))) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS }) };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, res: NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS }) };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, res: NextResponse.json({ error: "Invalid id" }, { status: 400, headers: MOBILE_CORS }) };
  }
  const row = await db.query.employeeDocuments.findFirst({ where: eq(employeeDocuments.id, id) });
  if (!row) return { ok: false, res: NextResponse.json({ error: "Document not found" }, { status: 404, headers: MOBILE_CORS }) };
  return { ok: true, me, row };
}

const PatchSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title too long").optional(),
    effectiveDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    docType: z.string().optional(),
  })
  .strict();

/**
 * PATCH /api/mobile/dossier/doc/:id — admin-only metadata edit of one dossier
 * document, mirroring the web `updateEmployeeDocument`. Only supplied fields
 * are written; effectiveDate normalises to a valid "YYYY-MM-DD" or null.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await requireAdminDoc(req, id);
  if (!gate.ok) return gate.res;

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

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.effectiveDate !== undefined) {
    const e = (fields.effectiveDate ?? "").trim();
    patch.effectiveDate = e && /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : null;
  }
  if (fields.notes !== undefined) {
    patch.notes = fields.notes ? fields.notes.trim().slice(0, 2000) : null;
  }
  if (fields.docType !== undefined) {
    if (!isDossierDocType(fields.docType)) {
      return NextResponse.json({ error: "Unknown document type." }, { status: 400, headers: MOBILE_CORS });
    }
    patch.docType = fields.docType;
  }

  await db.update(employeeDocuments).set(patch).where(eq(employeeDocuments.id, id));
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}

/**
 * DELETE /api/mobile/dossier/doc/:id — admin-only. `?archive=true` soft-hides
 * the document (setEmployeeDocumentArchived); otherwise hard-deletes the row
 * and its storage object (deleteEmployeeDocument). Mirrors both web actions.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await requireAdminDoc(req, id);
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  if (url.searchParams.get("archive") === "true") {
    await db
      .update(employeeDocuments)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(employeeDocuments.id, id));
    return NextResponse.json({ ok: true, archived: true }, { headers: MOBILE_CORS });
  }

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([gate.row.storagePath]).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  return NextResponse.json({ ok: true, deleted: true }, { headers: MOBILE_CORS });
}
