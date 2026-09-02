import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, employees, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { isLetterType, LETTER_TYPES } from "@/lib/hr/letter-types";
import { listAllLetters, listMyLetters, listActiveRoster } from "@/lib/hr/sections";
import { safeFileName, validateUpload, HR_UPLOAD_MAX_BYTES } from "@/lib/hr/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Letters are issued BY HR — admins/super-admins upload or remove them; each
 *  employee reads their own (mirrors letters/actions.ts `isAdmin`). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

async function inHrRoom(me: Employee): Promise<boolean> {
  return canAccessWorkspace("hr", await accessFor(me));
}

/**
 * GET /api/mobile/letters — the mobile twin of the web `/letters` page. An
 * employee sees only their OWN letters (`listMyLetters`); an admin sees every
 * employee's letters (`listAllLetters`) plus the active-employee roster
 * (`listActiveRoster`) + the letter-type taxonomy for the issue picker. Each row
 * carries a signed download URL (produced inside the reused loaders, so web and
 * mobile can never diverge). Owner-scoped for non-admins.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!hrSupportEnabled() || !(await inHrRoom(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const admin = isAdmin(me);
  const [letters, roster] = await Promise.all([
    admin ? listAllLetters() : listMyLetters(me.id),
    admin ? listActiveRoster() : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  return NextResponse.json(
    {
      isAdmin: admin,
      letters,
      roster,
      // Client-safe letter taxonomy for the admin issue picker (reused, not re-declared).
      letterTypes: admin ? LETTER_TYPES.map((t) => ({ key: t.key, label: t.label, hint: t.hint })) : [],
    },
    { headers: MOBILE_CORS },
  );
}

const CreateSchema = z
  .object({
    employeeId: z.string().uuid("Pick an employee."),
    letterType: z.string().refine(isLetterType, "Pick a letter type."),
    title: z.string().trim().min(1, "Give the letter a title").max(200, "Title too long"),
    effectiveDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    notes: z.string().trim().max(2000).optional(),
    // A Supabase path pre-uploaded under the caller's own folder via
    // /api/mobile/storage/sign (forces the `<me.id>/…` prefix).
    filePath: z.string().trim().min(1, "Upload a file first."),
    fileName: z.string().trim().min(1, "Missing file name.").max(200),
    mimeType: z.string().trim().max(200).optional(),
    sizeBytes: z.number().int().positive("File is empty.").max(HR_UPLOAD_MAX_BYTES, "File exceeds 25 MB."),
  })
  .strict();

/**
 * POST /api/mobile/letters — issue a letter for an employee (admin only), the
 * JSON twin of the web `uploadLetter`. The app pre-uploads the file under its OWN
 * folder (`<me.id>/…`) via /api/mobile/storage/sign, then posts the path +
 * metadata here. We validate the shape (same deny-list + size cap as the web
 * `validateUpload`) and MOVE the object to the canonical web path
 * (`hr-letters/<employeeId>/<uuid>/<name>`), then insert the row with a
 * letter-scoped docType so `listMyLetters`/`listAllLetters` return it identically.
 * Body: { employeeId, letterType, title, effectiveDate?, notes?, filePath,
 * fileName, mimeType, sizeBytes }.
 */
export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const d = parsed.data;

  // The uploaded object must live under the caller's own folder (same guard as
  // /api/mobile/storage/sign).
  const source = d.filePath.replace(/^\/+/, "");
  if (!source.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "filePath must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  // Same file-type deny-list the web enforces (size validated by the schema).
  const probe = new File(["x"], d.fileName, { type: d.mimeType ?? "" });
  const shape = validateUpload(probe);
  if (!shape.ok) return NextResponse.json({ error: shape.error }, { status: 400, headers: MOBILE_CORS });

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, d.employeeId), columns: { id: true } });
  if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404, headers: MOBILE_CORS });

  const dest = `hr-letters/${d.employeeId}/${crypto.randomUUID()}/${safeFileName(d.fileName)}`;
  const admin = getSupabaseAdmin();
  const { error: mvErr } = await admin.storage.from(DOCUMENTS_BUCKET).move(source, dest);
  if (mvErr) return NextResponse.json({ error: `Upload failed: ${mvErr.message}` }, { status: 400, headers: MOBILE_CORS });

  let inserted;
  try {
    [inserted] = await db
      .insert(employeeDocuments)
      .values({
        employeeId: d.employeeId,
        docType: d.letterType,
        title: d.title,
        effectiveDate: d.effectiveDate ?? null,
        storagePath: dest,
        fileName: d.fileName.slice(0, 200),
        mimeType: d.mimeType || null,
        sizeBytes: d.sizeBytes,
        notes: d.notes?.trim().slice(0, 2000) || null,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([dest]).catch(() => {});
    return NextResponse.json({ error: `DB: ${err instanceof Error ? err.message : String(err)}` }, { status: 500, headers: MOBILE_CORS });
  }
  if (!inserted) return NextResponse.json({ error: "Insert returned no row" }, { status: 500, headers: MOBILE_CORS });

  return NextResponse.json({ ok: true, id: inserted.id }, { headers: MOBILE_CORS });
}
