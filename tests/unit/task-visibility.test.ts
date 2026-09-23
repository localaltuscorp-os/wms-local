import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

const getDownlineIds = vi.fn(async (_id: string): Promise<string[]> => []);
vi.mock("@/lib/weekly-goals/hierarchy", () => ({
  getDownlineIds: (id: string) => getDownlineIds(id),
}));

const isMasterAdmin = vi.fn((_email: string | null | undefined): boolean => false);
vi.mock("@/lib/security/capabilities", () => ({
  isMasterAdmin: (email: string | null | undefined) => isMasterAdmin(email),
  emailsWithCapability: () => [],
}));
vi.mock("@/lib/security/capability-grants", () => ({
  isMasterAdmin: (email: string | null | undefined) => isMasterAdmin(email),
}));

const isSuperAdmin = vi.fn((_email: string | null | undefined): boolean => false);
vi.mock("@/lib/auth/super-admin", () => ({
  isSuperAdmin: (email: string | null | undefined) => isSuperAdmin(email),
}));

type Viewer = { id: string; email: string; isAdmin: boolean };
const getCurrentEmployee = vi.fn(async (): Promise<Viewer | null> => null);
vi.mock("@/lib/auth/current", () => ({
  getCurrentEmployee: () => getCurrentEmployee(),
  requireUser: vi.fn(),
}));

// The grants read is the one DB call the visibility resolver makes, and the
// table is the SHARED one — `visibility_grants`, whose `domain` column is what
// separates the Tasks grants from the Incentive ones.
vi.mock("@/lib/db/schema", () => ({
  employees: {},
  visibilityGrants: { domain: "domain", employeeId: "employee_id", targetId: "target_id" },
}));
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  return { ...actual, eq: (...args: unknown[]) => ({ eq: args }) };
});

import {
  applyTaskScope,
  taskVisibilityFor,
  currentTaskVisibility,
  type TaskVisibility,
} from "@/lib/tasks/scope";
import { db } from "@/lib/db";
import type { TaskListFilters } from "@/lib/types";

const ME = "11111111-1111-1111-1111-111111111111";
const MANSI = "22222222-2222-2222-2222-222222222222";
const MANSI_REPORT = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

function filters(patch: Partial<TaskListFilters> = {}): TaskListFilters {
  return {
    startDate: null,
    endDate: null,
    statuses: [],
    doerIds: [],
    initiatorIds: [],
    departments: [],
    priorities: [],
    subjects: [],
    clients: [],
    taskId: null,
    archived: false,
    activityType: null,
    unread: false,
    overdue: false,
    ageRange: null,
    teams: [],
    viewerId: null,
    assigneeMode: "all",
    ...patch,
  } as TaskListFilters;
}

/** Make the grants read (the only DB call) answer with `rows`. */
function withGrants(rows: { targetId: string | null }[]) {
  (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: async () => rows }),
  });
}

beforeEach(() => {
  getDownlineIds.mockReset().mockResolvedValue([]);
  isMasterAdmin.mockReset().mockReturnValue(false);
  isSuperAdmin.mockReset().mockReturnValue(false);
  getCurrentEmployee.mockReset().mockResolvedValue(null);
  withGrants([]);
});

describe("taskVisibilityFor", () => {
  it("scopes an ordinary employee to themselves — no expansion", async () => {
    const v = await taskVisibilityFor({ id: ME, email: "me@altuscorp.com", isAdmin: false });
    expect(v.permittedIds).toEqual([ME]);
    expect(v.canExpand).toBe(false);
  });

  it("scopes an ADMIN to themselves too — admin is not unrestricted", async () => {
    const v = await taskVisibilityFor({ id: ME, email: "admin@altuscorp.com", isAdmin: true });
    expect(v.permittedIds).toEqual([ME]);
    expect(v.canExpand).toBe(false);
  });

  it("adds the downline for somebody with reports, and marks it expandable", async () => {
    getDownlineIds.mockResolvedValue([MANSI, MANSI_REPORT]);
    const v = await taskVisibilityFor({ id: ME, email: "lead@altuscorp.com", isAdmin: false });
    expect(v.permittedIds).toEqual([ME, MANSI, MANSI_REPORT]);
    expect(v.canExpand).toBe(true);
  });

  it("takes a branch grant as that person AND their team", async () => {
    getDownlineIds.mockImplementation(async (id) => (id === MANSI ? [MANSI_REPORT] : []));
    withGrants([{ targetId: MANSI }]);
    const v = await taskVisibilityFor({ id: ME, email: "me@altuscorp.com", isAdmin: false });
    expect(v.permittedIds).toEqual([ME, MANSI, MANSI_REPORT]);
    expect(v.canExpand).toBe(true);
  });

  it("takes an org-wide grant (target NULL) as everything", async () => {
    withGrants([{ targetId: null }]);
    const v = await taskVisibilityFor({ id: ME, email: "me@altuscorp.com", isAdmin: false });
    expect(v.permittedIds).toBeNull();
    expect(v.canExpand).toBe(true);
  });

  it("exempts a master admin and a super admin", async () => {
    isMasterAdmin.mockReturnValue(true);
    expect((await taskVisibilityFor({ id: ME, email: "m@x.in", isAdmin: true })).permittedIds).toBeNull();
    isMasterAdmin.mockReturnValue(false);
    isSuperAdmin.mockReturnValue(true);
    expect((await taskVisibilityFor({ id: ME, email: "s@x.in", isAdmin: true })).permittedIds).toBeNull();
  });

  it("fails CLOSED when the grants read throws", async () => {
    (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        where: async () => {
          throw new Error("relation does not exist");
        },
      }),
    });
    const v = await taskVisibilityFor({ id: ME, email: "me@altuscorp.com", isAdmin: false });
    expect(v.permittedIds).toEqual([ME]);
    expect(v.canExpand).toBe(false);
  });
});

describe("applyTaskScope", () => {
  const scope = (permittedIds: string[] | null): TaskVisibility => ({
    permittedIds,
    canExpand: true,
    selfId: ME,
    scopeLabel: "test",
  });

  it("leaves an unscoped caller alone (a system read with no viewer)", () => {
    const f = filters({ doerIds: [MANSI] });
    expect(applyTaskScope(f, null)).toBe(f);
  });

  it("leaves an organisation-wide viewer alone", () => {
    const f = filters();
    expect(applyTaskScope(f, scope(null))).toBe(f);
  });

  it("records the ceiling without narrowing an empty assignee selection", () => {
    const out = applyTaskScope(filters(), scope([ME, MANSI]));
    expect(out.visibleDoerIds).toEqual([ME, MANSI]);
    expect(out.doerIds).toEqual([]);
    expect(out.assigneeOutsideScope).toBe(false);
  });

  it("intersects an explicit assignee selection with the ceiling", () => {
    const out = applyTaskScope(filters({ doerIds: [MANSI, STRANGER] }), scope([ME, MANSI]));
    expect(out.doerIds).toEqual([MANSI]);
    expect(out.assigneeOutsideScope).toBe(false);
  });

  it("marks a wholly-outside selection so it matches NOTHING", () => {
    const out = applyTaskScope(filters({ doerIds: [STRANGER] }), scope([ME, MANSI]));
    expect(out.doerIds).toEqual([]);
    expect(out.assigneeOutsideScope).toBe(true);
  });
});

describe("currentTaskVisibility", () => {
  it("is null when nobody is signed in", async () => {
    getCurrentEmployee.mockResolvedValue(null);
    expect(await currentTaskVisibility()).toBeNull();
  });

  it("resolves the signed-in person's scope", async () => {
    getCurrentEmployee.mockResolvedValue({ id: ME, email: "me@altuscorp.com", isAdmin: false });
    const v = await currentTaskVisibility();
    expect(v?.permittedIds).toEqual([ME]);
  });
});
