import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listModuleSubmissions } from "@/lib/queries/modules";
import { MODULES, type ModuleKey } from "@/lib/forms/modules";
import { resolveRequestFields, getProductOptions } from "@/lib/forms/server";
import { validateFields, fieldPairs } from "@/lib/forms/field-types";
import { db } from "@/lib/db";
import { moduleSubmissions } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

// Only the two form-driven Sales modules are exposed here. Reimbursement has its
// own richer endpoint (/api/mobile/reimbursements) with money KPIs.
const ALLOWED: ModuleKey[] = ["reference", "breakthrough"];

/** The list-row headline field per module (mirrors the web MODULE_UI.primaryKey). */
const PRIMARY_KEY: Record<string, string> = {
  reference: "reference_name",
  breakthrough: "participant_first_name",
};

/** Humanised status label per module — the "approved" state reads differently. */
function statusLabel(module: string, status: string): string {
  if (status === "rejected") return "Rejected";
  if (status === "approved") return module === "reference" ? "Actioned" : "Acknowledged";
  return "Pending";
}

function isAllowed(key: string): key is ModuleKey {
  return (ALLOWED as string[]).includes(key);
}

/**
 * GET /api/mobile/module/[key] — a form-driven Sales module (reference or
 * breakthrough) for the signed-in user: the module chrome, the request-field
 * schema (so the app renders the form dynamically), the product options, and the
 * user's OWN submissions (owner-scoped). Reuses the web's field config + query so
 * the two surfaces never diverge.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { key } = await ctx.params;
  if (!isAllowed(key)) {
    return NextResponse.json({ error: "Unknown form." }, { status: 404, headers: MOBILE_CORS });
  }
  const def = MODULES[key];
  const primary = PRIMARY_KEY[key] ?? "";

  const [fields, productOptions, rows] = await Promise.all([
    resolveRequestFields(key),
    getProductOptions(),
    listModuleSubmissions({ module: key, employeeId: me.id, isAdmin: false }),
  ]);

  return NextResponse.json(
    {
      key,
      title: def.title,
      subtitle: def.subtitle,
      buttonLabel: def.buttonLabel,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        placeholder: f.placeholder ?? null,
        options: f.options ?? [],
      })),
      productOptions,
      submissions: rows.map((r) => ({
        id: r.id,
        title: (r.fields[primary] ?? "").trim() || def.title,
        status: r.status,
        statusLabel: statusLabel(key, r.status),
        createdAt: new Date(r.createdAt).toISOString(),
        pairs: fieldPairs(fields, r.fields).map(([label, value]) => ({ label, value })),
      })),
    },
    { headers: MOBILE_CORS },
  );
}

/**
 * POST /api/mobile/module/[key] — submit a new entry. Body: { fields: {key:val} }.
 * Validates against the resolved request-field schema (same as the web
 * submitModule action) and inserts the submission owned by the signed-in user.
 */
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { key } = await ctx.params;
  if (!isAllowed(key)) {
    return NextResponse.json({ error: "Unknown form." }, { status: 404, headers: MOBILE_CORS });
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  const body = (await req.json().catch(() => null)) as { fields?: Record<string, string> } | null;
  if (!body) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: MOBILE_CORS });

  const [fields, products] = await Promise.all([resolveRequestFields(key), getProductOptions()]);
  const validated = validateFields(fields, body.fields ?? {}, products);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400, headers: MOBILE_CORS });
  }

  try {
    const [row] = await db
      .insert(moduleSubmissions)
      .values({ module: key, employeeId: me.id, fields: validated.values })
      .returning({ id: moduleSubmissions.id });
    return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
