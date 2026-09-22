import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * "MAY ISSUE A LETTER" IS NOT THE SAME QUESTION AS "IS AN ADMIN".
 *
 * They were the same bit, in three separate copies, and the consequence was
 * that an HR person could only be allowed to send an appointment letter by
 * being made a full admin — able to manage every employee and setting in the
 * application. `hr.letters.issue` is the narrow alternative.
 */

const { granted, readCount } = vi.hoisted(() => ({
  granted: new Set<string>(),
  readCount: { n: 0 },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          readCount.n++;
          return [...granted].map((email) => ({ email }));
        },
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  capabilityGrants: { employeeId: "employee_id", employeeEmail: "employee_email", capability: "capability" },
  capabilityGrantEvents: {},
  employees: { id: "id", email: "email" },
}));

const { canIssueLetters, LETTER_ISSUE_REFUSAL } = await import("@/lib/hr/letters/issue-access");

const HR_STAFF = { email: "mansi@altuscorp.in", isAdmin: false };
const ADMIN = { email: "hetesh@altuscorp.in", isAdmin: true };
const MANAN = { email: "manan@unleashed.in", isAdmin: false };

beforeEach(() => {
  granted.clear();
  readCount.n = 0;
});

describe("who may issue a letter", () => {
  it("refuses an ordinary HR person — this is the bug being fixed", async () => {
    // She is HR staff, so she can OPEN a letter and read it. She may not issue
    // one until somebody grants it. Before this capability the only way to let
    // her issue was to make her a full admin.
    expect(await canIssueLetters(HR_STAFF)).toBe(false);
  });

  it("admits an admin and a super-admin WITHOUT a database read", async () => {
    // Both held this before the capability existed. Their behaviour must not
    // change, and it must not depend on a table being reachable.
    expect(await canIssueLetters(ADMIN)).toBe(true);
    expect(await canIssueLetters(MANAN)).toBe(true);
    expect(readCount.n).toBe(0);
  });

  it("admits a granted non-admin", async () => {
    granted.add("mansi@altuscorp.in");
    expect(await canIssueLetters(HR_STAFF)).toBe(true);
  });

  it("is case- and whitespace-insensitive, as every email comparison here is", async () => {
    granted.add("mansi@altuscorp.in");
    expect(await canIssueLetters({ email: "  Mansi@AltusCorp.IN  ", isAdmin: false })).toBe(true);
  });

  it("refuses a revoked grant immediately — no staleness window", async () => {
    granted.add("mansi@altuscorp.in");
    expect(await canIssueLetters(HR_STAFF)).toBe(true);
    granted.clear();
    expect(await canIssueLetters(HR_STAFF)).toBe(false);
  });

  it("refuses an absent or blank identity", async () => {
    expect(await canIssueLetters({ email: "", isAdmin: false })).toBe(false);
    expect(await canIssueLetters({ email: "   ", isAdmin: false })).toBe(false);
  });

  it("never says yes for a near-miss address", async () => {
    granted.add("mansi@altuscorp.in");
    expect(await canIssueLetters({ email: "mansi@altuscorp.in.evil.com", isAdmin: false })).toBe(false);
  });
});

describe("the refusal is one sentence, and it says what to do", () => {
  it("names the capability and who can grant it", () => {
    // A bare "Forbidden" tells an HR person nothing and gives them nowhere to go.
    expect(LETTER_ISSUE_REFUSAL).toMatch(/Issue letters/);
    expect(LETTER_ISSUE_REFUSAL).toMatch(/administrator/i);
  });
});

describe("ONE definition, three enforcement points", () => {
  it("the issuance core uses it", () => {
    const core = codeOf("lib/hr/letters/issue-core.ts");
    expect(core).toMatch(/canIssueLetters\(me\)/);
    // The private admin test it replaced must be gone — a leftover copy is how
    // the three drifted apart in the first place.
    expect(core).not.toMatch(/function isAdmin\(/);
    expect(core).not.toMatch(/isSuperAdmin/);
  });

  it("the email route uses it", () => {
    const route = codeOf("app/api/hr/letters/email-pdf/route.ts");
    expect(route).toMatch(/canIssueLetters\(me\)/);
    expect(route).not.toMatch(/isSuperAdmin/);
  });

  it("the letter page uses it", () => {
    const page = codeOf("app/(app)/hr/letters/[key]/page.tsx");
    expect(page).toMatch(/canIssueLetters\(me\)/);
    expect(page).not.toMatch(/isSuperAdmin/);
  });

  it("NO other file still decides letter access from isAdmin", () => {
    // The bug was three copies of the test. A fourth appearing anywhere is the
    // same bug returning, so this asserts the shape rather than listing files.
    const editor = codeOf("components/hr/letters/letter-editor.tsx");
    // The editor still takes an `isAdmin` PROP — it only decides what to draw,
    // and the page now fills it from canIssueLetters().
    expect(editor).toMatch(/isAdmin: boolean/);
  });
});

describe("the code list and the database constraint cannot drift", () => {
  it("every DB-backed capability is allowed by the CHECK constraint", () => {
    // A capability stored in the database but rejected by the constraint would
    // fail the INSERT at runtime, on the one path that matters. Migration 0226
    // pinned the column to master-admin alone; 0228 widens it.
    const grants = codeOf("lib/security/capability-grants.ts");
    const sql = codeOf("db/migrations/0228_letter_issue_capability.sql");

    const declared = [...grants.matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]!);
    const unique = [...new Set(declared)];
    expect(unique.length).toBeGreaterThan(0);
    for (const cap of unique) {
      expect(sql, `${cap} must be permitted by the CHECK constraint`).toContain(cap);
    }
  });
});

describe("names are joined in one place", () => {
  it("the invite action and the quick-add dialog share the join", () => {
    // Two entry points, two separate first/last forms. A stray double space or a
    // trailing one is not cosmetic: the value is printed on a letter and shown
    // in the picker a person is matched by.
    expect(codeOf("app/(app)/hr/candidate-invite-actions.ts")).toMatch(/joinCandidateName/);
    expect(codeOf("components/hr/candidate/evaluation-v2/evaluation-v2-screen.tsx")).toMatch(
      /joinCandidateName/,
    );
  });

  it("joins and normalises the way the stored column expects", async () => {
    const { joinCandidateName, splitCandidateName } = await import("@/lib/hr/candidate/name");
    expect(joinCandidateName("Priya", "Sharma")).toBe("Priya Sharma");
    expect(joinCandidateName("  Priya  ", "  Sharma  ")).toBe("Priya Sharma");
    expect(joinCandidateName("Priya", "")).toBe("Priya");
    expect(joinCandidateName("", "Sharma")).toBe("Sharma");
    expect(joinCandidateName("", "")).toBe("");
    // Internal runs collapse, so a paste with a doubled space cannot produce a
    // name that fails to match the same person typed properly.
    expect(joinCandidateName("Priya  Anjali", "Sharma")).toBe("Priya Anjali Sharma");
  });

  it("splits on the LAST space, so a two-word given name survives", async () => {
    // The least surprising reading for Indian names, where the given name is
    // often two words and the surname one.
    const { splitCandidateName } = await import("@/lib/hr/candidate/name");
    expect(splitCandidateName("Priya Anjali Sharma")).toEqual({
      first: "Priya Anjali",
      last: "Sharma",
    });
    expect(splitCandidateName("Priya")).toEqual({ first: "Priya", last: "" });
    expect(splitCandidateName("")).toEqual({ first: "", last: "" });
    expect(splitCandidateName(null)).toEqual({ first: "", last: "" });
  });

  it("round-trips", async () => {
    const { joinCandidateName, splitCandidateName } = await import("@/lib/hr/candidate/name");
    for (const name of ["Priya Sharma", "Priya Anjali Sharma", "Priya"]) {
      const { first, last } = splitCandidateName(name);
      expect(joinCandidateName(first, last)).toBe(name);
    }
  });
});
