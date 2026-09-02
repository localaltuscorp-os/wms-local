import { describe, it, expect } from "vitest";
import { computeLegacyImportKey } from "@/lib/import/legacy-key";

const base = {
  doerEmail: "alice@vp.com",
  initiatorEmail: "bob@vp.com",
  assignDate: "2025-11-04",
  dueDate: "2025-11-12",
  status: "done",
  subject: "KYC for loan 4471",
};

describe("computeLegacyImportKey", () => {
  it("returns a 32-char hex string", () => {
    const k = computeLegacyImportKey(base);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic for identical input", () => {
    expect(computeLegacyImportKey(base)).toBe(computeLegacyImportKey(base));
  });

  it("normalises whitespace and case in the subject", () => {
    expect(computeLegacyImportKey({ ...base, subject: "  KYC for Loan 4471  " }))
      .toBe(computeLegacyImportKey(base));
  });

  it("differs across distinct field combinations", () => {
    const k = computeLegacyImportKey(base);
    expect(computeLegacyImportKey({ ...base, doerEmail: "x@y.com" })).not.toBe(k);
    expect(computeLegacyImportKey({ ...base, status: "approved" })).not.toBe(k);
    expect(computeLegacyImportKey({ ...base, subject: "Different subject" })).not.toBe(k);
  });

  it("yields distinct keys for synthesised subjects salted by line number", () => {
    // Two legacy rows with the same doer/initiator/dates/status but no
    // subject AND no description.  The importer synthesises
    // `(imported row <line>)` so the keys diverge and both rows import.
    const shared = {
      doerEmail: "alice@vp.com",
      initiatorEmail: "bob@vp.com",
      assignDate: "2025-11-04",
      dueDate: "2025-11-12",
      status: "not_started",
    };
    const k142 = computeLegacyImportKey({ ...shared, subject: "(imported row 142)" });
    const k143 = computeLegacyImportKey({ ...shared, subject: "(imported row 143)" });
    expect(k142).not.toBe(k143);
  });
});
