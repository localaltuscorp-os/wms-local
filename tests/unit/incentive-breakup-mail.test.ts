import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE INCENTIVE BREAKUP LETTER ON THE PAYMENT EDGE.
 *
 * It reuses the existing document pipeline (`getIncentiveBreakup` →
 * `renderIncentiveBreakupPdf`) and the existing delivery-claim table, so what is
 * worth pinning is the delivery SEMANTICS around it:
 *
 *  · one letter per (person, month, amount actually paid),
 *  · a replay sends nothing,
 *  · a real top-up in the same month DOES send (the amount moved),
 *  · a failed send releases its claim so a retry can still deliver,
 *  · an inactive employee is not mailed,
 *  · and none of it can fail the payout that already committed.
 */

const fake = vi.hoisted(() => ({
  recipient: { isActive: true, employmentStatus: "active" } as
    | { isActive: boolean; employmentStatus: string }
    | null,
  emails: {
    name: "Om Jadhav",
    email: "om@altus.test",
    officialEmail: "om.official@altus.test",
    personalEmail: null as string | null,
  } as Record<string, unknown> | null,
  claimed: new Set<string>(),
  lastClaim: null as string | null,
  released: 0,
  renders: 0,
  sends: 0,
  sendFails: false,
  breakupThrows: false,
  sentTo: [] as unknown[],
}));

vi.mock("@/lib/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        // The employee lookup (name + three addresses + active flags).
        limit: async () => (fake.emails && fake.recipient ? [{ ...fake.emails, ...fake.recipient }] : []),
      }),
    }),
  });
  const insert = () => ({
    values: (v: { eventType: string; subjectId: string; recipientId: string; versionKey: string }) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const key = `${v.eventType}|${v.subjectId}|${v.recipientId}|${v.versionKey}`;
          if (fake.claimed.has(key)) return [];
          fake.claimed.add(key);
          fake.lastClaim = key;
          return [{ id: key }];
        },
      }),
    }),
  });
  const del = () => ({
    where: async () => {
      if (fake.lastClaim) fake.claimed.delete(fake.lastClaim);
      fake.released += 1;
    },
  });
  return { db: { select, insert, delete: del } };
});

vi.mock("@/lib/incentive/breakup", () => ({
  getIncentiveBreakup: async (employeeId: string, month: string) => {
    if (fake.breakupThrows) throw new Error("breakup query exploded");
    return {
    employeeId,
    employeeName: "Om Jadhav",
    designation: "Executive",
      entity: "Altus Corp",
      month,
      monthLabel: "Apr 2026",
      fy: "FY 2026-27",
      lines: [],
      totals: { approved: 2000, paid: 500, reversal: -500, net: 0 },
    };
  },
}));

vi.mock("@/lib/incentive/breakup-pdf", () => ({
  renderIncentiveBreakupPdf: async () => {
    fake.renders += 1;
    return Buffer.from("%PDF-1.4 fake");
  },
}));

vi.mock("@/lib/email/report-emails", () => ({
  sendIncentiveBreakupEmail: async (args: unknown) => {
    fake.sends += 1;
    fake.sentTo.push(args);
    return fake.sendFails ? { id: null, error: "resend down" } : { id: "resend-1", error: null };
  },
}));

import { mailIncentiveBreakup } from "@/lib/incentive/notify-breakup";
import { isActiveEmployee } from "@/lib/incentive/notifications/eligibility";

const INPUT = { employeeId: "emp-1", month: "2026-04", paidTotal: 500 };

beforeEach(() => {
  fake.recipient = { isActive: true, employmentStatus: "active" };
  fake.emails = {
    name: "Om Jadhav",
    email: "om@altus.test",
    officialEmail: "om.official@altus.test",
    personalEmail: null,
  };
  fake.claimed.clear();
  fake.lastClaim = null;
  fake.released = 0;
  fake.renders = 0;
  fake.sends = 0;
  fake.sendFails = false;
  fake.breakupThrows = false;
  fake.sentTo = [];
});

describe("mailIncentiveBreakup", () => {
  it("sends the letter once and reports it", async () => {
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("sent");
    expect(fake.sends).toBe(1);
    expect(fake.renders).toBe(1);
  });

  it("a replay of the SAME payout sends nothing (duplicate claim)", async () => {
    await mailIncentiveBreakup(INPUT);
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("duplicate");
    expect(fake.sends).toBe(1);
  });

  it("a genuine top-up in the same month DOES send — the amount moved", async () => {
    await mailIncentiveBreakup(INPUT);
    await expect(mailIncentiveBreakup({ ...INPUT, paidTotal: 900 })).resolves.toBe("sent");
    expect(fake.sends).toBe(2);
  });

  it("a failed send releases its claim so a retry can still deliver", async () => {
    fake.sendFails = true;
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("failed");
    expect(fake.released).toBe(1);
    expect(fake.claimed.size).toBe(0);

    fake.sendFails = false;
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("sent");
  });

  it("does not mail an employee who has left", async () => {
    fake.recipient = { isActive: false, employmentStatus: "active" };
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("inactive");
    expect(fake.sends).toBe(0);
    expect(fake.claimed.size).toBe(0);
  });

  it("does not mail a former employee", async () => {
    fake.recipient = { isActive: true, employmentStatus: "resigned" };
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("inactive");
    expect(fake.sends).toBe(0);
  });

  it("uses the SAME active predicate the other incentive notices use", () => {
    // Not a re-implementation — the eligibility module is the single source.
    expect(isActiveEmployee({ isActive: true, employmentStatus: "active" })).toBe(true);
    expect(isActiveEmployee({ isActive: false, employmentStatus: "active" })).toBe(false);
  });

  it("skips (and does not claim) when no address is on file", async () => {
    fake.emails = {
      name: "Om Jadhav",
      email: "",
      officialEmail: null,
      personalEmail: null,
    };
    const res = await mailIncentiveBreakup(INPUT);
    expect(res).toBe("skipped");
    expect(fake.sends).toBe(0);
    // No claim taken, so fixing the address later still delivers a letter.
    expect(fake.claimed.size).toBe(0);
  });

  it("never throws — the money has already moved by the time this runs", async () => {
    fake.breakupThrows = true;
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("failed");
    expect(fake.sends).toBe(0);
    // The claim is released on the way out, so a later retry still delivers.
    expect(fake.claimed.size).toBe(0);
  });

  it("treats a missing employee record as inactive, not as a crash", async () => {
    fake.emails = null;
    await expect(mailIncentiveBreakup(INPUT)).resolves.toBe("inactive");
  });

  it("mails every address on file for ONE employee (work + personal)", async () => {
    fake.emails = {
      name: "Om Jadhav",
      email: "om@altus.test",
      officialEmail: "om.official@altus.test",
      personalEmail: "om.personal@example.test",
    };
    await mailIncentiveBreakup(INPUT);
    const args = fake.sentTo[0] as { recipient: { email: string[] } };
    expect(Array.isArray(args.recipient.email)).toBe(true);
    expect(args.recipient.email).toHaveLength(3);
  });

  it("carries the reversal into the mail so a clawback is never silent", async () => {
    await mailIncentiveBreakup(INPUT);
    const args = fake.sentTo[0] as { reversal: number; netTotal: number };
    expect(args.reversal).toBe(-500);
    expect(args.netTotal).toBe(0);
  });
});
