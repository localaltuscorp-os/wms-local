import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agreements } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { agreementsEnabled } from "@/lib/agreements/flag";
import { getAgreementByToken } from "@/lib/agreements/queries";
import { renderAgreement } from "@/lib/agreements/templates";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { AGREEMENT_STATUS_LABELS } from "@/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/agreements/sign?token=… — load one agreement for signing, the
 * mobile twin of the web `/agreements/sign/[token]` page loader. Reached by the
 * unguessable per-agreement token. Reuses getAgreementByToken + renderAgreement
 * (from the SAME three durable columns type/entity/employeeName + fieldValues)
 * and signatoryForEntity, so the rendered letter is byte-identical to the web
 * preview + PDF. Returns the rendered body/fields + status + signatory.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  if (!agreementsEnabled()) {
    return NextResponse.json({ error: "agreements-unavailable" }, { status: 403, headers: MOBILE_CORS });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing-token" }, { status: 400, headers: MOBILE_CORS });
  }

  const found = await getAgreementByToken(token);
  if (!found) {
    return NextResponse.json({ error: "This signing link is no longer valid." }, { status: 404, headers: MOBILE_CORS });
  }

  const { agreement, employeeName } = found;
  const rendered = renderAgreement({
    type: agreement.type,
    employeeName,
    entity: agreement.entity ?? "",
    ...agreement.fieldValues,
  });
  const signatory = signatoryForEntity(agreement.entity);

  return NextResponse.json(
    {
      agreement: {
        id: agreement.id,
        employeeId: agreement.employeeId,
        employeeName,
        type: agreement.type,
        title: agreement.title,
        entity: agreement.entity,
        status: agreement.status,
        statusLabel: AGREEMENT_STATUS_LABELS[agreement.status],
        signedName: agreement.signedName,
        signedAt: agreement.signedAt ? agreement.signedAt.toISOString() : null,
        // The signed PDF is downloadable at this path once status === "signed".
        pdfPath: `/agreements/pdf/${agreement.id}`,
      },
      rendered,
      signatory: { name: signatory.name, assetSrc: signatory.assetSrc },
    },
    { headers: MOBILE_CORS },
  );
}

const SignSchema = z.object({
  token: z.string().trim().min(1),
  typedName: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 2, "Please type your full legal name."),
  agreed: z.literal(true, { message: "You must agree to the document to sign." }),
});

/**
 * POST /api/mobile/agreements/sign — e-sign, the mobile twin of the web
 * `signAgreement` action. Body: { token, typedName (a.k.a. signedName), agreed }.
 * Stamps signedName + signedAt + best-effort IP and flips status → 'signed'
 * (one-way, idempotent-guarded). Ownership is enforced leniently — exactly like
 * the web action: a DIFFERENT logged-in non-admin employee is blocked, but the
 * owner or an admin holding the token may sign.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!agreementsEnabled()) {
    return NextResponse.json({ error: "Agreements are currently unavailable." }, { status: 403, headers: MOBILE_CORS });
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  // Accept `signedName` as an alias for the web action's `typedName`.
  const raw = (body ?? {}) as Record<string, unknown>;
  const normalized = {
    token: raw.token,
    typedName: raw.typedName ?? raw.signedName,
    agreed: raw.agreed,
  };
  const parsed = SignSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const { token, typedName } = parsed.data;

  try {
    const [row] = await db
      .select()
      .from(agreements)
      .where(eq(agreements.signToken, token))
      .limit(1);
    if (!row) return NextResponse.json({ error: "This signing link is no longer valid." }, { status: 404, headers: MOBILE_CORS });
    if (row.status === "signed") return NextResponse.json({ error: "Already signed." }, { status: 409, headers: MOBILE_CORS });

    // Lenient ownership check — only block a DIFFERENT logged-in employee.
    if (!me.isAdmin && me.id !== row.employeeId) {
      return NextResponse.json({ error: "This agreement isn't yours." }, { status: 403, headers: MOBILE_CORS });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    await db
      .update(agreements)
      .set({
        signedName: typedName,
        signedAt: new Date(),
        signedIp: ip,
        status: "signed",
        updatedAt: new Date(),
      })
      .where(eq(agreements.id, row.id));

    return NextResponse.json({ ok: true, id: row.id }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
