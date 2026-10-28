import { BookUser } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { isMissingRegisterTable, listDirectoryContacts } from "@/lib/hr/registers-server";
import { RegisterSetupNeeded } from "@/components/hr/registers/register-setup-needed";
import { HrDirectory } from "@/components/hr/directory/hr-directory";

export const dynamic = "force-dynamic";

export default async function HrDirectoryPage() {
  await requireHrStaff();
  let contacts;
  try {
    contacts = await listDirectoryContacts();
  } catch (error) {
    if (!isMissingRegisterTable(error)) throw error;
    return <RegisterSetupNeeded title="Directory" />;
  }
  return (
    <PageShell width="full">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-700"><BookUser className="h-5 w-5" /></span>
        <div><h1 className="text-[22px] font-black tracking-tight text-ink-strong">Directory</h1><p className="text-[13px] text-ink-muted">Vendors and HR Consultants in one secure directory.</p></div>
      </header>
      <HrDirectory contacts={contacts} />
    </PageShell>
  );
}
