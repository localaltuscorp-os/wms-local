import type { Task, Employee } from "@/db/schema";

// Profile v2 (migration 0035) added 18 columns to employees. Centralising
// their defaults here means a future column drop or add is a one-line edit.
function profileV2Defaults() {
  return {
    bio: null as string | null,
    tags: [] as string[],
    availability: "available" as const,
    availabilityAutoRevertAt: null as Date | null,
    timezone: "Asia/Kolkata",
    workingHoursStart: "10:00",
    workingHoursEnd: "19:00",
    workingDays: [1, 2, 3, 4, 5, 6],
    quietHoursStart: null as string | null,
    quietHoursEnd: null as string | null,
    digestTime: "08:00",
    digestFrequency: "daily" as const,
    theme: "system" as const,
    density: "cozy" as const,
    accent: "#E10600",
    oooStart: null as string | null,
    oooEnd: null as string | null,
    oooDelegateId: null as string | null,
    managerId: null as string | null,
    mentionEscalation: true,
    passwordResetByAdminAt: null as Date | null,
    attendanceBiometricExempt: false,
    googleRefreshToken: null as string | null,
    googleEmail: null as string | null,
    googleConnectedAt: null as Date | null,
    performanceCriteria: null as string | null,
    kra: null as string | null,
    // Attendance Phase A (migration 0058).
    weeklyOff: 0,
    attOfficialStart: null as string | null,
    attLateAfter: null as string | null,
    attOfficialEnd: null as string | null,
    attEarlyBefore: null as string | null,
    // Attendance Phase B (migration 0060).
    probationEnd: null as string | null,
    // Salary module (migration 0062).
    designationId: null as string | null,
    payingEntityId: null as string | null,
  };
}

export const fixtureEmployees: Employee[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Ankit Sharma",
    email: "ankit@altus.test",
    role: "both",
    avatarUrl: null,
    department: "Operations",
    createdAt: new Date("2025-01-01"),
    firebaseUid: null,
    isAdmin: false,
    isActive: true,
    invitedAt: null,
    joinedAt: null,
    lastInboxVisitAt: new Date("2025-01-01"),
    departmentId: null,
    slackUserId: null,
    emailOptIn: true,
    slackOptIn: true,
    whatsappPhone: null,
    whatsappOptedIn: false,
    whatsappTemplateLocale: "en",
    ...profileV2Defaults(),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Priya Iyer",
    email: "priya@altus.test",
    role: "doer",
    avatarUrl: null,
    department: "Underwriting",
    createdAt: new Date("2025-01-01"),
    firebaseUid: null,
    isAdmin: false,
    isActive: true,
    invitedAt: null,
    joinedAt: null,
    lastInboxVisitAt: new Date("2025-01-01"),
    departmentId: null,
    slackUserId: null,
    emailOptIn: true,
    slackOptIn: true,
    whatsappPhone: null,
    whatsappOptedIn: false,
    whatsappTemplateLocale: "en",
    ...profileV2Defaults(),
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Ravi Kumar",
    email: "ravi@altus.test",
    role: "initiator",
    avatarUrl: null,
    department: "Sales",
    createdAt: new Date("2025-01-01"),
    firebaseUid: null,
    isAdmin: false,
    isActive: true,
    invitedAt: null,
    joinedAt: null,
    lastInboxVisitAt: new Date("2025-01-01"),
    departmentId: null,
    slackUserId: null,
    emailOptIn: true,
    slackOptIn: true,
    whatsappPhone: null,
    whatsappOptedIn: false,
    whatsappTemplateLocale: "en",
    ...profileV2Defaults(),
  },
];

const ANKIT = fixtureEmployees[0]!.id;
const PRIYA = fixtureEmployees[1]!.id;
const RAVI = fixtureEmployees[2]!.id;

let counter = 0;
function id() {
  counter++;
  return `00000000-0000-0000-0000-${counter.toString().padStart(12, "0")}`;
}

function task(partial: Partial<Task>): Task {
  const createdAt = partial.createdAt ?? new Date("2026-04-01");
  return {
    id: id(),
    title: partial.title ?? "Test task",
    description: null,
    doerId: partial.doerId ?? ANKIT,
    initiatorId: partial.initiatorId ?? RAVI,
    priority: partial.priority ?? "not_imp_urgent",
    status: partial.status ?? "not_started",
    createdAt,
    dueAt:
      partial.dueAt ??
      new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    completedAt: partial.completedAt ?? null,
    transferredFromId: partial.transferredFromId ?? null,
    notes: null,
    subject: partial.subject ?? null,
    client: partial.client ?? null,
    googleEventId: partial.googleEventId ?? null,
    googleSyncedDoerId: partial.googleSyncedDoerId ?? null,
    archived: partial.archived ?? false,
    createdById: partial.createdById ?? null,
    approvedById: partial.approvedById ?? null,
    approvedAt: partial.approvedAt ?? null,
    approvalNote: partial.approvalNote ?? null,
    updatedAt: partial.updatedAt ?? createdAt,
    legacyImportKey: partial.legacyImportKey ?? null,
    shortId: partial.shortId ?? null,
    taskNo: partial.taskNo ?? null,
    firstReadAt: partial.firstReadAt ?? null,
    // Tier-3 (2026-05-20) additions — default to null so existing
    // fixtures keep working without per-task overrides.
    tags: partial.tags ?? null,
    approvalStatus: partial.approvalStatus ?? null,
    revisedTargetDate: partial.revisedTargetDate ?? null,
    // Tier-4 (2026-05-20) GCal-style scheduling fields.
    startsAt: partial.startsAt ?? null,
    endsAt: partial.endsAt ?? null,
    allDay: partial.allDay ?? false,
    recurrence: partial.recurrence ?? null,
    recurrenceRule: partial.recurrenceRule ?? null,
    recurrenceParentId: partial.recurrenceParentId ?? null,
    recurrenceOccurrenceDate: partial.recurrenceOccurrenceDate ?? null,
    projectNodeId: partial.projectNodeId ?? null,
    // Search infra (migration 0061) — DB-generated STORED column. Test
    // fixtures never exercise it; default null keeps the select shape valid.
    searchText: partial.searchText ?? null,
  };
}

export const fixtureTasks: Task[] = [
  // Ankit: 5 done, 2 approved, 1 pending (initiated)
  ...Array.from({ length: 5 }).map(() =>
    task({ doerId: ANKIT, status: "done", createdAt: new Date("2026-04-15") }),
  ),
  ...Array.from({ length: 2 }).map(() =>
    task({ doerId: ANKIT, status: "approved", createdAt: new Date("2026-04-20") }),
  ),
  task({ doerId: ANKIT, status: "initiated", createdAt: new Date("2026-04-22") }),

  // Priya: 3 done, 1 cancelled, 2 pending (need_info, follow_up)
  // (need_help retired 2026-06-10 → need_info; both roll into the "need" bucket)
  ...Array.from({ length: 3 }).map(() =>
    task({ doerId: PRIYA, status: "done", createdAt: new Date("2026-04-18") }),
  ),
  task({ doerId: PRIYA, status: "cancelled", createdAt: new Date("2026-04-19") }),
  task({ doerId: PRIYA, status: "need_info", createdAt: new Date("2026-04-25") }),
  task({ doerId: PRIYA, status: "follow_up", createdAt: new Date("2026-04-26") }),

  // Ravi: 1 transferred, 1 not_approved
  task({ doerId: RAVI, status: "transferred", createdAt: new Date("2026-04-10") }),
  task({ doerId: RAVI, status: "not_approved", createdAt: new Date("2026-04-12") }),
];

export const fixtureNow = new Date("2026-05-01T12:00:00Z");
