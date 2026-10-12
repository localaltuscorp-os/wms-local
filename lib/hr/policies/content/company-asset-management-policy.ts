import { DEFAULT_ADDRESS_LINE } from "@/lib/hr/entities";
import { type PolicyDoc, declaration, heading, p, table, ul } from "@/lib/hr/policies/types";

const companyAssetManagementPolicy: PolicyDoc = {
  key: "company-asset-management-policy",
  title: "Company Asset Management Policy",
  docCode: "HR-POL-008",
  effectiveDate: "1 July 2026",
  version: "1.0",
  owner: "Human Resources / Administration / IT",
  registeredOffice: DEFAULT_ADDRESS_LINE,
  hrEmail: "Human Resources Department",
  entityDefault: "altus-corp",
  summary: "Rules for issuing, using, protecting, tracking and returning company-owned assets.",
  sections: [
    heading(
      "Purpose",
      p("This policy ensures the proper issuance, usage, security, tracking, maintenance and return of company-owned assets provided to employees for official business purposes."),
    ),
    heading(
      "Scope",
      p("This policy applies to every employee provided with company assets, including:"),
      ul("Laptops and computers", "Mobile phones and SIM cards", "Chargers and other accessories", "Other company-owned equipment issued for business use"),
    ),
    heading(
      "Asset Issuance",
      p("Every company asset issued to an employee will be recorded in the asset register and acknowledged by the employee. The employee confirms that issued assets have been received in good working condition unless otherwise recorded."),
    ),
    heading(
      "Proper Use and Employee Responsibility",
      p("Employees are responsible for the proper use, security and safekeeping of company assets. Employees must:"),
      ul(
        "Use company assets primarily for authorised business purposes.",
        "Take reasonable care of all assigned assets.",
        "Keep laptops and phones secure while travelling, working in the field or visiting customers.",
        "Not lend, sell, transfer or allow unauthorised people to use company assets.",
        "Not install unauthorised software or applications, or disable company security controls.",
        "Immediately report loss, theft, damage or security incidents to HR, IT or the Reporting Manager.",
        "Return all assets and accessories when requested or upon resignation, termination, transfer or completion of employment.",
      ),
    ),
    heading(
      "Data Safety and Confidentiality",
      p("Company laptops and phones may contain confidential company and customer information. Employees must:"),
      ul(
        "Keep company and customer information confidential.",
        "Use company data only for authorised business purposes.",
        "Not share passwords, OTPs, login credentials or other security information.",
        "Not transfer company data to personal devices, email accounts, cloud storage or USB drives without authorisation.",
        "Follow company data-security and privacy requirements.",
        "Immediately report suspected data breaches, phishing, malware, unauthorised access, or loss or theft of an asset.",
      ),
      p("Confidentiality obligations continue after separation from the company where applicable."),
    ),
    heading(
      "Asset Tracking and Monitoring",
      p("The company may use authorised asset-management, device-management, security and tracking systems on company-owned devices. Where technically available and permitted by company policy, device status, security compliance and location or last-known location may be monitored for legitimate asset-management, security, loss-prevention, troubleshooting and company-data protection purposes."),
    ),
    heading(
      "Loss, Theft and Damage",
      p("Where loss, theft or damage is attributable to an employee's negligence, misuse or failure to take reasonable care, the following liability may apply:"),
      table({
        columns: ["Asset", "Loss / Theft / Irreparable Damage", "Repairable Damage"],
        rows: [
          ["Laptop", "Rs. 40,000", "Actual repair cost"],
          ["Company Phone", "Rs. 20,000", "Actual repair cost"],
        ],
      }),
      ul(
        "Loss, theft or damage must be reported immediately.",
        "For theft, the employee may be required to file a police complaint and provide the report to the company.",
        "Normal wear and tear is not employee liability.",
        "The company may remotely lock, disable, track or wipe company devices where technically possible and permitted by company policy.",
        "Any recovery from an employee remains subject to employment terms, applicable policies and applicable law.",
      ),
    ),
    heading(
      "Asset Return",
      p("Employees must return all company assets and accessories in their possession upon resignation, termination, transfer, extended leave or whenever requested. The company may inspect returned assets and update the asset register accordingly."),
    ),
    heading(
      "Non-Compliance",
      p("Failure to comply with this policy may result in appropriate disciplinary or administrative action under company rules and applicable law."),
    ),
  ],
  declaration: declaration({
    statement: "I confirm that I have read, understood and agree to comply with the Company Asset Management Policy. I understand my responsibility for the proper use, security, confidentiality and safekeeping of company assets issued to me.",
  }),
};

export default companyAssetManagementPolicy;
