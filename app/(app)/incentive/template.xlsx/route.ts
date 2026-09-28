import { requireAdmin } from "@/lib/auth/current";
import { buildIncentiveEntryTemplate } from "@/lib/exports/incentive-entry-template";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { listActiveProductNames } from "@/lib/queries/products";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Incentive Entries bulk-import template.
 *
 * TWO GUARDS, AND THEY ARE DIFFERENT QUESTIONS. `requireAdmin` asks whether the
 * caller may write the ledger at all — this file hands out the roster and the
 * product list to be filled in. `apiViewDenial` asks whether the permission
 * matrix has switched the INCENTIVE module off for them, and it is the guard
 * every other handler in the application carries: a route handler renders no
 * layout, so `requirePathView` never runs for it, and without this a revoked
 * module keeps answering its endpoints. `requireAdmin` alone would let a
 * master-admin-revoked admin download it.
 */
export async function GET(request: Request): Promise<Response> {
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const [roster, products] = await Promise.all([
    db.select({ id: employees.id, employeeCode: employees.employeeCode, name: employees.name })
      .from(employees)
      .where(and(eq(employees.isActive, true), isNotNull(employees.employeeCode))),
    listActiveProductNames(),
  ]);
  const buffer = await buildIncentiveEntryTemplate({
    roster: roster.map((row) => ({ ...row, employeeCode: row.employeeCode! })),
    products,
  });
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=Incentive-Entries-Import-Template.xlsx",
      "cache-control": "no-store",
    },
  });
}
