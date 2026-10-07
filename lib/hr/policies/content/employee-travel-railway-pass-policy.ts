import { DEFAULT_ADDRESS_LINE } from "@/lib/hr/entities";
import { type PolicyDoc, declaration, heading, p, ul } from "@/lib/hr/policies/types";

const employeeTravelRailwayPassPolicy: PolicyDoc = {
  key: "employee-travel-railway-pass-policy",
  title: "Employee Travel & Railway Pass Policy",
  docCode: "HR-POL-007",
  effectiveDate: "1 October 2026",
  version: "1.0",
  owner: "Human Resources / Management",
  registeredOffice: DEFAULT_ADDRESS_LINE,
  hrEmail: "Human Resources Department",
  entityDefault: "altus-corp",
  summary: "Eligibility, approval and reimbursement rules for First Class Railway Pass benefits.",
  sections: [
    heading(
      "Eligibility",
      p("Employees earning less than Rs. 30,000 per month are eligible for First Class Railway Pass reimbursement when their residence is in Naigaon to Virar, or beyond Virar, on the applicable Western Railway route."),
    ),
    heading(
      "Non-Eligibility",
      p("Employees residing before Naigaon towards Churchgate on the Western line are not eligible for a First Class Railway Pass under this policy."),
    ),
    heading(
      "Central and Harbour Line Employees",
      p("Employees residing on the Central Line or Harbour Line will be considered for a First Class Railway Pass based on residential location, commuting distance and Management's discretion."),
    ),
    heading(
      "Management Discretion",
      p("Approval and continuation of the First Class Railway Pass are subject to Management's discretion. Management may approve, decline, modify or withdraw the travel benefit based on individual circumstances, business requirements or company policy."),
    ),
    heading(
      "Pass Reimbursement",
      p("Railway Pass reimbursement will be processed after the employee uploads the pass in the Altus OS Reimbursement section."),
    ),
    heading(
      "Policy Terms",
      ul(
        "The pass is strictly for the eligible employee and is non-transferable.",
        "Providing incorrect information about salary or residential address may result in withdrawal of the benefit.",
      ),
    ),
  ],
  declaration: declaration(),
};

export default employeeTravelRailwayPassPolicy;
