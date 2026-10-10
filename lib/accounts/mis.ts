export const MIS_TABS = [
  { id: "bank-balance", label: "Bank Balance Tracker", href: "/accounts/bank-balance", destination: "Bank Balance Master", detail: "Review weekly closing balances, targets, and shortfalls by account." },
  { id: "interpersonal-balance", label: "Interpersonal Balance", href: "/accounts/vasa-family-interpersonal", destination: "Interpersonal Balances", detail: "Track what each family entity owes or is due to receive." },
  { id: "cash-withdrawal", label: "Cash Withdrawal", href: "/accounts/cash-withdrawal", destination: "Cash Withdrawal Tracker", detail: "Record cheque withdrawals and monitor activity across the financial year." },
  { id: "cash-limits", label: "Cash Limits", href: "/accounts/cash-withdrawal#cash-limits", destination: "Cash Limits", detail: "Set and monitor each entity's annual withdrawal cap and remaining headroom." },
  { id: "loans", label: "Loans Tracker", href: "/accounts/sip-tracker#loans-tracker", destination: "Loans Tracker", detail: "Track loan details, EMI amounts, and closing balances by period." },
  { id: "credit-cards", label: "Credit Cards Master", href: "/accounts/cc-tracker", destination: "Credit Cards Master", detail: "Manage card statements, payments, tallying, and charges." },
  { id: "sip", label: "SIP Master", href: "/accounts/sip-tracker", destination: "SIP Tracker", detail: "Maintain scheduled SIP contributions and their financial-year totals." },
  { id: "shares", label: "Shares Master", href: "/accounts/shares-register", destination: "Shares Master", detail: "Maintain shareholdings and transactions by entity." },
  { id: "mutual-funds", label: "Mutual Funds Master", href: "/accounts/sip-tracker", destination: "Mutual Funds Master", detail: "Use the mutual-fund SIP register to maintain funds, dates, types, and contributions." },
  { id: "fno", label: "FNO Tracker", href: "/accounts/fno-income", destination: "FNO Income Master", detail: "Track F&O capital, monthly income, and return on capital." },
  { id: "ca-handover", label: "CA Handover", href: "/accounts/ca-handover", destination: "CA Handover", detail: "Access the CA credential vault and the returns archive." },
  { id: "estimated-pnl", label: "Estimated PNL", href: "/accounts/fno-income", destination: "FNO Tracker", detail: "Use the monthly F&O income tracker as the working estimated P&L view." },
  { id: "last-three-year-bs", label: "Last 3 Year BS", href: "/accounts/ca-handover", destination: "Returns Archive", detail: "Open the CA returns archive for balance sheets from the last three financial years." },
] as const;

export type MisTabId = (typeof MIS_TABS)[number]["id"];

export function misTabId(value: string | undefined): MisTabId {
  return MIS_TABS.some((tab) => tab.id === value) ? value as MisTabId : MIS_TABS[0].id;
}
