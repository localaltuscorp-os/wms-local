import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listDueItems } from "@/lib/queries/accounts-due";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/accounts/due-dates — the Accounts "Due Dates Checklist" as a
 * mobile-friendly card list: recurring bills & statutory items with frequency,
 * statement period, due date and a derived Paid / Pending status (paid = a
 * paid-date is recorded). Read-only.
 *
 * Gated to SUPER-ADMINS only, matching the web `requireAccountsAccess` — the
 * Accounts module holds sensitive financial data. Reuses `listDueItems` (one
 * source of truth with the web page); normalizes each row to exactly what the
 * native section screen renders.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  if (!isSuperAdmin(auth.employee.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const rows = await listDueItems();
  const items = rows.map((r) => {
    const paid = Boolean((r.paidDate && r.paidDate.trim()) || (r.paidAmt && r.paidAmt.trim()));
    return {
      id: r.id,
      code: r.code ?? null,
      area: r.area ?? null,
      compliance: r.compliance ?? null,
      frequency: r.frequency ?? null,
      statementPeriod: r.statementPeriod ?? null,
      dueDate: r.dueDate ?? null,
      paidDate: r.paidDate ?? null,
      paidAmt: r.paidAmt ?? null,
      notes: r.notes ?? null,
      status: paid ? "paid" : "pending",
    };
  });

  const paidCount = items.filter((i) => i.status === "paid").length;

  return NextResponse.json(
    {
      title: "Due Dates Checklist",
      tagline: "Recurring bills & statutory items — frequency, period, due date and payment status.",
      counts: { total: items.length, paid: paidCount, pending: items.length - paidCount },
      items,
    },
    { headers: MOBILE_CORS },
  );
}
