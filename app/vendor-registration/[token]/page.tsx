import { notFound } from "next/navigation";
import { VendorRegistrationForm } from "@/components/hr/directory/vendor-registration-form";
import { resolveVendorRegistration } from "@/lib/hr/vendor-registration";

export const dynamic = "force-dynamic";

export default async function VendorRegistrationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ record?: string }> }) {
  const { token } = await params;
  if (token === "preview") {
    const { record } = await searchParams;
    const secondary = record === "preview-vendor-2";
    return <VendorRegistrationForm preview token={token} contact={secondary ? { firstName: "Riya", lastName: "Kapoor", cellNo: "9876500014", companyName: "Evergreen Facilities", category: "Facility management", utility: "Housekeeping", amcOnCall: "AMC", email: "riya@evergreen.example.invalid", addressLine1: "18 Trade Centre", addressLine2: "Powai", addressLine3: "Mumbai", addressLine4: "Maharashtra", pincode: "400076", gstNo: "27FGHIJ5678K1Z2", panNo: "FGHIJ5678K", gstName: "Evergreen Facilities Pvt Ltd", bankDetails: { accountName: "Evergreen Facilities", accountNo: "987654321012", accountType: "Current", micrCode: "400003002", branchAddress: "Powai, Mumbai", pincode: "400076" }, contact1Name: "Vikram Kapoor", contact1CellNo: "9876500015", contact1Email: "vikram@evergreen.example.invalid", contact2Name: "Nisha Patel", contact2CellNo: "9876500016", contact2Email: "nisha@evergreen.example.invalid" } : { firstName: "Aarav", lastName: "Sharma", cellNo: "9876500011", companyName: "Northstar Office Services", category: "Office supplies", utility: "Stationery and printing", amcOnCall: "On-call", email: "aarav@northstar.example.invalid", addressLine1: "24 Business Park", addressLine2: "Andheri East", addressLine3: "Mumbai", addressLine4: "Maharashtra", pincode: "400093", gstNo: "27ABCDE1234F1Z5", panNo: "ABCDE1234F", gstName: "Northstar Office Services Pvt Ltd", bankDetails: { accountName: "Northstar Office Services", accountNo: "012345678901", accountType: "Current", micrCode: "400002001", branchAddress: "Andheri East, Mumbai", pincode: "400093" }, contact1Name: "Neha Sharma", contact1CellNo: "9876500012", contact1Email: "neha@northstar.example.invalid", contact2Name: "Rohan Shah", contact2CellNo: "9876500013", contact2Email: "rohan@northstar.example.invalid" }} />;
  }
  const context = await resolveVendorRegistration(token);
  if (!context) notFound();
  return <VendorRegistrationForm token={token} contact={context.contact} />;
}
