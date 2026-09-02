import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be a strict RFC-4122 v4 UUID — the action validates the id with
// EmployeeIdSchema (z.string().uuid()) before doing any work, and that
// rejects non-v4 shapes (variant nibble must be 8/9/a/b).
const EMP_ID = "00000000-0000-4000-8000-000000000000";

const updateUser = vi.fn().mockResolvedValue(undefined);
const revokeRefreshTokens = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminAuth: () => ({ updateUser, revokeRefreshTokens }),
}));

const sendPasswordChangedByAdminEmail = vi
  .fn()
  .mockResolvedValue({ id: "e1", error: null });
vi.mock("@/lib/email/resend", () => ({ sendPasswordChangedByAdminEmail }));

vi.mock("@/lib/auth/current", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", name: "Admin" }),
}));

const dbCalls: string[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      employees: {
        findFirst: vi.fn().mockResolvedValue({
          id: EMP_ID,
          name: "Dev User",
          email: "dev@altus.test",
          firebaseUid: "fb-uid-1",
          isActive: true,
        }),
      },
    },
    delete: () => ({ where: () => { dbCalls.push("delete:auth_sessions"); return Promise.resolve(); } }),
    update: () => ({ set: (v: unknown) => ({ where: () => { dbCalls.push("update:employees:" + JSON.stringify(Object.keys(v as object))); return Promise.resolve(); } }) }),
    insert: () => ({ values: (v: { eventType?: string }) => { dbCalls.push("insert:event:" + v.eventType); return Promise.resolve(); } }),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { employees: "employees" } }));

beforeEach(() => {
  updateUser.mockClear();
  revokeRefreshTokens.mockClear();
  sendPasswordChangedByAdminEmail.mockClear();
  dbCalls.length = 0;
});

describe("resetEmployeePassword", () => {
  it("sets the Firebase password, revokes tokens, clears sessions, stamps the column, audits, and emails", async () => {
    const { resetEmployeePassword } = await import(
      "@/app/(admin)/admin/employees/actions"
    );
    const res = await resetEmployeePassword(EMP_ID, "NewPass123!");
    expect(res.ok).toBe(true);
    expect(updateUser).toHaveBeenCalledWith("fb-uid-1", { password: "NewPass123!" });
    expect(revokeRefreshTokens).toHaveBeenCalledWith("fb-uid-1");
    expect(dbCalls).toContain("delete:auth_sessions");
    expect(dbCalls.some((c) => c.startsWith("update:employees:"))).toBe(true);
    expect(dbCalls).toContain("insert:event:password_reset_by_admin");
    expect(sendPasswordChangedByAdminEmail).toHaveBeenCalled();
  });

  it("rejects a too-short password before touching Firebase", async () => {
    const { resetEmployeePassword } = await import(
      "@/app/(admin)/admin/employees/actions"
    );
    const res = await resetEmployeePassword(EMP_ID, "short");
    expect(res.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
