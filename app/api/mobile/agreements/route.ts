import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agreements } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { agreementsEnabled } from "@/lib/agreements/flag";
import {
  rosterForAgreements,
  listAgreements,
  agreementsForEmployee,
} from "@/lib/agreements/queries";
import { FIELD_VALUE_KEYS } from "@/lib/agreements/field-keys";
import { AGREEMENT_TYPES, AGREEMENT_TYPE_LABELS, AGREEMENT_STATUS_LABELS } from "@/db/enums";
import type { AgreementRow } from "@/lib/agreements/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** 403 body used whenever the Agreements module is killed by AGREEMENTS_OFF. */
const OFF = { error: "agreements-unavailable" } as const;

/** Load the heavy `field_values` bag for a set of agreement ids (the slim
 *  AgreementRow used by the tracker omits it), so the app can re-open a draft
 *  and pre-fill the builder. One lightweight query, keyed by id. */
async function fieldValuesByIds(ids: string[]): Promise<Map<string, Record<string, string>>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: agreements.id, fieldValues: agreements.fieldValues })
    .from(agreements)
    .where(inArray(agreements.id, ids));
  return new Map(rows.map((r) => [r.id, r.fieldValues ?? {}]));
}

/** Attach status/signToken (already on the row) + the field_values bag. */
function withFieldValues(row: AgreementRow, fv: Map<string, Record<string, string>>) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    type: row.type,
    typeLabel: AGREEMENT_TYPE_LABELS[row.type],
    title: row.title,
    status: row.status,
    statusLabel: AGREEMENT_STATUS_LABELS[row.status],
    signToken: row.signToken,
    signedName: row.signedName,
    signedAt: row.signedAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    fieldValues: fv.get(row.id) ?? {},
  };
}

/**
 * GET /api/mobile/agreements — the signed-in user's Agreements surface, the
 * mobile twin of the web `/agreements` page (same access split).
 *
 *   • employee  → agreementsForEmployee(me.id): their own letters to review/sign,
 *                 each with status + signToken + fieldValues.
 *   • admin     → listAgreements() (every letter, newest first) + the drafting
 *                 roster (rosterForAgreements — active employees with the fields
 *                 an agreement auto-fills from) + the template `types` list.
 *
 * Reuses the exact web query functions so the phone and the web page can never
 * diverge. Gated by agreementsEnabled() → 403 when the module is off.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!agreementsEnabled()) {
    return NextResponse.json(OFF, { status: 403, headers: MOBILE_CORS });
  }

  if (me.isAdmin) {
    const [rows, roster] = await Promise.all([listAgreements(), rosterForAgreements()]);
    const fv = await fieldValuesByIds(rows.map((r) => r.id));
    return NextResponse.json(
      {
        isAdmin: true,
        agreements: rows.map((r) => withFieldValues(r, fv)),
        roster,
        // Template catalogue for the drafting picker (POST validates `type`).
        types: AGREEMENT_TYPES.map((t) => ({ type: t, label: AGREEMENT_TYPE_LABELS[t] })),
      },
      { headers: MOBILE_CORS },
    );
  }

  const rows = await agreementsForEmployee(me.id);
  const fv = await fieldValuesByIds(rows.map((r) => r.id));
  return NextResponse.json(
    { isAdmin: false, agreements: rows.map((r) => withFieldValues(r, fv)) },
    { headers: MOBILE_CORS },
  );
}

const SaveSchema = z
  .object({
    id: z.string().uuid().optional(),
    employeeId: z.string().uuid(),
    type: z.enum(AGREEMENT_TYPES),
    entity: z.string().trim().min(1, "Pick a paying entity.").max(120),
    title: z.string().trim().max(200).optional(),
    fieldValues: z.record(z.string(), z.string()).default({}),
  })
  .strict();

/**
 * POST /api/mobile/agreements — admin-only draft create-or-update, mirroring the
 * web `saveAgreement`: keeps only recognised FIELD_VALUE_KEYS, resolves the
 * title, and (on update) edits DRAFTS ONLY — sent/signed letters are immutable.
 * Body: { id?, employeeId, type, entity, title?, fieldValues }. Returns
 * { id, signToken }. Admins only (me.isAdmin) — mirrors requireAgreementsAdmin.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!agreementsEnabled()) {
    return NextResponse.json(OFF, { status: 403, headers: MOBILE_CORS });
  }
  if (!me.isAdmin) {
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
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }
  const { id, employeeId, type, entity, title, fieldValues } = parsed.data;

  // Keep only recognised keys so a stray field can't bloat the row (verbatim
  // from the web saveAgreement).
  const cleanFieldValues: Record<string, string> = {};
  for (const k of FIELD_VALUE_KEYS) {
    const v = fieldValues[k];
    if (typeof v === "string" && v.trim() !== "") cleanFieldValues[k] = v;
  }
  const resolvedTitle = title?.trim() || AGREEMENT_TYPE_LABELS[type];

  try {
    if (id) {
      // Only drafts stay editable; sent/signed letters are immutable.
      const updated = await db
        .update(agreements)
        .set({ type, entity, title: resolvedTitle, fieldValues: cleanFieldValues, updatedAt: new Date() })
        .where(and(eq(agreements.id, id), eq(agreements.status, "draft")))
        .returning({ id: agreements.id, signToken: agreements.signToken });
      if (updated.length === 0) {
        return NextResponse.json({ error: "That draft can no longer be edited." }, { status: 409, headers: MOBILE_CORS });
      }
      return NextResponse.json({ ok: true, id: updated[0]!.id, signToken: updated[0]!.signToken }, { headers: MOBILE_CORS });
    }

    const [row] = await db
      .insert(agreements)
      .values({
        employeeId,
        type,
        status: "draft",
        title: resolvedTitle,
        entity,
        fieldValues: cleanFieldValues,
        signToken: randomUUID().replace(/-/g, ""),
        createdById: me.id,
      })
      .returning({ id: agreements.id, signToken: agreements.signToken });
    return NextResponse.json({ ok: true, id: row!.id, signToken: row!.signToken }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
