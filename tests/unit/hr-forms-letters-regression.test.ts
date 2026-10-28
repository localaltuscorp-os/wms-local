import { describe, expect, it } from "vitest";
import { codeOf } from "../fixtures/source-code";

describe("HR All Forms includes candidates", () => {
  const page = codeOf("app/(app)/hr/all-forms/page.tsx");

  it("keeps employee rows and includes candidate-only submissions", () => {
    expect(page).toMatch(/leftJoin\(employees/);
    expect(page).toMatch(/leftJoin\(candidateIntake/);
    expect(page).not.toMatch(/innerJoin\(employees/);
    expect(page).toMatch(/Candidate/);
  });

  it("keeps the HR list boundary", () => {
    expect(page).toMatch(/requireHrStaff\(\)/);
  });
});

describe("generated HR letter authorization and recipients", () => {
  it("uses the capability-aware decision at every issue/send boundary", () => {
    expect(codeOf("app/api/hr/send-letter-email/route.ts")).toMatch(/canIssueLetters\(me\)/);
    expect(codeOf("lib/hr/letters/issue-core.ts")).toMatch(/canIssueLetters\(me\)/);
    expect(codeOf("lib/hr/letters/issue-rich.ts")).toMatch(/canIssueLetters\(me\)/);
    expect(codeOf("app/api/hr/send-letter-email/route.ts")).not.toMatch(/isSuperAdmin/);
    expect(codeOf("lib/hr/letters/issue-rich.ts")).not.toMatch(/function isAdmin/);
  });

  it("uses one employee recipient helper across generated-letter paths", () => {
    expect(codeOf("lib/hr/letters/issue-core.ts")).toMatch(/employeeLetterRecipientEmail/);
    expect(codeOf("lib/hr/letters/issue-rich.ts")).toMatch(/employeeLetterRecipientEmail/);
    expect(codeOf("app/api/hr/send-letter-email/route.ts")).toMatch(/employeeLetterRecipientEmail/);
    expect(codeOf("app/api/hr/letters/email-pdf/route.ts")).toMatch(/employeeLetterRecipientEmail/);
  });
});

describe("employee letter recipient rule", () => {
  it("prefers personal email and falls back to work email", async () => {
    const { employeeLetterRecipientEmail } = await import("@/lib/hr/letters/recipient");
    expect(employeeLetterRecipientEmail({ personalEmail: " personal@example.com ", email: "work@example.com" })).toBe("personal@example.com");
    expect(employeeLetterRecipientEmail({ personalEmail: null, email: " work@example.com " })).toBe("work@example.com");
  });
});

describe("generated letter retry safety", () => {
  it("changes the idempotency key when letter content changes", async () => {
    const { letterDeliveryKey } = await import("@/lib/hr/letters/idempotency");
    expect(letterDeliveryKey({ key: "appointment", values: { name: "A" } })).toBe(
      letterDeliveryKey({ key: "appointment", values: { name: "A" } }),
    );
    expect(letterDeliveryKey({ key: "appointment", values: { name: "B" } })).not.toBe(
      letterDeliveryKey({ key: "appointment", values: { name: "A" } }),
    );
  });

  it("looks up and reuses an existing archive before inserting another", () => {
    const core = codeOf("lib/hr/letters/issue-core.ts");
    expect(core).toMatch(/findReusableLetterInstance/);
    expect(core).toMatch(/__deliveryKey/);
    expect(core).toMatch(/archived\.pdfBuffer/);
    expect(codeOf("lib/hr/letters/issue-rich.ts")).toMatch(/findReusableLetterInstance/);
  });
});
