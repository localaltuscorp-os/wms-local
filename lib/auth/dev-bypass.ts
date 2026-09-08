import type { Employee } from "@/db/schema";

/**
 * Local-dev-only escape hatch that skips both the Firebase session check
 * (proxy.ts) and the employee DB lookup (lib/auth/current.ts), so the app is
 * reachable without a configured Firebase project or a live Supabase
 * connection — useful for previewing UI (e.g. the HR console) on a machine
 * that only has placeholder credentials in .env.local.
 *
 * Double-gated so it can NEVER activate by accident in a real deployment:
 * the env flag alone isn't enough, NODE_ENV must also not be "production".
 * Set DEV_AUTH_BYPASS=true in .env.local to turn it on; leave it unset (the
 * default) to exercise the real Firebase + DB auth path.
 */
export function devAuthBypassEnabled(): boolean {
  return process.env.DEV_AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
}

/**
 * The synthetic "signed-in" employee used while the bypass is active. Every
 * column of the real `employees` row is filled in (rather than left to
 * `undefined`) so downstream code that reads any field gets a plausible
 * value instead of crashing on a missing one. isAdmin: true grants HR-handler
 * + admin-gated surfaces without needing a real department lookup.
 */
export const DEV_BYPASS_EMPLOYEE: Employee = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Dev Preview",
  email: "dev.bypass@localhost",
  role: "both",
  avatarUrl: null,
  avatarPath: null,
  // "HR" (matched case-insensitively by lib/workspaces.ts's matchesDepartment)
  // so isHrStaff() is true — most real /hr/* pages (intake, evaluation,
  // letters, candidates, ctc, induction, hiring-analytics, …) gate on
  // requireHrStaff(), not just requireWorkspace("hr"), and silently redirect
  // back to /hr for anyone it returns false for. isAdmin: true alone doesn't
  // satisfy it — only isSuperAdmin(email) or HR department membership do.
  department: "HR",
  departmentId: null,
  createdAt: new Date(),
  firebaseUid: "dev-bypass-uid",
  isAdmin: true,
  isActive: true,
  invitedAt: null,
  accountType: "employee",
  candidateIntakeId: null,
  candidateActive: false,
  deactivatedAt: null,
  joinedAt: new Date(),
  officialEmail: null,
  personalEmail: null,
  emailProvisionedAt: null,
  assetsAllocatedAt: null,
  passwordResetByAdminAt: null,
  attendanceBiometricExempt: true,
  lastInboxVisitAt: new Date(),
  slackUserId: null,
  emailOptIn: true,
  slackOptIn: true,
  whatsappPhone: null,
  whatsappOptedIn: false,
  whatsappTemplateLocale: "en",
  bio: null,
  tags: [],
  availability: "available",
  availabilityAutoRevertAt: null,
  timezone: "Asia/Kolkata",
  workingHoursStart: "10:00",
  workingHoursEnd: "19:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  quietHoursStart: null,
  quietHoursEnd: null,
  digestTime: "08:00",
  digestFrequency: "off",
  theme: "system",
  density: "cozy",
  accent: "#E10600",
  oooStart: null,
  oooEnd: null,
  oooDelegateId: null,
  managerId: null,
  dailyTaskQuota: 3,
  designationId: null,
  payingEntityId: null,
  mentionEscalation: true,
  googleRefreshToken: null,
  googleEmail: null,
  googleConnectedAt: null,
  weeklyOff: 0,
  attOfficialStart: null,
  attLateAfter: null,
  attOfficialEnd: null,
  attEarlyBefore: null,
  workerType: "full_time",
  attFullDayMinutes: null,
  attHalfDayMinutes: null,
  weeklyTargetMinutes: null,
  probationEnd: null,
  religion: null,
  // Added when this merged onto main beside Shreya's and Vinal's schema
  // work - `as Employee` is a cast, not a check, so a column missing here
  // is a TS error rather than a silent undefined at runtime. Keep this
  // object exhaustive against db/schema.ts's employees table.
  performanceCriteria: null,
  kra: null,
  phone: null,
  // Offboarding (migration 0212), added when this branch merged onto main.
  // The bypass employee is a current member of staff by definition, so the
  // lifecycle is "active" and every exit field is empty.
  employmentStatus: "active",
  lastWorkingDay: null,
  legalHold: false,
  legalHoldReason: null,
  anonymisedAt: null,
} as Employee;
