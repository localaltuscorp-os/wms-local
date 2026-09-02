/**
 * Data-driven registry for the Accounts module's Index. Reorder/add sections by
 * editing this one array — the Index page and routing read from it, no other
 * code changes needed. `status: "built"` renders the real section; `"stub"`
 * renders a clean, ready-to-extend scaffold pre-seeded with the source columns.
 */
export interface AccountsSection {
  /** URL slug → /accounts/<slug> */
  slug: string;
  /** Display order on the Index. */
  order: number;
  title: string;
  blurb: string;
  /**
   * `built` renders a real section under /accounts/<slug>; `stub` renders a
   * ready-to-extend scaffold; `link` is a real, already-built feature that lives
   * elsewhere in the app — the card (and the /accounts/<slug> route) sends the
   * user straight to `href`.
   */
  status: "built" | "stub" | "link";
  /** Destination for `status: "link"` sections (an in-app route). */
  href?: string;
  /** CA Handover etc. — restricted to admins only within the module. */
  sensitive?: boolean;
  /** Source columns (from the master sheet) — drives the stub preview. */
  columns?: string[];
}

export const ACCOUNTS_SECTIONS: AccountsSection[] = [
  // NOTE: the "Accounts Task List" section was removed — its tasks were migrated
  // into the WMS task list (Doer: Siddhesh Walve, Initiator: Manan Vasa,
  // Subject: "Accounts") so accounts work lives in one place. See
  // scripts/migrate-accounts-tasks.ts.
  {
    slug: "weekly-checklist",
    order: 2,
    title: "Weekly Checklist",
    blurb: "Recurring weekly compliance items — tick each week of the month (Wk1–Wk5) as Done / Pending / Need Help.",
    status: "built",
  },
  {
    slug: "monthly-quarterly-annual",
    order: 3,
    title: "Quarter / Month / Annual Checklist",
    blurb: "Monthly, quarterly and annual things to get done — tick each month of the financial year (Apr–Mar) as Done / Pending / Need Help.",
    status: "built",
  },
  {
    slug: "cc-tracker",
    order: 4,
    title: "Credit Cards Master",
    blurb: "Per-card statement, payment, tally & charges tracking — pick a month of the financial year (Apr–Mar). Covers all FYs via the year navigator.",
    status: "built",
  },
  {
    slug: "due-dates",
    order: 5,
    title: "Due Dates Checklist",
    blurb: "Recurring bills & statutory items by area — frequency, statement period, due date, ECS and payment status.",
    status: "built",
  },
  {
    slug: "sip-tracker",
    order: 6,
    title: "SIP Tracker",
    blurb: "Mutual-fund SIPs by entity — monthly contributions across the financial year (Apr–Mar) with a running YTD total.",
    status: "built",
  },
  {
    slug: "collection-master",
    order: 7,
    title: "Collection Master",
    blurb: "Income & collections — this is the live Outstanding & Collections tracker (receipts by person, source, mode, entity, GST/TDS). Opens the full dashboard.",
    status: "link",
    href: "/outstanding",
  },
  {
    slug: "fno-income",
    order: 8,
    title: "FNO Income Master",
    blurb: "F&O income by entity & agency — monthly Rs income across the financial year (Apr–Mar) with the % return on capital derived automatically.",
    status: "built",
  },
  {
    slug: "bank-balance",
    order: 9,
    title: "Bank Balance Tracker",
    blurb: "Weekly closing balances per account vs the target balance — the latest snapshot shows who's short and by how much.",
    status: "built",
  },
  {
    slug: "cash-withdrawal",
    order: 10,
    title: "Cash Withdrawal Tracker",
    blurb: "Cheque withdrawals by entity across the financial year (Apr–Mar), with each entity's annual cap and remaining headroom.",
    status: "built",
  },
  {
    slug: "vasa-family-interpersonal",
    order: 11,
    title: "Vasa Family Interpersonal Balance",
    blurb: "Who owes / receives what between family entities, with the net position per party.",
    status: "built",
  },
  {
    slug: "cc-tracker-2026-27",
    order: 12,
    title: "CC Master — FY 2026-27",
    blurb: "Credit Cards Master for FY 2026-27 — opens the CC Master on the 2026-27 financial year.",
    status: "link",
    href: "/accounts/cc-tracker?fy=2026",
  },
  {
    slug: "shares-register",
    order: 13,
    title: "Shares Register",
    blurb: "Register of shareholdings & share transactions per entity — quantity, rate, value, folio/demat.",
    status: "built",
  },
  {
    slug: "ca-handover",
    order: 14,
    title: "CA Handover — Logins, Passwords & Govt Portals",
    blurb: "Secure vault of portal credentials (Income Tax, GST, TDS, Professional Tax, MLWF) and the filed-returns document archive.",
    status: "built",
    sensitive: true,
  },
  {
    slug: "income-tax-master-folder",
    order: 15,
    title: "Last 3–5 Years Income Tax Master Folder",
    blurb: "Links to the income-tax record folders for the last 3–5 years, per entity.",
    status: "built",
  },
];

export function getAccountsSection(slug: string): AccountsSection | undefined {
  return ACCOUNTS_SECTIONS.find((s) => s.slug === slug);
}
