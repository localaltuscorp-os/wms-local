import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listBillingLookups } from "@/lib/queries/billing-lookups";
import { DropdownMasterView } from "@/components/billing/dropdown-master-view";

/**
 * /billing/customers/dropdowns — CUSTOMER MASTER DD.
 *
 * Every editable dropdown on the Customer KYC form, in one place. The lists
 * themselves are declared in code (lib/billing/lookups.ts) because a list only
 * exists if a field on the form reads it; their OPTIONS live in
 * `billing_lookups` because people add to them. This screen edits the options.
 *
 * The heading belongs to the view rather than to this file: the view owns the
 * fullscreen toggle that sits beside it, and a title split across the two
 * would drift the moment either changed.
 *
 * The two description masters are restricted to Accounts and to Manan Vasa —
 * they are the only lists whose options get printed on a document that leaves
 * the company. Enforced in the server actions (`guard()`), not here.
 */
export const dynamic = "force-dynamic";

export default async function CustomerMasterDropdownsPage() {
  await requireWorkspace("billing");
  const lists = await listBillingLookups();

  return (
    <PageShell width="wide">
      <DropdownMasterView lists={lists} />
    </PageShell>
  );
}
