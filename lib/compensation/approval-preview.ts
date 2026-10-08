import type { ApprovalRow } from "./workflow";

/**
 * Development-only approval records used when the local workflow database is
 * unavailable or contains no approval items. These never reach production.
 */
export const APPROVAL_PREVIEW_ROWS: ApprovalRow[] = [
  {
    kind: "attendance",
    subjectId: "0d100001-0000-4000-8000-000000000001",
    employeeId: "0d200001-0000-4000-8000-000000000001",
    employeeName: "Test Employee Alpha",
    periodMonth: "2026-10",
    label: "Monthly attendance · 21.5 worked days",
    amount: 0,
    status: "pending",
    note: null,
    daily: [
      { date: "2026-10-01", day: 1, code: "P", checkIn: "2026-10-01T04:35:00.000Z", checkOut: "2026-10-01T13:10:00.000Z", workedMinutes: 515 },
      { date: "2026-10-02", day: 2, code: "P", checkIn: "2026-10-02T04:40:00.000Z", checkOut: "2026-10-02T13:05:00.000Z", workedMinutes: 505 },
    ],
  },
  {
    kind: "incentive",
    subjectId: "0d100002-0000-4000-8000-000000000002",
    employeeId: "0d200002-0000-4000-8000-000000000002",
    employeeName: "Test Employee Bravo",
    periodMonth: "2026-10",
    label: "Incentive request · Business development",
    amount: 7500,
    status: "pending",
    note: null,
    daily: [],
  },
  {
    kind: "reimbursement",
    subjectId: "0d100003-0000-4000-8000-000000000003",
    employeeId: "0d200003-0000-4000-8000-000000000003",
    employeeName: "Test Employee Charlie",
    periodMonth: "2026-10",
    label: "Reimbursement claim",
    amount: 1840,
    status: "pending",
    note: null,
    attachmentCount: 0,
    receiptUrl: null,
    daily: [],
  },
  {
    kind: "salary",
    subjectId: "0d100004-0000-4000-8000-000000000004",
    employeeId: "0d200004-0000-4000-8000-000000000004",
    employeeName: "Test Employee Delta",
    periodMonth: "2026-10",
    label: "Monthly salary",
    amount: 48000,
    status: "pending",
    note: null,
    daily: [],
  },
];
