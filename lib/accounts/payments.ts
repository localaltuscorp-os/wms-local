export const PAYMENT_TABS = [
  { id: "reimbursements", label: "Reimbursements", href: "/reimbursements", destination: "Reimbursements", detail: "Review, approve, and record payment for employee reimbursement claims." },
  { id: "incentives", label: "Incentives", href: "/accounts/incentive-payments", destination: "Incentive Payments", detail: "Review approved incentive entries and record their payment status." },
  { id: "salary", label: "Salary", href: "/salary", destination: "Salary", detail: "Manage salary calculations, approvals, and payroll payments." },
  { id: "overtime", label: "Overtime", href: "/overtime", destination: "Overtime", detail: "Review overtime entries and the related payable amounts." },
  { id: "company-expenses", label: "Company Expenses", href: "/reimbursements/dashboard", destination: "Company Expenses Dashboard", detail: "Use the company expense dashboard to review approved spending and payment methods." },
] as const;

export type PaymentTabId = (typeof PAYMENT_TABS)[number]["id"];

export function paymentTabId(value: string | undefined): PaymentTabId {
  return PAYMENT_TABS.some((tab) => tab.id === value) ? value as PaymentTabId : PAYMENT_TABS[0].id;
}
