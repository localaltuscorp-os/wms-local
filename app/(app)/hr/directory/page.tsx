import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { isMissingRegisterTable, listDirectoryContacts, listEmployeeContacts, type ContactRow, type EmployeeContactRow } from "@/lib/hr/registers-server";
import { RegisterSetupNeeded } from "@/components/hr/registers/register-setup-needed";
import { HrDirectory } from "@/components/hr/directory/hr-directory";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

const DIRECTORY_PREVIEW_CONTACTS: ContactRow[] = [
  { id: "preview-vendor-1", directoryType: "vendor", companyName: "Northstar Office Services", personName: "Test Vendor One", firstName: "Test", lastName: "Vendor One", cellNo: "9876500011", alternateNo: null, email: "vendor.one@example.invalid", category: "Office supplies", utility: "Stationery and printing", amcOnCall: "On-call", addressLine1: "24 Business Park", addressLine2: "Andheri East", addressLine3: "Mumbai", addressLine4: "Maharashtra", pincode: "400093", gstNo: "27ABCDE1234F1Z5", panNo: "ABCDE1234F", gstName: "Northstar Office Services Pvt Ltd", bankDetails: { accountName: "Northstar Office Services", accountNo: "012345678901", accountType: "Current", micrCode: "400002001", branchAddress: "Andheri East, Mumbai", pincode: "400093" }, contact1Name: "Test Vendor Two", contact1CellNo: "9876500012", contact1Email: "vendor.two@example.invalid", contact2Name: "Test Vendor Three", contact2CellNo: "9876500013", contact2Email: "vendor.three@example.invalid", attachments: {}, rateNegotiated: null, paymentTerms: null, registrationSubmittedAt: new Date(), service: "Office supplies", notes: null, isActive: true },
  { id: "preview-vendor-2", directoryType: "vendor", companyName: "Evergreen Facilities", personName: "Test Vendor Four", firstName: "Test", lastName: "Vendor Four", cellNo: "9876500014", alternateNo: null, email: "vendor.four@example.invalid", category: "Facility management", utility: "Housekeeping", amcOnCall: "AMC", addressLine1: null, addressLine2: null, addressLine3: null, addressLine4: null, pincode: null, gstNo: null, panNo: null, gstName: null, bankDetails: {}, contact1Name: null, contact1CellNo: null, contact1Email: null, contact2Name: null, contact2CellNo: null, contact2Email: null, attachments: {}, rateNegotiated: null, paymentTerms: null, registrationSubmittedAt: null, service: "Facility management", notes: "Registration pending", isActive: true },
  { id: "preview-vendor-3", directoryType: "vendor", companyName: "Test IT Services", personName: "Test Contact Four", cellNo: "7000000004", alternateNo: null, email: "vendor.four@example.test", contact2Name: "Test Contact Five", contact2CellNo: "7000000005", contact2Email: "vendor.five@example.test", service: "IT support", notes: null, isActive: true },
  { id: "preview-consultant-1", directoryType: "hr_consultant", companyName: "Test HR Advisory", personName: "Test Consultant One", cellNo: "7000000006", alternateNo: null, email: "consultant.one@example.test", contact2Name: null, contact2CellNo: null, contact2Email: null, service: "HR consulting", notes: null, isActive: true },
  { id: "preview-consultant-2", directoryType: "hr_consultant", companyName: "Test Talent Partners", personName: "Test Consultant Two", cellNo: "7000000007", alternateNo: null, email: "consultant.two@example.test", contact2Name: "Test Contact Six", contact2CellNo: "7000000008", contact2Email: "consultant.six@example.test", service: "Recruitment", notes: null, isActive: true },
];

const DIRECTORY_PREVIEW_EMPLOYEES: EmployeeContactRow[] = [
  { id: "preview-employee-1", name: "Ananya Shah", firstName: "Ananya", lastName: "Shah", designation: "HR Executive", cell: "9876500021", email: "ananya.personal@example.invalid", contact1Name: "Rajesh Shah", contact1Cell: "9876500022", contact2Name: "Meera Shah", contact2Cell: "9876500023", isActive: true },
  { id: "preview-employee-2", name: "Kabir Mehta", firstName: "Kabir", lastName: "Mehta", designation: "Operations Executive", cell: "9876500024", email: "kabir.personal@example.invalid", contact1Name: "Sunita Mehta", contact1Cell: "9876500025", contact2Name: "Amit Mehta", contact2Cell: "9876500026", isActive: true },
];

export default async function HrDirectoryPage() {
  await requireHrStaff();
  let contacts, employees;
  try {
    [contacts, employees] = await Promise.all([listDirectoryContacts(), listEmployeeContacts()]);
  } catch (error) {
    if (!isMissingRegisterTable(error)) throw error;
    return <PageShell width="full"><HrTitleBar /><HrDirectory contacts={DIRECTORY_PREVIEW_CONTACTS} employees={DIRECTORY_PREVIEW_EMPLOYEES} preview /></PageShell>;
  }
  const preview = process.env.NODE_ENV === "development" && contacts.length === 0;
  return (
    <PageShell width="full">
      <HrTitleBar />
      <HrDirectory contacts={preview ? DIRECTORY_PREVIEW_CONTACTS : contacts} employees={preview ? DIRECTORY_PREVIEW_EMPLOYEES : employees} preview={preview} />
    </PageShell>
  );
}
