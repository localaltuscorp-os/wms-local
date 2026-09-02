import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("@/lib/db", () => {
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
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      insert: () => insertBuilder,
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
    });
    expect(res.ok).toBe(true);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "dev@altus.test",
        password: "Wms@123",
        emailVerified: true,
      }),
    );
    expect(sendCredentialsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@altus.test", password: "Wms@123" }),
    );
    expect(generatePasswordResetLink).not.toHaveBeenCalled();
  });
});
