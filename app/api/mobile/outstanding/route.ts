import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { todayISO, rollingHorizon } from "@/lib/outstanding/horizon";
import { loadOutstandingDashboard } from "@/lib/queries/outstanding";
import type { OutstandingFilters } from "@/lib/outstanding/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** No filters — the mobile screen shows the whole receivables picture, the same
 *  default view the web `/outstanding` page renders before any pill is chosen. */
const NO_FILTERS: OutstandingFilters = {
  employees: [],
  entities: [],
  months: [],
  years: [],
  cycles: [],
  modes: [],
  statuses: [],
  pdcOnly: false,
};

/** How many ledger rows the phone list carries — the full ledger can be large,
 *  so the two tables are trimmed to the most-relevant slice (dashboard totals
 *  above them are always computed over the complete, untrimmed set). */
const ENTRY_LIMIT = 120;
const COLLECTION_LIMIT = 120;

/**
 * GET /api/mobile/outstanding — the Sales receivables dashboard for the native
 * app: the same totals / overdue buckets / month splits / employee & entity
 * roll-ups / PDC panel / collections overview the web `/outstanding` page shows,
 * plus the open-installment ledger and the collection ledger (each trimmed).
 *
 * Reuses the exact web query + aggregation (`loadOutstandingDashboard`) so the
 * phone and the web page can never diverge on the numbers. Read-only, additive —
 * it touches no write path.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }

  const today = todayISO();
  const horizon = rollingHorizon(today);

  const { dashboard, entries, collectionEntries } = await loadOutstandingDashboard(
    NO_FILTERS,
    today,
    horizon,
  );

  const entryRows = entries.slice(0, ENTRY_LIMIT).map((e) => ({
    id: e.id,
    client: e.clientName,
    // The web entries table shows the product/plan as the sub-line.
    particulars: e.productName ?? null,
    responsible: e.responsibleName ?? null,
    entity: e.entityName ?? null,
    amount: e.amount,
    balance: e.balance,
    dueDate: e.dueDate,
    state: e.state,
    daysOverdue: e.daysOverdue,
    pdcReceived: e.pdcReceived ?? true,
  }));

  const collectionRows = collectionEntries.slice(0, COLLECTION_LIMIT).map((c) => ({
    id: c.id,
    client: c.clientName,
    amount: c.amount,
    paymentMode: c.paymentMode,
    responsible: c.responsible,
    comments: c.comments,
    // Already a `YYYY-MM-DD` string from the query layer; new Date() guards any
    // stray Date value so the ISO slice below is never a string/Date bug.
    collectedAt: new Date(`${c.collectedAt}T12:00:00Z`).toISOString().slice(0, 10),
  }));

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      today,
      ownerName: auth.employee.name,
      totals: dashboard.totals,
      buckets: dashboard.buckets,
      monthOverdue: dashboard.monthOverdue,
      monthNotDue: dashboard.monthNotDue,
      byEmployee: dashboard.byEmployee,
      byEntity: dashboard.byEntity,
      pdc: dashboard.pdc,
      collections: dashboard.collections,
      entries: entryRows,
      entriesTruncated: entries.length > ENTRY_LIMIT,
      entriesTotal: entries.length,
      collectionEntries: collectionRows,
      collectionsTruncated: collectionEntries.length > COLLECTION_LIMIT,
      collectionEntriesTotal: collectionEntries.length,
    },
    { headers: MOBILE_CORS },
  );
}
