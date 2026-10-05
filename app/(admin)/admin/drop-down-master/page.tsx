import { requireAdmin } from "@/lib/auth/current";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { DropDownMasterExplorer } from "@/components/admin/drop-down-master-explorer";

export const dynamic = "force-dynamic";

export default async function DropDownMasterPage() {
  await requireAdmin();

  return (
    <>
      <PageCommandBar title="Dropdown" />
      <main className="w-full max-w-none px-6 pb-8">
        <DropDownMasterExplorer />
      </main>
    </>
  );
}
