import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { isMissingRegisterTable, listDirectoryContacts, type ContactRow } from "@/lib/hr/registers-server";
import { RegisterSetupNeeded } from "@/components/hr/registers/register-setup-needed";
import { HrDirectory } from "@/components/hr/directory/hr-directory";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

const DIRECTORY_PREVIEW_CONTACTS: ContactRow[] = [
  { id: "preview-vendor-1", directoryType: "vendor", companyName: "Test Office Supplies", personName: "Test Contact One", cellNo: "7000000001", alternateNo: null, email: "vendor.one@example.test", contact2Name: "Test Contact Two", contact2CellNo: "7000000002", contact2Email: "vendor.two@example.test", service: "Office supplies", notes: null, isActive: true },
  { id: "preview-vendor-2", directoryType: "vendor", companyName: "Test Facilities Group", personName: "Test Contact Three", cellNo: "7000000003", alternateNo: null, email: "vendor.three@example.test", contact2Name: null, contact2CellNo: null, contact2Email: null, service: "Facility management", notes: null, isActive: true },
  { id: "preview-vendor-3", directoryType: "vendor", companyName: "Test IT Services", personName: "Test Contact Four", cellNo: "7000000004", alternateNo: null, email: "vendor.four@example.test", contact2Name: "Test Contact Five", contact2CellNo: "7000000005", contact2Email: "vendor.five@example.test", service: "IT support", notes: null, isActive: true },
  { id: "preview-consultant-1", directoryType: "hr_consultant", companyName: "Test HR Advisory", personName: "Test Consultant One", cellNo: "7000000006", alternateNo: null, email: "consultant.one@example.test", contact2Name: null, contact2CellNo: null, contact2Email: null, service: "HR consulting", notes: null, isActive: true },
  { id: "preview-consultant-2", directoryType: "hr_consultant", companyName: "Test Talent Partners", personName: "Test Consultant Two", cellNo: "7000000007", alternateNo: null, email: "consultant.two@example.test", contact2Name: "Test Contact Six", contact2CellNo: "7000000008", contact2Email: "consultant.six@example.test", service: "Recruitment", notes: null, isActive: true },
];

export default async function HrDirectoryPage() {
  await requireHrStaff();
  let contacts;
  try {
    contacts = await listDirectoryContacts();
  } catch (error) {
    if (!isMissingRegisterTable(error)) throw error;
    return <><HrTitleBar /><RegisterSetupNeeded title="Directory" /></>;
  }
  const preview = process.env.NODE_ENV === "development" && contacts.length === 0;
  return (
    <PageShell width="full">
      <HrTitleBar />
      <HrDirectory contacts={preview ? DIRECTORY_PREVIEW_CONTACTS : contacts} preview={preview} />
    </PageShell>
  );
}
