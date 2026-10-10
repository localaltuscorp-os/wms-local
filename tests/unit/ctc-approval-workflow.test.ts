import { describe, expect, it } from "vitest";
import { APPROVAL_KINDS, PAYABLE_APPROVAL_KINDS, isPayableApprovalKind } from "@/lib/compensation/approval-kinds";

describe("CTC approval workflow boundaries", () => {
  it("treats CTC as an approvable source", () => {
    expect(APPROVAL_KINDS).toContain("ctc");
  });

  it("does not allow a CTC approval to become an Accounts payment", () => {
    expect(PAYABLE_APPROVAL_KINDS).not.toContain("ctc");
    expect(isPayableApprovalKind("ctc")).toBe(false);
    expect(isPayableApprovalKind("salary")).toBe(true);
  });
});
