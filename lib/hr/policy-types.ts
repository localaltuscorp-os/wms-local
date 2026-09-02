// HR Policies — client-safe taxonomy (no server imports). The Policies section
// is a company-wide handbook: admins upload versioned policy documents, everyone
// reads. Rows live in the generic `documents` table under the `hr-policies/`
// storage prefix (no new migration) — see lib/hr/sections.ts.

export type PolicyCategory =
  | "code_of_conduct"
  | "leave_attendance"
  | "payroll_benefits"
  | "it_security"
  | "workplace_safety"
  | "hr_general"
  | "other";

export interface PolicyCategoryMeta {
  key: PolicyCategory;
  label: string;
  hint: string;
  accent: string;
}

export const POLICY_CATEGORIES: PolicyCategoryMeta[] = [
  { key: "code_of_conduct", label: "Code of Conduct", hint: "Behaviour, ethics & anti-harassment.", accent: "#E10600" },
  { key: "leave_attendance", label: "Leave & Attendance", hint: "Leave types, holidays & working hours.", accent: "#2563eb" },
  { key: "payroll_benefits", label: "Payroll & Benefits", hint: "Salary, reimbursements & perks.", accent: "#16a34a" },
  { key: "it_security", label: "IT & Security", hint: "Acceptable use, data & device policy.", accent: "#7c3aed" },
  { key: "workplace_safety", label: "Workplace & Safety", hint: "Office, facilities & safety norms.", accent: "#0891b2" },
  { key: "hr_general", label: "HR — General", hint: "Onboarding, exit & general HR policy.", accent: "#b45309" },
  { key: "other", label: "Other", hint: "Any other firm policy.", accent: "#475569" },
];

const BY_KEY = new Map<string, PolicyCategoryMeta>(POLICY_CATEGORIES.map((c) => [c.key, c]));

export function policyCategoryMeta(key: string): PolicyCategoryMeta {
  return BY_KEY.get(key) ?? POLICY_CATEGORIES[POLICY_CATEGORIES.length - 1]!;
}

export function isPolicyCategory(v: string): v is PolicyCategory {
  return BY_KEY.has(v);
}

export const POLICY_CATEGORY_KEYS: PolicyCategory[] = POLICY_CATEGORIES.map((c) => c.key);
