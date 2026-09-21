import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { customerStats, listCustomerMaster } from "@/lib/queries/billing-customers";
import { CustomerMasterView } from "@/components/billing/customer-master-view";

/**
 * /billing/customers — CUSTOMER MASTER.
 *
 * Every KYC'd client, with the counts across the top and the filters that make
 * a list of a few hundred usable. Rows come from `billing_customers` — the same
 * record an invoice bills to, so a client onboarded here is billable at once.
 *
 * `?new=<id>&q=<name>` is what the KYC form lands on after Onboard Client. The
 * list is sorted by name and paged, so a brand-new client is otherwise buried
 * somewhere on page 7 and the onboarding reads as if it did nothing. The two
 * params seed the search box and mark the row, so the client you just created
 * is the one thing on screen.
 */
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function CustomerMasterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspace("billing");
  const sp = await searchParams;
  const rows = await listCustomerMaster();
  return (
    <PageShell width="wide">
      <CustomerMasterView
        rows={rows}
        stats={customerStats(rows)}
        initialQuery={one(sp.q)}
        justAddedId={one(sp.new)}
      />
    </PageShell>
  );
}
