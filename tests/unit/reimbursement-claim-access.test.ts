import { describe, it, expect } from "vitest";
import {
  canChangeClaimDocuments,
  canViewClaimDocuments,
  claimChangeRefusal,
} from "@/lib/reimbursements/claim-access";

/**
 * WHO MAY SEE AND WHO MAY CHANGE a claim's receipts.
 *
 * The interesting property is that these two gates are NOT the same, and the
 * difference is easy to "tidy away" into a single `canManage`. Viewing is
 * owner-or-admin; changing is owner-only-while-pending, which excludes admins
 * on purpose. Both directions are pinned here so neither can be widened by
 * accident.
 */

const ME = { id: "emp-me" };
const ADMIN = { id: "emp-admin", isAdmin: true };
const COLLEAGUE = { id: "emp-other" };

const claim = (over: Partial<{ employeeId: string; status: string }> = {}) => ({
  employeeId: ME.id,
  status: "pending",
  ...over,
});

/* ── Viewing ──────────────────────────────────────────────────────────────── */

describe("canViewClaimDocuments", () => {
  it("lets the claimant see their own documents", () => {
    expect(canViewClaimDocuments(claim(), ME)).toBe(true);
  });

  it("lets an admin see them — they review and settle every claim", () => {
    expect(canViewClaimDocuments(claim(), ADMIN)).toBe(true);
  });

  it("REFUSES a colleague, even holding the claim id", () => {
    expect(canViewClaimDocuments(claim(), COLLEAGUE)).toBe(false);
  });

  it("does not depend on the verdict — a settled claim is still readable", () => {
    for (const status of ["pending", "approved", "rejected"]) {
      expect(canViewClaimDocuments(claim({ status }), ME)).toBe(true);
      expect(canViewClaimDocuments(claim({ status }), COLLEAGUE)).toBe(false);
    }
  });

  it("treats a missing isAdmin flag as not-an-admin", () => {
    expect(canViewClaimDocuments(claim({ employeeId: "someone-else" }), { id: "x" })).toBe(false);
    expect(
      canViewClaimDocuments(claim({ employeeId: "someone-else" }), { id: "x", isAdmin: false }),
    ).toBe(false);
  });
});

/* ── Changing ─────────────────────────────────────────────────────────────── */

describe("canChangeClaimDocuments", () => {
  it("lets the claimant add or remove while the claim is pending", () => {
    expect(canChangeClaimDocuments(claim(), ME)).toBe(true);
  });

  it("REFUSES the claimant once the claim has been decided", () => {
    // A receipt swapped after approval changes the evidence behind a verdict
    // already given; after payment, behind money already moved.
    expect(canChangeClaimDocuments(claim({ status: "approved" }), ME)).toBe(false);
    expect(canChangeClaimDocuments(claim({ status: "rejected" }), ME)).toBe(false);
  });

  it("REFUSES AN ADMIN, even on a pending claim — narrower than viewing", () => {
    // The person who approves the claim must not also be able to swap the
    // receipt: that removes the only independent evidence behind their own
    // decision. An admin reopens the claim instead.
    expect(canChangeClaimDocuments(claim(), ADMIN)).toBe(false);
  });

  it("REFUSES a colleague outright", () => {
    expect(canChangeClaimDocuments(claim(), COLLEAGUE)).toBe(false);
  });

  it("is strictly narrower than viewing — never the other way round", () => {
    const cases = [
      [claim(), ME],
      [claim(), ADMIN],
      [claim(), COLLEAGUE],
      [claim({ status: "approved" }), ME],
      [claim({ status: "approved" }), ADMIN],
      [claim({ status: "rejected" }), COLLEAGUE],
    ] as const;
    for (const [c, viewer] of cases) {
      if (canChangeClaimDocuments(c, viewer)) {
        expect(canViewClaimDocuments(c, viewer)).toBe(true);
      }
    }
  });
});

/* ── The refusal message ──────────────────────────────────────────────────── */

describe("claimChangeRefusal", () => {
  it("is null when the change is allowed", () => {
    expect(claimChangeRefusal(claim(), ME)).toBeNull();
  });

  it("says WHOSE claim it is when someone else tries", () => {
    expect(claimChangeRefusal(claim(), COLLEAGUE)).toMatch(/your own claim/i);
  });

  it("says the claim is already decided when the verdict is in", () => {
    expect(claimChangeRefusal(claim({ status: "approved" }), ME)).toMatch(/already been decided/i);
  });

  it("reports OWNERSHIP first — never leaks that someone else's claim is settled", () => {
    // A colleague probing a claim id must not learn its status from the error.
    const msg = claimChangeRefusal(claim({ employeeId: "emp-other", status: "approved" }), ME);
    expect(msg).toMatch(/your own claim/i);
    expect(msg).not.toMatch(/decided/i);
  });

  it("agrees with the predicate on every combination", () => {
    for (const viewer of [ME, ADMIN, COLLEAGUE]) {
      for (const status of ["pending", "approved", "rejected"]) {
        const c = claim({ status });
        expect(claimChangeRefusal(c, viewer) === null).toBe(
          canChangeClaimDocuments(c, viewer),
        );
      }
    }
  });
});
