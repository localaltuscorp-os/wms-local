import "server-only";

import type { Employee } from "@/db/schema";
import type { LookupCategory } from "@/lib/billing/lookup-categories";

/**
 * THE DROPDOWN MASTER'S REGISTRY.
 *
 * Every editable list on the Customer KYC form is declared here once: its key
 * (which is `billing_lookups.kind`), the heading it sits under, what it feeds,
 * and the options it starts life with.
 *
 * WHY A REGISTRY AND NOT A TABLE OF LISTS. The options live in the database
 * because people add to them; the LISTS themselves do not, because a list only
 * exists if a field on the form reads it. A `billing_lookup_kinds` table would
 * let someone create a list that nothing renders — a row that looks like
 * configuration and changes nothing — and would still need this file to say
 * which form field each one drives. Declaring them in code keeps the two ends
 * of that wire in one place.
 *
 * ADDING A LIST is adding an entry here. No migration: `kind` is just text.
 */

/* The category names live in a client-safe module so the master screen (a
   client component) can read the order without pulling this server-only file
   into the browser bundle. Re-exported here so every existing import of
   `LookupCategory` / `LOOKUP_CATEGORIES` from this file keeps working. */
export { LOOKUP_CATEGORIES } from "@/lib/billing/lookup-categories";
export type { LookupCategory } from "@/lib/billing/lookup-categories";

export interface LookupList {
  /** Stored in `billing_lookups.kind`. Never change one after it has options. */
  kind: string;
  label: string;
  category: LookupCategory;
  /** Shown under the title on the master, saying which field this drives. */
  hint: string;
  /** Long lists get a search box on the card rather than a 400-row scroll. */
  searchable?: boolean;
  /**
   * Restricted lists may only be added to by Accounts or by Manan Vasa.
   * See `canEditLookup` for why these two and nothing else.
   */
  restricted?: boolean;
  /** Seeded on first use. Not written to the database until someone saves. */
  defaults: string[];
}

/*
 * Lists for fields REMOVED from the KYC form are removed here too (Manan,
 * 2026-09-19): Freight Charges, Credit Limit, Quantity Deviation, Transporter.
 * Their saved options stay in billing_lookups untouched (clients that picked
 * one keep the value); they are simply no longer offered or edited.
 */
export const LOOKUP_LISTS: LookupList[] = [
  {
    kind: "designation",
    label: "Designation",
    category: "People",
    hint: "Contact person job titles.",
    defaults: [
      "Founder",
      "Partner",
      "MD",
      "CEO",
      "Proprietor",
      "Chairman",
      "Head",
      "EA to MD",
      "Director",
      "HR Head",
      "President",
      "VP",
      "Owner's Son",
      "General Manager",
      "Co-Founder",
      "Managing Director",
      "COO",
      "Business Owner",
      "Manager",
      "Consultant / Advisor",
      "Other",
    ],
  },

  {
    kind: "payment_terms",
    label: "Payment Terms",
    category: "Commercial Terms",
    hint: "Commercial & Credit → Payment Terms.",
    defaults: [
      "100% Advance",
      "Against Delivery",
      "50% Advance, 50% on Delivery",
      "30 Days Credit",
      "45 Days Credit",
      "60 Days Credit",
      "As per PO",
    ],
  },

  {
    kind: "department",
    label: "Department",
    category: "People",
    hint: "Contact person departments. \"Others\" lets the form take a typed one.",
    defaults: [
      "Management",
      "Finance",
      "Accounts",
      "Production",
      "HR",
      "IT",
      "Admin",
      "Purchase",
      "QC",
      "Others",
    ],
  },

  {
    kind: "business_category",
    label: "Business Category",
    category: "Customer",
    hint: "What kind of business the client is — Identity section of the KYC.",
    defaults: [
      "Corporate",
      "SME",
      "MSME",
      "Manufacturer",
      "B2B Trader",
      "E-Commerce Business",
      "Wholeseller",
      "Retailer",
      "Agency Business",
      "Professional",
      "Start Up",
      "Freelancer",
      "Solopreneur",
      "Govt Sector",
      "Service Provider",
      "B2C Trader",
      "Student",
      "Other",
    ],
  },
  {
    kind: "credit_days",
    label: "Credit Days",
    category: "Commercial Terms",
    hint: "Commercial & Credit → Credit Days.",
    defaults: ["0", "7", "15", "30", "45", "90"],
  },

  {
    kind: "account_type",
    label: "Account Type",
    category: "Banking",
    hint: "Bank Details → Account Type.",
    defaults: ["Savings", "Current", "Cash Credit", "Overdraft", "NRE", "NRO", "FCNR", "Escrow"],
  },
  {
    kind: "bank_name",
    label: "Bank Name",
    category: "Banking",
    hint: "Bank Details → Bank Name (searchable).",
    searchable: true,
    defaults: [
      "State Bank of India",
      "Punjab National Bank",
      "Bank of Baroda",
      "Canara Bank",
      "Union Bank of India",
      "Indian Bank",
      "Indian Overseas Bank",
      "UCO Bank",
      "Bank of India",
      "Central Bank of India",
      "HDFC Bank",
      "ICICI Bank",
      "Axis Bank",
      "Kotak Mahindra Bank",
      "IndusInd Bank",
      "Yes Bank",
      "IDFC First Bank",
      "Federal Bank",
      "RBL Bank",
      "Bandhan Bank",
    ],
  },


  {
    kind: "state",
    label: "State",
    category: "Location & Currency",
    hint: "The State dropdown on client addresses.",
    searchable: true,
    defaults: [
      "Andhra Pradesh",
      "Arunachal Pradesh",
      "Assam",
      "Bihar",
      "Chhattisgarh",
      "Goa",
      "Gujarat",
      "Haryana",
      "Himachal Pradesh",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Madhya Pradesh",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Mizoram",
      "Nagaland",
      "Odisha",
      "Punjab",
      "Rajasthan",
      "Sikkim",
      "Tamil Nadu",
      "Telangana",
      "Tripura",
      "Uttar Pradesh",
      "Uttarakhand",
      "West Bengal",
      "Andaman and Nicobar Islands",
      "Chandigarh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Delhi",
      "Jammu and Kashmir",
      "Ladakh",
      "Lakshadweep",
      "Puducherry",
    ],
  },
  {
    kind: "country",
    label: "Country",
    category: "Location & Currency",
    hint: "The Country dropdown (Registration & Tax + addresses).",
    searchable: true,
    defaults: [
      "India",
      "USA",
      "UK",
      "UAE",
      "Australia",
      "Canada",
      "China",
      "Germany",
      "France",
      "Japan",
      "Singapore",
      "Malaysia",
      "Netherlands",
      "Italy",
      "Spain",
      "Switzerland",
    ],
  },
  {
    kind: "currency",
    label: "Currency",
    category: "Location & Currency",
    hint: "The Currency dropdown (Registration & Tax).",
    searchable: true,
    defaults: ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "CNY", "JPY", "SGD", "CHF"],
  },

  /* ── THE TWO NEW LISTS (Manan, 2026-09-17) ─────────────────────────────
     "Make Product Description & Service Description Drop Down Masters in the
     Billing Module left panel."

     RESTRICTED, unlike every list above. These two feed what is printed on a
     tax invoice, and a description on an issued invoice is not a preference —
     it is the wording a customer and an auditor read. Anyone may add a
     transporter; only Accounts and Manan may add a line that can appear on a
     document going out of the company. */
  {
    kind: "product_description",
    label: "Product Description",
    category: "Descriptions",
    hint: "Product lines on a document. Accounts and Manan Vasa may add.",
    restricted: true,
    searchable: true,
    defaults: [],
  },
  {
    kind: "service_description",
    label: "Service Description",
    category: "Descriptions",
    hint: "Service lines on a document. Accounts and Manan Vasa may add.",
    restricted: true,
    searchable: true,
    defaults: ["Fees for Technical Services", "Management Consultancy", "Retainer Fees"],
  },
];



export function lookupList(kind: string): LookupList | undefined {
  return LOOKUP_LISTS.find((l) => l.kind === kind);
}

/**
 * MAY THIS PERSON ADD TO THIS LIST?
 *
 * Every list is open except the two description masters, which are restricted
 * to Accounts and to Manan Vasa — his call, and the reason is above: those two
 * lists are the only ones whose options get printed on a document that leaves
 * the company.
 *
 * "Accounts" is read from the person's DEPARTMENT rather than a hardcoded list
 * of addresses, so somebody joining or leaving that team needs no code change.
 * The one address that is named is the owner's, because "Manan Vasa" is a
 * person and not a department, and he is already the app's super admin.
 *
 * Admins pass because an admin who cannot edit a dropdown has to ask somebody
 * else to, which is not a permission model anybody follows for long.
 */
export function canEditLookup(list: LookupList, me: Employee, departments: string[]): boolean {
  if (!list.restricted) return true;
  if (me.isAdmin) return true;
  return departments.some((d) => d.trim().toLowerCase() === "accounts");
}
