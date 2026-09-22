import "server-only";
import * as s from "@/db/schema";
import { WORKSPACE_LABEL, type WorkspaceId } from "@/lib/workspaces";
import { tableTab, type TableTabSpec } from "./table-dataset";
import type { ModuleBackup } from "./types";

/**
 * WHAT EACH MODULE CONTAINS.
 *
 * One entry per hub room, one tab per table. Declared rather than queried by
 * hand: lib/modules/backup/table-dataset.ts turns each line below into a sheet,
 * drops the credential columns whatever anyone writes here, and copies the
 * files a row points at.
 *
 * ── `changedAt` IS NOT DECORATION ──────────────────────────────────────────
 * It decides what a nightly export can promise. `updatedAt` catches edits as
 * well as new rows. A created-only column catches new rows ONLY: an old row
 * corrected today does not appear until the next full export. Omitting it makes
 * the tab a snapshot, exported whole every night — right for a small lookup
 * table, wrong for anything per-employee-per-day.
 *
 * The audit of the schema (21 Sep) found many tables with no edit stamp —
 * `employees`, `leave_requests`, `attendance_logs`, every *_events log — so
 * each line says what its table can actually support, and the page tells the
 * person which tabs are new-rows-only.
 */

function tabs(list: readonly TableTabSpec[]) {
  return list.map(tableTab);
}

/** Tables whose every row is per employee per day: capped, newest first. */
const DAILY = 200_000;

const MODULES: Record<WorkspaceId, readonly TableTabSpec[]> = {
  wms: [
    { tab: "Tasks", key: "tasks", table: s.tasks, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Task attachments", key: "task-attachments", table: s.taskAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "Task history", key: "task-events", table: s.taskEvents, changedAt: "createdAt" },
    { tab: "Task checklists", key: "task-checklist", table: s.taskChecklistItems, changedAt: "createdAt" },
    { tab: "Time on tasks", key: "task-time", table: s.taskTimeRollup, changedAt: "updatedAt" },
    { tab: "Work sessions", key: "task-sessions", table: s.taskWorkSessions, changedAt: "createdAt" },
    { tab: "Documents", key: "documents", table: s.documents, changedAt: "updatedAt", alsoChangedAt: "createdAt", files: [{ path: "storagePath", name: "title" }] },
    { tab: "Important links", key: "index-links", table: s.indexLinks, changedAt: "updatedAt" },
  ],

  hr: [
    { tab: "Dossier documents", key: "employee-documents", table: s.employeeDocuments, changedAt: "updatedAt", alsoChangedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "Onboarding forms", key: "onboarding", table: s.onboardingSubmissions, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Agreements", key: "agreements", table: s.agreements, changedAt: "updatedAt", files: [{ path: "signedPdfPath" }, { path: "pdfPath" }] },
    { tab: "Signatures", key: "doc-signatures", table: s.documentSignatures, changedAt: "updatedAt", files: [{ path: "signedPdfPath" }, { path: "signatureImagePath" }] },
    { tab: "Letters issued", key: "letters", table: s.documentInstances, changedAt: "updatedAt", files: [{ path: "renderedPdfPath" }] },
    { tab: "Letter templates", key: "letter-templates", table: s.letterTemplates, changedAt: "updatedAt" },
    { tab: "Policies", key: "policies", table: s.policyDocuments, changedAt: "updatedAt" },
    { tab: "Policy versions", key: "policy-versions", table: s.policyVersions, changedAt: "createdAt" },
    { tab: "Policy signatures", key: "policy-signatures", table: s.employeePolicySignatures, changedAt: "createdAt", files: [{ path: "signaturePath" }] },
    { tab: "Help desk tickets", key: "hr-tickets", table: s.hrTickets, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Ticket messages", key: "hr-ticket-messages", table: s.hrTicketMessages, changedAt: "createdAt" },
    { tab: "Ticket attachments", key: "hr-ticket-files", table: s.hrTicketAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "Candidates", key: "candidates", table: s.candidateIntake, changedAt: "updatedAt", files: [{ path: "photoPath" }, { path: "signaturePath" }] },
    { tab: "Exits", key: "exits", table: s.employeeExits, changedAt: "archivedAt" },
    { tab: "CTC breakups", key: "ctc-breakups", table: s.ctcBreakups, changedAt: "updatedAt" },
    { tab: "Assets", key: "hr-assets", table: s.hrAssets, changedAt: "updatedAt", files: [{ path: "photoPath" }, { path: "invoicePath" }] },
    { tab: "Contacts", key: "hr-contacts", table: s.hrContacts, changedAt: "updatedAt" },
    { tab: "Holidays", key: "holidays", table: s.holidays, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
  ],

  employees: [
    { tab: "Employees", key: "employees", table: s.employees, changedAt: "createdAt" },
    { tab: "Departments", key: "departments", table: s.employeeDepartments, changedAt: "updatedAt" },
    { tab: "Attendance punches", key: "attendance-logs", table: s.attendanceLogs, changedAt: "loggedAt", maxRows: DAILY, files: [{ path: "evidencePath" }] },
    { tab: "Attendance month", key: "attendance-month", table: s.attendanceSheetMonth, changedAt: "importedAt" },
    { tab: "Attendance day grid", key: "attendance-day", table: s.attendanceSheetDay, changedAt: "importedAt", maxRows: DAILY },
    { tab: "Attendance freeze", key: "attendance-freeze", table: s.attendanceMonthFreeze },
    { tab: "Discipline notes", key: "discipline-notes", table: s.attendanceDisciplineNotes, changedAt: "updatedAt" },
    { tab: "Remote work", key: "remote-work", table: s.remoteWorkRequests, changedAt: "updatedAt" },
    { tab: "Client sites", key: "client-locations", table: s.clientLocations, changedAt: "updatedAt" },
    { tab: "Leave requests", key: "leave", table: s.leaveRequests, changedAt: "createdAt" },
    { tab: "Comp-off", key: "comp-off", table: s.compOffCredits, changedAt: "createdAt" },
    { tab: "Forms and requests", key: "module-submissions", table: s.moduleSubmissions, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Form attachments", key: "module-attachments", table: s.moduleSubmissionAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "DCC items", key: "dcc-items", table: s.dccKpiItems, changedAt: "updatedAt" },
    { tab: "DCC entries", key: "dcc-entries", table: s.dccEntries, changedAt: "updatedAt", maxRows: DAILY },
  ],

  accounts: [
    { tab: "Salary profiles", key: "salary-profiles", table: s.salaryProfiles, changedAt: "updatedAt" },
    { tab: "Salary runs", key: "salary-runs", table: s.salaryRuns, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Salary calculated and paid", key: "salary-breakup", table: s.salaryBreakup, changedAt: "importedAt" },
    { tab: "Salary payments", key: "salary-payments", table: s.salaryPayments, changedAt: "createdAt" },
    { tab: "Advances", key: "salary-advances", table: s.salaryAdvances, changedAt: "createdAt" },
    { tab: "CTC components", key: "salary-ctc", table: s.salaryCtcBreakup, changedAt: "updatedAt" },
    { tab: "Overtime", key: "overtime", table: s.overtimeEntries, changedAt: "updatedAt" },
    { tab: "Salary policies", key: "salary-policies", table: s.salaryPolicies, changedAt: "createdAt", files: [{ path: "storagePath" }] },
    { tab: "Policy consents", key: "salary-consents", table: s.salaryPolicyConsents, changedAt: "createdAt", files: [{ path: "signaturePath" }] },
    { tab: "Accounts task list", key: "accounts-tasks", table: s.accountsTaskList, changedAt: "updatedAt" },
    { tab: "Screenshots", key: "accounts-screenshots", table: s.accountsScreenshots, changedAt: "updatedAt" },
    { tab: "CA handover portals", key: "ca-handover", table: s.caHandoverCredentials, changedAt: "updatedAt" },
    { tab: "CA handover returns", key: "ca-returns", table: s.caHandoverReturns, changedAt: "updatedAt" },
    { tab: "Weekly checklist", key: "accounts-weekly", table: s.accountsWeeklyItems, changedAt: "updatedAt" },
    { tab: "Weekly checks", key: "accounts-weekly-checks", table: s.accountsWeeklyChecks, changedAt: "updatedAt" },
    { tab: "Monthly checklist", key: "accounts-monthly", table: s.accountsMonthlyItems, changedAt: "updatedAt" },
    { tab: "Monthly checks", key: "accounts-monthly-checks", table: s.accountsMonthlyChecks, changedAt: "updatedAt" },
    { tab: "Due dates", key: "accounts-due", table: s.accountsDueItems, changedAt: "updatedAt" },
    { tab: "Credit cards", key: "accounts-cc", table: s.accountsCcCards, changedAt: "updatedAt" },
    { tab: "Credit card months", key: "accounts-cc-months", table: s.accountsCcMonths, changedAt: "updatedAt" },
    { tab: "Bank items", key: "accounts-bank", table: s.accountsBankItems, changedAt: "updatedAt" },
    { tab: "Bank balances", key: "accounts-bank-balances", table: s.accountsBankBalances, changedAt: "updatedAt" },
    { tab: "Loans", key: "accounts-loans", table: s.accountsLoanItems, changedAt: "updatedAt" },
    { tab: "Shares", key: "accounts-shares", table: s.accountsShares, changedAt: "updatedAt" },
  ],

  billing: [
    { tab: "Invoices and documents", key: "billing-documents", table: s.billingDocuments, changedAt: "updatedAt", alsoChangedAt: "createdAt", files: [{ path: "pdfStoragePath" }] },
    { tab: "Document lines", key: "billing-lines", table: s.billingDocumentLines, changedAt: "updatedAt" },
    { tab: "Document history", key: "billing-events", table: s.billingDocumentEvents, changedAt: "createdAt" },
    { tab: "Customers", key: "billing-customers", table: s.billingCustomers, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Customer contacts", key: "billing-contacts", table: s.billingCustomerContacts, changedAt: "updatedAt" },
    { tab: "Customer addresses", key: "billing-addresses", table: s.billingCustomerAddresses, changedAt: "updatedAt" },
    { tab: "Customer files", key: "billing-customer-files", table: s.billingCustomerDocuments, changedAt: "uploadedAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "Contracts", key: "billing-contracts", table: s.billingContracts, changedAt: "updatedAt", files: [{ path: "attachmentPath", name: "attachmentName" }] },
    { tab: "Contract items", key: "billing-contract-items", table: s.billingContractItems, changedAt: "updatedAt" },
    { tab: "Post-dated cheques", key: "billing-pdcs", table: s.billingContractPdcs, changedAt: "updatedAt" },
  ],

  sales: [
    { tab: "Outstanding entries", key: "outstanding", table: s.outstandingEntries, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Follow-ups", key: "outstanding-followups", table: s.outstandingFollowups, changedAt: "createdAt" },
    { tab: "Contracts", key: "outstanding-contracts", table: s.outstandingContracts, changedAt: "updatedAt" },
    { tab: "Installments", key: "outstanding-installments", table: s.outstandingInstallments, changedAt: "updatedAt" },
    { tab: "Collections", key: "outstanding-collections", table: s.outstandingCollections, changedAt: "createdAt" },
    { tab: "Attachments", key: "outstanding-files", table: s.outstandingAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
    { tab: "People Gives", key: "people-gives", table: s.pgIntroductions, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Ambassadors", key: "ambassadors", table: s.ambAmbassadors, changedAt: "updatedAt" },
    { tab: "Referrals", key: "amb-referrals", table: s.ambReferrals, changedAt: "updatedAt" },
    { tab: "Ambassador payouts", key: "amb-payouts", table: s.ambPayouts, changedAt: "createdAt" },
  ],

  training: [
    { tab: "Subjects", key: "tc-subjects", table: s.tcSubjects, changedAt: "updatedAt" },
    { tab: "Materials", key: "tc-materials", table: s.tcMaterials, changedAt: "updatedAt", files: [{ path: "filePath", name: "fileName" }] },
    { tab: "Tests", key: "tc-tests", table: s.tcTests, changedAt: "updatedAt" },
    { tab: "Questions", key: "tc-questions", table: s.tcQuestions, changedAt: "createdAt" },
    { tab: "Attempts", key: "tc-attempts", table: s.tcAttempts, changedAt: "takenAt", maxRows: DAILY },
    { tab: "Sessions", key: "tc-sessions", table: s.tcSessions, changedAt: "updatedAt", files: [{ path: "videoPath" }, { path: "pptPath" }] },
    { tab: "Session attendees", key: "tc-attendees", table: s.tcSessionAttendees, changedAt: "createdAt" },
    { tab: "Feedback", key: "tc-feedback", table: s.tcFeedback, changedAt: "updatedAt", files: [{ path: "voiceNotePath" }, { path: "picturePath" }] },
    { tab: "Self learning", key: "tc-self-learning", table: s.tcSelfLearning, changedAt: "createdAt", files: [{ path: "evidencePath" }] },
  ],

  events: [
    { tab: "Calendar events", key: "calendar-events", table: s.calendarEvents, changedAt: "updatedAt" },
    { tab: "Categories", key: "event-categories", table: s.eventCategories, changedAt: "updatedAt" },
    { tab: "Batch types", key: "event-batch-types", table: s.eventBatchTypes, changedAt: "updatedAt" },
    { tab: "Batch schedules", key: "event-batches", table: s.eventBatchSchedules, changedAt: "updatedAt" },
    { tab: "Event holidays", key: "event-holidays", table: s.eventHolidays, changedAt: "updatedAt" },
    { tab: "Obligations", key: "obligations", table: s.obligations, changedAt: "updatedAt" },
    { tab: "Obligation completions", key: "obligation-completions", table: s.obligationCompletions, changedAt: "updatedAt" },
  ],

  goals: [
    { tab: "Goals", key: "goals", table: s.goals, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Weekly goals", key: "weekly-goals", table: s.weeklyGoals, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Weekly actuals", key: "weekly-actuals", table: s.weeklyGoalActuals, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Daily checklist", key: "daily-checklist", table: s.dailyChecklist, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Checklist reviews", key: "checklist-reviews", table: s.dailyChecklistReviews, changedAt: "updatedAt" },
    { tab: "Daily plan", key: "daily-plan", table: s.dailyPlanDay, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Goal reviews", key: "goal-reviews", table: s.goalReviews, changedAt: "createdAt" },
    { tab: "Goal comments", key: "goal-comments", table: s.goalComments, changedAt: "createdAt" },
  ],

  productivity: [
    { tab: "Scorecards", key: "scorecards", table: s.performanceScorecards, changedAt: "updatedAt" },
    { tab: "Daily scores", key: "score-daily", table: s.employeeScoreDaily, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Task metrics", key: "task-metrics", table: s.taskMetricsDaily, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "PMS reviews", key: "pms-review", table: s.pmsReview, changedAt: "updatedAt" },
    { tab: "PMS monthly", key: "pms-monthly", table: s.pmsMonthlyReview, changedAt: "updatedAt" },
    { tab: "Appraisal cycles", key: "appraisal-cycles", table: s.appraisalCycles, changedAt: "updatedAt" },
    { tab: "Appraisal items", key: "appraisal-items", table: s.appraisalItems, changedAt: "updatedAt" },
    { tab: "Appraisal scores", key: "appraisal-scores", table: s.appraisalScores, changedAt: "updatedAt" },
    { tab: "Appraisal files", key: "appraisal-files", table: s.appraisalAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
  ],

  "people-allocation": [
    { tab: "Clients", key: "pa-clients", table: s.paClients, changedAt: "updatedAt" },
    { tab: "People", key: "pa-people", table: s.paPeople, changedAt: "updatedAt" },
    { tab: "Allocations", key: "pa-allocations", table: s.paAllocations, changedAt: "createdAt" },
    { tab: "Entries", key: "pa-entries", table: s.paEntries, changedAt: "updatedAt" },
    { tab: "Calls", key: "pa-calls", table: s.paCalls, changedAt: "createdAt", maxRows: DAILY },
    { tab: "Client engagement", key: "ce-engagements", table: s.ceEngagements, changedAt: "updatedAt" },
    { tab: "Engagement accounts", key: "ce-accounts", table: s.ceAccounts, changedAt: "updatedAt" },
    { tab: "References", key: "ce-references", table: s.ceReferences, changedAt: "updatedAt" },
  ],

  "project-plan": [
    { tab: "Plan nodes", key: "project-nodes", table: s.projectNodes, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Members", key: "project-members", table: s.projectMembers, changedAt: "createdAt" },
    { tab: "Attachments", key: "project-files", table: s.projectNodeAttachments, changedAt: "createdAt", files: [{ path: "storagePath", name: "fileName" }] },
  ],

  operations: [
    { tab: "Checklist templates", key: "ops-templates", table: s.opsChecklistTemplates, changedAt: "updatedAt" },
    { tab: "Checklist runs", key: "ops-runs", table: s.opsChecklistRuns, changedAt: "updatedAt" },
    { tab: "Checklist items", key: "ops-items", table: s.opsChecklistItems, changedAt: "updatedAt" },
    { tab: "Checklist checks", key: "ops-checks", table: s.opsChecklistChecks, changedAt: "updatedAt", maxRows: DAILY },
    { tab: "Vendors", key: "ops-vendors", table: s.opsVendors, changedAt: "updatedAt", files: [{ path: "photoPath" }, { path: "invoicePath" }] },
    { tab: "Broadcasts", key: "broadcasts", table: s.broadcasts, changedAt: "updatedAt" },
    { tab: "Broadcast recipients", key: "broadcast-recipients", table: s.broadcastRecipients, changedAt: "createdAt", maxRows: DAILY },
    { tab: "Poll responses", key: "broadcast-polls", table: s.broadcastPollResponses, changedAt: "createdAt" },
  ],

  incentive: [
    { tab: "Catalog", key: "incentive-catalog", table: s.incentiveCatalog, changedAt: "createdAt" },
    { tab: "Eligibility", key: "incentive-eligibility", table: s.incentiveEligibility, changedAt: "createdAt" },
    { tab: "Requests", key: "incentive-requests", table: s.incentiveRequests, changedAt: "updatedAt", alsoChangedAt: "createdAt" },
    { tab: "Decisions", key: "incentive-decisions", table: s.incentiveRequestDecisions, changedAt: "createdAt" },
    { tab: "Entries", key: "incentive-entries", table: s.incentiveEntries, changedAt: "updatedAt" },
    { tab: "Projects", key: "incentive-projects", table: s.incentiveProjects, changedAt: "updatedAt" },
    { tab: "Participants", key: "incentive-participants", table: s.incentiveParticipants, changedAt: "updatedAt" },
    { tab: "Targets", key: "incentive-targets", table: s.incentiveTargets, changedAt: "updatedAt" },
    { tab: "Payouts", key: "incentive-payouts", table: s.incentivePayoutEvents, changedAt: "createdAt" },
  ],

  admin: [
    { tab: "Module permissions", key: "module-permissions", table: s.modulePermissions, changedAt: "updatedAt" },
    { tab: "Capability grants", key: "capability-grants", table: s.capabilityGrants, changedAt: "createdAt" },
    { tab: "Security roles", key: "security-roles", table: s.securityRoleGrants, changedAt: "createdAt" },
    { tab: "Temporary access", key: "delegated-access", table: s.delegatedAccessGrants, changedAt: "updatedAt" },
    { tab: "Account locks", key: "account-lockouts", table: s.accountLockouts, changedAt: "updatedAt" },
    { tab: "Org settings", key: "org-settings", table: s.orgSettings, changedAt: "updatedAt" },
    { tab: "Retention policies", key: "retention", table: s.dataRetentionPolicies, changedAt: "updatedAt" },
    { tab: "Activity log", key: "event-log", table: s.eventLog, changedAt: "createdAt", maxRows: DAILY },
    { tab: "Employee events", key: "employee-events", table: s.employeeEvents, changedAt: "createdAt" },
    { tab: "Settings history", key: "settings-events", table: s.settingsEvents, changedAt: "createdAt" },
  ],
};

/** Every module that can be exported, in hub order. */
export const BACKUP_MODULE_IDS = Object.keys(MODULES) as WorkspaceId[];

export function moduleBackup(moduleId: string): ModuleBackup | null {
  const specs = MODULES[moduleId as WorkspaceId];
  if (!specs) return null;
  return {
    id: moduleId as WorkspaceId,
    label: WORKSPACE_LABEL[moduleId as WorkspaceId],
    datasets: tabs(specs),
  };
}

/** Tabs that can only report NEW rows, so the page can say so plainly. */
export function createdOnlyTabs(moduleId: string): string[] {
  const def = moduleBackup(moduleId);
  if (!def) return [];
  return def.datasets.filter((d) => d.changes !== "updated").map((d) => d.tab);
}
