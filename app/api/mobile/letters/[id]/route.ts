import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { LETTER_DOCTYPE_PREFIX } from "@/lib/hr/letter-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

async function inHrRoom(me: Employee): Promise<boolean> {
  return canAccessWorkspace("hr", await accessFor(me));
}

/**
 * DELETE /api/mobile/letters/[id] — remove a letter (admin only), the mobile
 * twin of the web `deleteLetter`. Guarded to the letter docType space (prefix
 * `letter_`) so it can never remove a dossier (non-letter) document, then
 * removes the storage object and deletes the row.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!hrSupportEnabled() || !(await inHrRoom(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }
  if (!isAdmin(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: MOBILE_CORS });
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400, headers: MOBILE_CORS });
  }

  const [row] = await db
    .select({ id: employeeDocuments.id, docType: employeeDocuments.docType, storagePath: employeeDocuments.storagePath })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Letter not found" }, { status: 404, headers: MOBILE_CORS });
  if (!row.docType.startsWith(LETTER_DOCTYPE_PREFIX)) {
    return NextResponse.json({ error: "Not a letter." }, { status: 403, headers: MOBILE_CORS });
  }

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  return NextResponse.json({ ok: true }, { headers: MOBILE_CORS });
}
