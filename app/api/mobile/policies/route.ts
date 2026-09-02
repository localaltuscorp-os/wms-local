import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { isPolicyCategory, type PolicyCategory } from "@/lib/hr/policy-types";
import { listPolicies, groupPolicies, policyStoragePath } from "@/lib/hr/sections";
import { safeFileName, validateUpload, HR_UPLOAD_MAX_BYTES } from "@/lib/hr/upload";
import { POLICY_CARDS } from "@/lib/hr/policies/registry";
import { getPolicySignStatusFor } from "@/app/(app)/hr/policies/sign-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Policies are company-wide; admins/super-admins upload or remove them
 *  (mirrors the web `isAdmin` in policies/actions.ts). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** HR is an open room — replicate the web `requireWorkspace("hr")` gate exactly
 *  (returns true for every active employee today, future-proof if HR is gated). */
async function inHrRoom(me: Employee): Promise<boolean> {
  return canAccessWorkspace("hr", await accessFor(me));
}

/**
 * GET /api/mobile/policies — the company handbook: every policy document grouped
 * by category with a signed download URL, the mobile twin of the web
 * `/policies` page. Open to every HR-room user (all active employees). Reuses the
 * exact web loaders (`listPolicies` → `groupPolicies`) so the two never diverge.
 * Returns `isAdmin` so the app can show the upload/delete affordances.
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

  const [groups, signStatus] = await Promise.all([
    listPolicies().then(groupPolicies),
    // Per-user sign status for the SIGNABLE registry policies — lets the app
    // badge "✓ Signed · date" vs "Read & sign", the mobile twin of the web
    // All-Policies popup (Sir: nobody should re-sign just to check).
    getPolicySignStatusFor(me.id),
  ]);

  // The signable registry cards (POSH, Exit, Attendance, …) — only the authored
  // ("ready") ones — flattened with this user's signed timestamp, if any.
  const signable = POLICY_CARDS.filter((c) => c.status === "ready").map((c) => ({
    key: c.key,
    title: c.title,
    blurb: c.blurb,
    badge: c.badge,
    signedAt: signStatus.signed[c.key] ?? null,
  }));

  return NextResponse.json(
    { isAdmin: isAdmin(me), groups, signable },
    { headers: MOBILE_CORS },
  );
}

const CreateSchema = z
  .object({
    title: z.string().trim().min(1, "Give the policy a title").max(200, "Title too long"),
    category: z.string().refine(isPolicyCategory, "Pick a category."),
    description: z.string().trim().max(2000).optional(),
    // A Supabase path the app pre-uploaded under its own folder via
    // /api/mobile/storage/sign (which forces the `<me.id>/…` prefix).
    filePath: z.string().trim().min(1, "Upload a file first."),
    fileName: z.string().trim().min(1, "Missing file name.").max(200),
    mimeType: z.string().trim().max(200).optional(),
    sizeBytes: z.number().int().positive("File is empty.").max(HR_UPLOAD_MAX_BYTES, "File exceeds 25 MB."),
  })
  .strict();

/**
 * POST /api/mobile/policies — upload a policy (admin only), the JSON twin of the
 * web `uploadPolicy`. The app pre-uploads the file under its OWN storage folder
 * (`<me.id>/…`) via /api/mobile/storage/sign, then posts the path + metadata
 * here. We validate the shape (same deny-list + size cap as the web
 * `validateUpload`), then MOVE the object to the canonical web path
 * (`hr-policies/<category>/<uuid>/<name>`) so `listPolicies` — which finds
 * policies by that storage prefix — returns it identically on web and mobile.
 * Body: { title, category, description?, filePath, fileName, mimeType, sizeBytes }.
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

  // The uploaded object must live under the caller's own folder — the same guard
  // /api/mobile/storage/sign enforces (one user can't attach another's object).
  const source = d.filePath.replace(/^\/+/, "");
  if (!source.startsWith(`${me.id}/`)) {
    return NextResponse.json({ error: "filePath must be under your own folder" }, { status: 403, headers: MOBILE_CORS });
  }

  // Same file-type deny-list the web enforces (block executables + inline-
  // renderable HTML/SVG). Size is validated by the schema against the shared cap.
  const probe = new File(["x"], d.fileName, { type: d.mimeType ?? "" });
  const shape = validateUpload(probe);
  if (!shape.ok) return NextResponse.json({ error: shape.error }, { status: 400, headers: MOBILE_CORS });

  const category = d.category as PolicyCategory;
  const dest = policyStoragePath(category, crypto.randomUUID(), safeFileName(d.fileName));
  const admin = getSupabaseAdmin();
  const { error: mvErr } = await admin.storage.from(DOCUMENTS_BUCKET).move(source, dest);
  if (mvErr) return NextResponse.json({ error: `Upload failed: ${mvErr.message}` }, { status: 400, headers: MOBILE_CORS });

  let inserted;
  try {
    // Explicit column list only — never touch the 0142 goal/weekly columns.
    [inserted] = await db
      .insert(documents)
      .values({
        title: d.title,
        description: d.description?.trim().slice(0, 2000) || null,
        storagePath: dest,
        mimeType: d.mimeType || null,
        sizeBytes: d.sizeBytes,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([dest]).catch(() => {});
    return NextResponse.json({ error: `DB: ${err instanceof Error ? err.message : String(err)}` }, { status: 500, headers: MOBILE_CORS });
  }
  if (!inserted) return NextResponse.json({ error: "Insert returned no row" }, { status: 500, headers: MOBILE_CORS });

  return NextResponse.json({ ok: true, id: inserted.id }, { headers: MOBILE_CORS });
}
