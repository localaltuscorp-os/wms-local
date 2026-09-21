import { BookUser } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { canEditHrRegisters } from "@/lib/hr/registers";
import { isMissingRegisterTable, listContacts, listEmployeeContacts } from "@/lib/hr/registers-server";
import { AddressBook } from "@/components/hr/registers/address-book";
import { RegisterSetupNeeded } from "@/components/hr/registers/register-setup-needed";

export const dynamic = "force-dynamic";

const ACCENT = "#B91C1C";

/**
 * HR → Address Book of Resources. Vendors / service people plus every employee's
 * personal contact details (read live from their HR forms). Everyone in HR can
 * view; Ruchita, Rutvisha and Manan can change resources.
 */
export default async function AddressBookPage() {
  const me = await requireWorkspace("hr");
  const canEdit = canEditHrRegisters(me.email);

  let contacts, employees;
  try {
    [contacts, employees] = await Promise.all([listContacts(), listEmployeeContacts()]);
  } catch (e) {
    if (!isMissingRegisterTable(e)) throw e;
    return <RegisterSetupNeeded title="Address Book" />;
  }

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#FEE2E2", color: ACCENT }}>
          <BookUser className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Address Book</h1>
          <p className="text-[13px] text-ink-muted">Service resources and every employee&apos;s personal contact details.</p>
        </div>
      </header>
      <AddressBook contacts={contacts} employees={employees} canEdit={canEdit} />
    </PageShell>
  );
}
