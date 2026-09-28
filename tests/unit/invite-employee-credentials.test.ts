import { describe, it, expect, vi, beforeEach } from "vitest";

// The action's dependency graph reaches `lib/employees/manager-history` (the
// reporting-period recorder), which is `server-only` — as every module that
// touches the database in this repo is. Neutralised here the same way the other
// action tests do it, so the import graph loads under vitest.
vi.mock("server-only", () => ({}));

const createUser = vi.fn();
const setCustomUserClaims = vi.fn().mockResolvedValue(undefined);
const generatePasswordResetLink = vi.fn().mockResolvedValue("https://x/reset");
const deleteUser = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminAuth: () => ({
    createUser,
    setCustomUserClaims,
    generatePasswordResetLink,
    deleteUser,
  }),
}));

const sendCredentialsEmail = vi.fn().mockResolvedValue({ id: "e1", error: null });
const sendInviteEmail = vi.fn().mockResolvedValue({ id: "e2", error: null });
vi.mock("@/lib/email/resend", () => ({ sendCredentialsEmail, sendInviteEmail }));

vi.mock("@/lib/auth/current", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", name: "Admin User" }),
}));

// inviteEmployee: dup-check via findFirst (return undefined = no dup), then
// insert(...).returning() yields the new row. Department helpers also call db;
// resolveDepartmentSelection issues a select on departments — return [] so it
// resolves to no departments. writeMemberships inserts; make insert chainable
// for both .returning() and plain awaits.
// Issuing the Employee Code is a SEPARATE concern with its own tests. It joins
// paying entities and designations to pick a prefix and refuses when none is
// set, which would abort the invite before it ever reaches the credentials
// step this file is about. Stubbed to succeed so the assertions below are
// about Firebase and the email, not about code allocation.
vi.mock("@/lib/employees/code-registry", () => ({
  issueSuggestedEmployeeCode: vi.fn().mockResolvedValue({ ok: true, code: "ALT-0001" }),
}));

vi.mock("@/lib/db", () => {
  /** A query builder that answers any step and always resolves to []. */
  const chain = (): Record<string, unknown> => {
    const settled = Promise.resolve([] as unknown[]);
    const self: Record<string, unknown> = {};
    const step = () => self;
    for (const k of ["from", "leftJoin", "innerJoin", "where", "set", "orderBy", "groupBy"]) self[k] = step;
    self.limit = () => settled;
    self.returning = () => settled;
    // A real thenable, so `await`, `.then`, `.catch` and `.finally` all work.
    self.then = settled.then.bind(settled);
    self.catch = settled.catch.bind(settled);
    self.finally = settled.finally.bind(settled);
    return self;
  };
  const insertBuilder = {
    values: () => ({
      returning: () =>
        Promise.resolve([
          {
            id: "00000000-0000-4000-8000-000000000000",
            name: "Dev User",
            email: "dev@altus.test",
            role: "doer",
            department: null,
            isAdmin: false,
          },
        ]),
      onConflictDoNothing: () => Promise.resolve(),
    }),
  };
  return {
    db: {
      query: { employees: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      // ONE CHAINABLE STUB for every query builder this action touches.
      // Issuing an employee code (lib/employees/code-registry.ts, added
      // 2026-09-24) joins paying entities and designations, then reserves and
      // releases rows — so the graph reaches leftJoin, delete and update, and
      // awaits some of them with .catch(). Every step returns the same object
      // and every await resolves to [], so the action falls back to its default
      // prefix, which is all this test cares about.
      select: () => chain(),
      insert: () => insertBuilder,
      delete: () => chain(),
      update: () => chain(),
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { employees: "employees" } }));

beforeEach(() => {
  createUser.mockReset().mockResolvedValue({ uid: "fb-uid-1" });
  setCustomUserClaims.mockClear();
  generatePasswordResetLink.mockClear();
  sendCredentialsEmail.mockClear();
  sendInviteEmail.mockClear();
});

describe("inviteEmployee (credentials flow)", () => {
  it("creates the Firebase user WITH the default password and emailVerified, and emails credentials", async () => {
    const { inviteEmployee } = await import("@/app/(admin)/admin/employees/actions");
    const res = await inviteEmployee({
      name: "Dev User",
      email: "dev@altus.test",
      role: "doer",
      departmentIds: [],
      primaryDepartmentId: null,
      isAdmin: false,
      // REQUIRED since 0244 for anybody who is not an intern — the record
      // cannot be created without it, so the test supplies it exactly as the
      // invite dialog does.
      probationEnd: "2026-12-01",
    });
    expect(res.ok).toBe(true);
    // A fresh, strong, per-invite password is minted (no shared default).
    const createdPw = createUser.mock.calls[0]![0].password as string;
    expect(createdPw).toHaveLength(14);
    expect(createdPw).toMatch(/[A-Z]/);
    expect(createdPw).toMatch(/[a-z]/);
    expect(createdPw).toMatch(/[0-9]/);
    expect(createdPw).toMatch(/[^A-Za-z0-9]/);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@altus.test", emailVerified: true }),
    );
    // The emailed password must be the SAME one set on the Firebase user.
    expect(sendCredentialsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@altus.test", password: createdPw }),
    );
    expect(generatePasswordResetLink).not.toHaveBeenCalled();
  });
});
