import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { overtimeEntries } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listOvertimeEntries } from "@/lib/queries/overtime";
import { localDateString } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** "Jun 2026" from a `YYYY-MM` prefix. Wrapped in `new Date` (noon UTC) so a
 *  bare date string never trips a timezone/string→Date bug. */
function monthLabel(monthPrefix: string): string {
  const d = new Date(`${monthPrefix}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Pending" / "Approved" / "Rejected" — humanise the raw status token. */
function statusLabel(status: string): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : status;
}

/**
 * GET /api/mobile/overtime — the SIGNED-IN user's own overtime ledger (Employees
 * workspace). Owner-scoped: only the entries the phone's owner logged, newest
 * work-date first, with the same KPI roll-up the web `/overtime` page folds over
 * its rows (total / approved / pending hours + this-month hours + pending count).
 *
 * Reuses the web query function [listOvertimeEntries] and then narrows to the
 * owner's own rows, so the phone and the web page can never diverge on a
 * person's numbers. Read-only — overtime is filed / approved on the web.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: MOBILE_CORS },
    );
  }
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const todayISO = localDateString(tz);
  const monthPrefix = todayISO.slice(0, 7);

  // Owner-scoped: fetch through the shared query as a non-admin, then keep only
  // the phone owner's own rows (a manager's downline never leaks onto their
  // personal ledger).
  const all = await listOvertimeEntries({ employeeId: me.id, isAdmin: false });
  const rows = all.filter((r) => r.employeeId === me.id);

  // KPIs folded over the loaded rows (mirrors the web page — zero extra queries).
  const sum = (rs: typeof rows) => rs.reduce((s, r) => s + r.hours, 0);
  const totalHours = sum(rows);
  const approvedHours = sum(rows.filter((r) => r.status === "approved"));
  const pendingHours = sum(rows.filter((r) => r.status === "pending"));
  const monthHours = sum(rows.filter((r) => r.workDate.startsWith(monthPrefix)));
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const approvedRate = totalHours > 0 ? approvedHours / totalHours : null;

  const entries = rows.map((r) => ({
    id: r.id,
    workDate: r.workDate,
    hours: r.hours,
    reason: r.reason ?? null,
    status: r.status,
    statusLabel: statusLabel(r.status),
    approvedByName: r.approvedByName ?? null,
    approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
    note: r.note ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
  }));

  return NextResponse.json(
    {
      ownerName: me.name,
      totals: {
        totalHours,
        approvedHours,
        pendingHours,
        monthHours,
        pendingCount,
        approvedRate,
        entryCount: rows.length,
        monthLabel: monthLabel(monthPrefix),
      },
      entries,
    },
    { headers: MOBILE_CORS },
  );
}

const LogSchema = z
  .object({
    workDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.")
      .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Pick a valid date."),
    hours: z.coerce.number().gt(0, "Hours must be more than 0.").max(24, "Hours cannot exceed 24."),
    reason: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

/**
 * POST /api/mobile/overtime — the signed-in user logs an overtime entry for
 * themselves. Mirrors the web `logOvertime` (self path): lands as `pending`.
 * Body: { workDate: "YYYY-MM-DD", hours, reason? }.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429, headers: MOBILE_CORS });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: MOBILE_CORS });
  }
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400, headers: MOBILE_CORS });
  }

  try {
    const [row] = await db
      .insert(overtimeEntries)
      .values({
        employeeId: me.id,
        workDate: parsed.data.workDate,
        hours: parsed.data.hours.toFixed(2),
        reason: parsed.data.reason ? parsed.data.reason : null,
        createdById: me.id,
      })
      .returning({ id: overtimeEntries.id });
    return NextResponse.json({ ok: true, id: row!.id }, { headers: MOBILE_CORS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: MOBILE_CORS },
    );
  }
}
