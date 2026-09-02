import type { FormFieldDef } from "./field-types";

/**
 * The four Ecosystem "subject" modules rebuilt natively. Each has a request
 * form (filled by any employee) and an admin response form (manual fields the
 * admin fills while processing). Both field lists are admin-editable — these
 * are just the defaults used until an override is saved.
 */

export type ModuleKey = "reimbursement" | "leave" | "reference" | "breakthrough";

export const MODULE_KEYS: ModuleKey[] = ["reimbursement", "leave", "reference", "breakthrough"];

export interface ModuleDef {
  key: ModuleKey;
  /** Route segment, e.g. /reimbursements. */
  path: string;
  title: string;
  subtitle: string;
  /** CTA that opens the request form. */
  buttonLabel: string;
  /** lucide-react icon name, resolved in the nav/page. */
  icon: string;
  requestFields: FormFieldDef[];
  adminFields: FormFieldDef[];
}

/* Admin manual-field option lists (verbatim from the spec). */

const PAID_THROUGH = ["98207 GPay", "Cash", "Bank Transfer"];

const EXPENSE_HEAD = [
  "Conveyance",
  "Miscellaneous Expenses",
  "Printing & Stationery",
  "Repairs & Maintenance",
  "Staff Welfare",
  "Workshop Expenses",
  "Cell Phone Recharge",
  "Manan Sir Personal",
  "Suspense",
  "Other",
];

const TALLY_ENTITY = [
  "Altus Corp",
  "Colour Graphics",
  "Dharav",
  "JSV HUF",
  "Khushboo Shah",
  "MJV HUF",
  "Unleashed",
];

const DESIGNATION = [
  "CEO",
  "Director",
  "Partner",
  "Proprietor",
  "Founder",
  "MD",
  "Employee",
  "Committee Mem",
];

const BUSINESS_CATEGORY = [
  "Agent",
  "B2B Trader",
  "B2C Trader",
  "Corporate",
  "Distributor",
  "ECommerce",
  "Individual Business",
  "Freelancer",
  "MSME",
  "Professional",
  "Service Provider",
  "SME",
  "Start Up",
  "Trade Association",
  "Developer",
  "Retail",
  "Wholesale",
  "Manufacturer",
];

const PROPOSED_SOLUTION = [
  "2 Day Workshop",
  "Collaboration",
  "BSS",
  "Consulting",
  "Group Consulting",
  "Inhouse PSO",
  "Key Note",
  "PS",
  "Being Arjun",
];

/**
 * Sentinel option used by the admin "Assign Salesperson" field — the page
 * swaps it for the live list of Sales-department employees at render time.
 */
export const SALESPERSON_FIELD_KEY = "assign_salesperson";

export const MODULES: Record<ModuleKey, ModuleDef> = {
  reimbursement: {
    key: "reimbursement",
    path: "/reimbursements",
    title: "Reimbursements",
    subtitle: "Raise an expense for reimbursement and track its approval.",
    buttonLabel: "Request Reimbursement",
    icon: "Receipt",
    requestFields: [
      { key: "expense_for", label: "Expense For", type: "text", required: true, placeholder: "What was this spend for?" },
      { key: "amount", label: "Amount ₹", type: "number", required: true, placeholder: "e.g. 1500" },
      { key: "expense_date", label: "Expense Date", type: "date", required: true },
      { key: "product", label: "Product Name", type: "product" },
      { key: "bill_url", label: "Bill / Receipt Link", type: "url", placeholder: "Drive / photo link" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    adminFields: [
      { key: "approved", label: "Approved", type: "select", required: true, options: ["Yes", "No"] },
      { key: "payment_date", label: "Payment Date", type: "date", required: true },
      { key: "paid_through", label: "Paid Through", type: "select", required: true, options: PAID_THROUGH },
      { key: "expense_head", label: "Expense Head", type: "select", options: EXPENSE_HEAD },
      { key: "tally_passed_date", label: "Tally Expense Entry Passed Date", type: "date" },
      { key: "tally_entity", label: "Tally Entity", type: "select", options: TALLY_ENTITY },
    ],
  },
  leave: {
    key: "leave",
    path: "/leave-approval",
    title: "Leave Approval",
    subtitle: "Request leave and see whether it's granted.",
    buttonLabel: "Request Leave",
    icon: "CalendarOff",
    requestFields: [
      { key: "leave_type", label: "Leave Type", type: "select", required: true, options: ["Casual Leave", "Sick Leave", "Earned Leave", "Half Day", "Other"] },
      { key: "from_date", label: "From Date", type: "date", required: true },
      { key: "to_date", label: "To Date", type: "date", required: true },
      { key: "reason", label: "Reason", type: "textarea", required: true },
    ],
    adminFields: [
      // `granted` is driven by the Grant / Reject buttons, not a dropdown.
      { key: "paid_leave", label: "Paid Leave", type: "select", options: ["Without Pay", "With Pay"] },
      { key: "leave_notes", label: "Leave Notes", type: "text" },
    ],
  },
  reference: {
    key: "reference",
    path: "/record-reference",
    title: "Record Reference",
    subtitle: "Log a business reference for the sales team to action.",
    buttonLabel: "Record Reference",
    icon: "Contact",
    requestFields: [
      { key: "reference_name", label: "Reference Name", type: "text", required: true },
      { key: "organisation", label: "Organisation", type: "text" },
      { key: "cell", label: "Cell No", type: "tel", placeholder: "+91 XXXXX XXXXX" },
      { key: "email", label: "Email", type: "email" },
      { key: "product", label: "Product Name", type: "product" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    adminFields: [
      { key: SALESPERSON_FIELD_KEY, label: "Assign Salesperson", type: "select", required: true, options: [] },
      { key: "designation", label: "Designation", type: "select", options: DESIGNATION },
      { key: "business_category", label: "Business Category", type: "select", options: BUSINESS_CATEGORY },
      { key: "nature_of_business", label: "Nature of Business", type: "text" },
      { key: "proposed_solution", label: "Proposed Solution", type: "select", options: PROPOSED_SOLUTION },
    ],
  },
  breakthrough: {
    key: "breakthrough",
    path: "/participant-breakthrough",
    title: "Participant Breakthrough",
    subtitle: "Capture a participant's breakthrough moment.",
    buttonLabel: "Add",
    icon: "Sparkles",
    requestFields: [
      { key: "participant_first_name", label: "Participant First Name", type: "text", required: true },
      { key: "participant_last_name", label: "Participant Last Name", type: "text" },
      { key: "workshop", label: "Workshop Name", type: "text" },
      { key: "batch_no", label: "Batch No", type: "text" },
      { key: "product", label: "Product Name", type: "product" },
      { key: "breakthrough", label: "Breakthrough", type: "textarea", required: true, placeholder: "What shifted for them?" },
    ],
    adminFields: [
      { key: "admin_notes", label: "Notes", type: "text" },
    ],
  },
};

export function moduleByPath(path: string): ModuleDef | undefined {
  return Object.values(MODULES).find((m) => m.path === path);
}
