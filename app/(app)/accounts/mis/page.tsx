import { DashboardHeader } from "@/components/layout/header";
import { MisWorkspace } from "@/components/accounts/mis/mis-workspace";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { misTabId } from "@/lib/accounts/mis";

export const dynamic = "force-dynamic";

export default async function MisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!DUMMY_MODE) await requireAccountsAccess();
  const params = await searchParams;
  const rawTab = typeof params.tab === "string" ? params.tab : undefined;

  return <><DashboardHeader generatedAt={new Date()} /><MisWorkspace activeTabId={misTabId(rawTab)} /></>;
}
