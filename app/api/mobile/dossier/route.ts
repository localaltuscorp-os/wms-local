import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, employees } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  dossierEnabled,
  canAccessEmployeeDossier,
  type DossierAccess,
} from "@/lib/dossier/access";
import { isDossierDocType } from "@/lib/dossier/types";
import {
  listDossierEmployees,
  getEmployeeDossier,
  listDossierByType,
  dossierTypeCounts,
} from "@/lib/queries/dossier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/dossier — the Employee Dossier, mobile twin of the web
 * `/dossier` page. Every signed-in user sees their OWN document file; admins
 * (DB isAdmin OR super-admin email) see everyone. Query modes (admin only):
 *   ?employeeId=<uuid>  → that person's full dossier (incl. archived)
 *   ?docType=<key>      → the "By type" roll-up across all employees
 *   (neither)           → the employee roster + live per-type counts
 * Reuses the exact web loaders (listDossierEmployees / getEmployeeDossier /
 * listDossierByType / dossierTypeCounts) so web and mobile never diverge. Docs
 * carry fresh signedUrl values from those loaders.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!dossierEnabled()) {
    return NextResponse.json({ error: "module-disabled" }, { status: 403, headers: MOBILE_CORS });
  }
  // `isHr` widens ONLY the onboarding form (canManageEmployeeOnboarding); this
  // route serves dossier DOCUMENTS, which stay admin-managed. Mirroring isAdmin
  // here keeps the literal honest without granting the mobile client anything
  // new — every check below still reads `canAccessEmployeeDossier`.
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const access: DossierAccess = { me, isAdmin: admin, isHr: admin };

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId");
  const docType = url.searchParams.get("docType");

  // ── Non-admins (and any explicit employeeId) → one person's dossier ──────
  if (employeeId || !access.isAdmin) {
    const targetId = employeeId ?? me.id;
    if (!canAccessEmployeeDossier(access, targetId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
    }
    const data = await getEmployeeDossier(targetId, { includeArchived: access.isAdmin });
    if (!data) {
      return NextResponse.json({ error: "not-found" }, { status: 404, headers: MOBILE_CORS });
    }
    return NextResponse.json({ mode: "employee", isAdmin: access.isAdmin, ...data }, { headers: MOBILE_CORS });
  }

  // ── Admin: "By type" roll-up ────────────────────────────────────────────
  if (docType) {
    if (!isDossierDocType(docType)) {
      return NextResponse.json({ error: "unknown-doc-type" }, { status: 400, headers: MOBILE_CORS });
    }
    const [rows, counts] = await Promise.all([listDossierByType(docType), dossierTypeCounts()]);
    return NextResponse.json({ mode: "type", isAdmin: true, docType, rows, counts }, { headers: MOBILE_CORS });
  }

  // ── Admin: roster (default) ─────────────────────────────────────────────
  const [roster, counts] = await Promise.all([listDossierEmployees(access), dossierTypeCounts()]);
  return NextResponse.json({ mode: "roster", isAdmin: true, employees: roster, counts }, { headers: MOBILE_CORS });
}

const UploadSchema = z
  .object({
    employeeId: z.string().uuid(),
    docType: z.string().refine(isDossierDocType, "Unknown document type."),
    title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date")
      .nullable()
      .optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    filePath: z.string().trim().min(1),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().max(255).nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

/**
 * POST /api/mobile/dossier — upload one document into an employee's dossier.
 * Admin-only (employees are read-only on their own file), mirroring the web
 * `uploadEmployeeDocument`. The app pre-uploads the file via
 * /api/mobile/storage/sign (which forces the `<me.id>/…` prefix), then passes
 * that path here as JSON — no multipart. Inserts the same employee_documents
 * columns the web action writes.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!dossierEnabled()) {
    return NextResponse.json({ error: "module-disabled" }, { status: 403, headers: MOBILE_CORS });
  }
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }
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

  // The object must live under the admin's own storage folder — the same guard
  // /api/mobile/storage/sign enforces on upload.
  const filePath = d.filePath.replace(/^\/+/, "");
  if (!filePath.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "filePath must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  // Confirm the target employee exists (FK would catch it; a clean message is nicer).
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, d.employeeId) });
  if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404, headers: MOBILE_CORS });

  try {
    const [row] = await db
      .insert(employeeDocuments)
      .values({
        employeeId: d.employeeId,
        docType: d.docType,
        title: d.title,
        effectiveDate: d.effectiveDate ?? null,
        storagePath: filePath,
        fileName: d.fileName.slice(0, 200),
        mimeType: d.mimeType ?? null,
        sizeBytes: d.sizeBytes ?? null,
        notes: d.notes ? d.notes.slice(0, 2000) : null,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
    return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
