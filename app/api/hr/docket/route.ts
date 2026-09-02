import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { candidateIntake, documentInstances, documentSignatures, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getDocType } from "@/lib/hr/letters/registry";

export const dynamic = "force-dynamic";

interface DocketBody {
  candidateId?: string;
  employeeId?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function jsonError(error: string, status = 200): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /api/hr/docket — merge a person's ARCHIVED signed documents into ONE
 * downloadable PDF packet.
 *
 * Body: { candidateId?: string; employeeId?: string }.
 *  - Resolves the target employee (directly from employeeId, or a HR-Record
 *    person = candidate_intake → email → employees.email, mirroring
 *    app/(app)/hr/record/policy-status.ts).
 *  - Gathers that employee's document_instances and, for each, its LATEST
 *    document_signatures row with status='signed' + a non-null signed_pdf_path.
 *  - Downloads each archived signed PDF from the private `documents` bucket and
 *    concatenates them (pdf-lib copyPages) behind a simple cover page.
 *
 * HR-STAFF ONLY, and that matters: the body names an arbitrary employee, so any
 * weaker gate is an IDOR over other people's appointment letters and CTC
 * breakups. It used to be `requireWorkspace("hr")`, which is NOT a restriction —
 * lib/workspaces.ts documents the HR room as open to every employee, with real
 * gating done per-page by isHrStaff. The only caller (the HR-Record screen) is
 * already HR-staff-only, so this matches the surface it serves.
 *
 * The check is the `isHrStaff` PREDICATE, not `requireHrStaff()`: that redirects
 * (307), `fetch` follows it, and the caller would save the HR landing page's
 * HTML as `Docket.pdf`. A JSON 403 is what its error branch already renders.
 *
 * NO DB writes — a pure read + export, so it stays load-neutral (a couple of
 * indexed lookups + storage reads).
 */
export async function POST(req: Request): Promise<Response> {
  const me = await requireUser();
  if (!(await isHrStaff(me))) {
    return jsonError("You don't have access to this person's documents.", 403);
  }
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return jsonError(limited.error, 429);

  let body: DocketBody;
  try {
    body = (await req.json()) as DocketBody;
  } catch {
    return jsonError("Invalid request.", 400);
  }

  // ---- Resolve the employee -------------------------------------------------
  let employeeId: string | null = null;
  try {
    if (body.employeeId && UUID_RE.test(body.employeeId)) {
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, body.employeeId))
        .limit(1);
      employeeId = emp?.id ?? null;
    } else if (body.candidateId && UUID_RE.test(body.candidateId)) {
      const [cand] = await db
        .select({ email: candidateIntake.email })
        .from(candidateIntake)
        .where(eq(candidateIntake.id, body.candidateId))
        .limit(1);
      const email = (cand?.email ?? "").trim().toLowerCase();
      if (email) {
        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(sql`lower(${employees.email})`, email))
          .limit(1);
        employeeId = emp?.id ?? null;
      }
    } else {
      return jsonError("No person specified.", 400);
    }
  } catch {
    return jsonError("Could not resolve this person.");
  }

  if (!employeeId) {
    return jsonError("This person isn't linked to an employee account yet, so there are no signed documents.");
  }

  // ---- Gather signed documents ----------------------------------------------
  // One join: every issued document_instance for this employee that has a SIGNED
  // signature with an archived PDF. Ordered so the newest signature per instance
  // wins, and instances land newest-issued first.
  let rows: {
    instanceId: string;
    typeKey: string;
    issuedAt: Date | null;
    instanceCreatedAt: Date;
    signedPdfPath: string | null;
    signedAt: Date | null;
    sigCreatedAt: Date;
  }[];
  try {
    rows = await db
      .select({
        instanceId: documentInstances.id,
        typeKey: documentInstances.typeKey,
        issuedAt: documentInstances.issuedAt,
        instanceCreatedAt: documentInstances.createdAt,
        signedPdfPath: documentSignatures.signedPdfPath,
        signedAt: documentSignatures.signedAt,
        sigCreatedAt: documentSignatures.createdAt,
      })
      .from(documentInstances)
      .innerJoin(
        documentSignatures,
        and(
          eq(documentSignatures.docId, documentInstances.id),
          eq(documentSignatures.docKind, "letter"),
          eq(documentSignatures.status, "signed"),
        ),
      )
      .where(
        and(
          eq(documentInstances.employeeId, employeeId),
          isNotNull(documentSignatures.signedPdfPath),
        ),
      )
      .orderBy(desc(documentSignatures.signedAt), desc(documentSignatures.createdAt));
  } catch {
    return jsonError("Could not load this person's documents.");
  }

  // Keep the LATEST signed signature per instance (rows already ordered newest
  // signature first), then order the instances newest-issued first.
  const byInstance = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!r.signedPdfPath) continue;
    if (!byInstance.has(r.instanceId)) byInstance.set(r.instanceId, r);
  }
  const docs = [...byInstance.values()].sort((a, b) => {
    const ta = (a.issuedAt ?? a.instanceCreatedAt).getTime();
    const tb = (b.issuedAt ?? b.instanceCreatedAt).getTime();
    return tb - ta;
  });

  if (docs.length === 0) {
    return jsonError("No signed documents yet.");
  }

  // ---- Download + merge -----------------------------------------------------
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const admin = getSupabaseAdmin();

  const merged = await PDFDocument.create();

  // Pull each archived PDF; skip any that fail to download or parse so one bad
  // file never sinks the whole packet.
  const included: { title: string }[] = [];
  const sources: { title: string; bytes: Uint8Array }[] = [];
  for (const d of docs) {
    if (!d.signedPdfPath) continue;
    const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(d.signedPdfPath);
    if (error || !data) continue;
    const title = getDocType(d.typeKey)?.title ?? d.typeKey;
    sources.push({ title, bytes: new Uint8Array(await data.arrayBuffer()) });
    included.push({ title });
  }

  if (sources.length === 0) {
    return jsonError("The signed documents couldn't be retrieved right now.");
  }

  // Cover page — lists every included document in packet order.
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const bold = await merged.embedFont(StandardFonts.HelveticaBold);
  const cover = merged.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = cover.getSize();
  const marginX = 56;
  const red = rgb(0.882, 0.024, 0);
  const ink = rgb(0.094, 0.094, 0.106);
  const muted = rgb(0.42, 0.42, 0.46);

  cover.drawText("DOCUMENT DOCKET", { x: marginX, y: height - 92, size: 11, font: bold, color: red });
  cover.drawText("Signed documents on file", {
    x: marginX,
    y: height - 122,
    size: 24,
    font: bold,
    color: ink,
  });
  cover.drawText(
    `${included.length} document${included.length === 1 ? "" : "s"} · generated ${formatDate(new Date())}`,
    { x: marginX, y: height - 146, size: 11, font, color: muted },
  );
  cover.drawLine({
    start: { x: marginX, y: height - 168 },
    end: { x: width - marginX, y: height - 168 },
    thickness: 1,
    color: rgb(0.9, 0.9, 0.92),
  });

  let y = height - 200;
  included.forEach((doc, i) => {
    if (y < 72) {
      // Overflow onto a fresh cover-continuation page (rare — many documents).
      y = height - 72;
      merged.addPage([595.28, 841.89]);
    }
    const num = String(i + 1).padStart(2, "0");
    cover.drawText(num, { x: marginX, y, size: 12, font: bold, color: red });
    cover.drawText(doc.title, { x: marginX + 34, y, size: 12, font, color: ink });
    y -= 26;
  });

  // Append each source PDF's pages in packet order.
  for (const src of sources) {
    try {
      const srcDoc = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch {
      // Skip an unreadable PDF; the cover still lists it, the packet survives.
    }
  }

  const out = await merged.save();
  return new Response(new Uint8Array(out), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="Docket.pdf"',
      // Signed appointment letters and CTC breakups — never a shared cache.
      "cache-control": "private, no-store",
    },
  });
}
