import { DashboardHeader } from "@/components/layout/header";
import { PaymentsWorkspace } from "@/components/accounts/payments/payments-workspace";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { paymentTabId } from "@/lib/accounts/payments";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!DUMMY_MODE) await requireAccountsAccess();
  const params = await searchParams;
  const rawTab = typeof params.tab === "string" ? params.tab : undefined;

  return <><DashboardHeader generatedAt={new Date()} /><PaymentsWorkspace activeTabId={paymentTabId(rawTab)} /></>;
}
