import { describe, it, expect } from "vitest";
import {
  MAX_QUANTITY,
  checkQuantity,
  completedQuantityOf,
  quantityTargetOf,
  quantityText,
  targetFromTitle,
} from "@/lib/compliance/quantity";
import { wccOccurrences, type ComplianceItem } from "@/lib/compliance/schedule";
import { buildComplianceRows, summarise, type FillLike } from "@/lib/compliance/rows";
import { buildFounderEmail, type DueCompliance } from "@/lib/compliance/reminders";
import { teamGroups } from "@/lib/compliance/team";

/**
 * WCC / MCC — how many (account holder, 2026-09-19): a compliance with a target
 * above one asks, when it is marked Done, how many were completed.
 */

describe("which compliances count, read from the title", () => {
  it("reads the count a title asks for", () => {
    expect(targetFromTitle("Send 25 emails")).toBe(25);
    expect(targetFromTitle("Send 25 follow-up emails to dormant leads")).toBe(25);
    expect(targetFromTitle("Review the top 10 accounts")).toBe(10);
    expect(targetFromTitle("Post 3 reels by 5 pm")).toBe(3);
    expect(targetFromTitle("Make 1 call")).toBe(1);
  });

  it("finds no count in a title without one", () => {
    expect(targetFromTitle("Send update to Manan Sir")).toBeNull();
    expect(targetFromTitle("")).toBeNull();
    expect(targetFromTitle(null)).toBeNull();
  });

  it("does not mistake a time, a date, money, a code or a share for a count", () => {
    expect(targetFromTitle("Mark attendance before 9:45 am")).toBeNull();
    expect(targetFromTitle("Reply to every lead within 24 hours")).toBeNull();
    expect(targetFromTitle("Submit the report on 15 Sep")).toBeNull();
    expect(targetFromTitle("Pay Rs 500 petty cash")).toBeNull();
    expect(targetFromTitle("Top up ₹500 on the card")).toBeNull();
    expect(targetFromTitle("GST reconciliation (GSTR-2B vs books)")).toBeNull();
    expect(targetFromTitle("File returns by the 20th")).toBeNull();
    expect(targetFromTitle("Study 2.5 hours of the course")).toBeNull();
    expect(targetFromTitle("Hit 90 % attendance")).toBeNull();
    expect(targetFromTitle("Close level 2 support tickets")).toBeNull();
    expect(targetFromTitle("Print 1,000 flyers")).toBeNull();
  });

  it("will not guess between two counts", () => {
    expect(targetFromTitle("Send 25 emails and 10 LinkedIn messages")).toBeNull();
  });
});

describe("the target a compliance counts towards", () => {
  it("takes the compliance's own Target first, with its unit", () => {
    expect(quantityTargetOf({ title: "Tele-calls to workshop leads", targetNumber: "50.00", unit: "calls" })).toEqual({
      target: 50,
      unit: "calls",
      source: "target",
    });
  });

  it("falls back to the title, which has no unit of its own", () => {
    expect(quantityTargetOf({ title: "Send 25 emails", targetNumber: null })).toEqual({ target: 25, unit: null, source: "title" });
  });

  it("counts nothing for a target of one — simply Done", () => {
    expect(quantityTargetOf({ title: "Make 1 call" })).toBeNull();
    expect(quantityTargetOf({ title: "Send update to Manan Sir" })).toBeNull();
    expect(quantityTargetOf({ title: "Edit one reel", targetNumber: "1.00", unit: "reels" })).toBeNull();
  });

  it("lets a Target of 1 silence a number in the title that is not a count", () => {
    expect(quantityTargetOf({ title: "Send 25 emails", targetNumber: "1" })).toBeNull();
  });

  it("counts nothing for a Target that is measured, not counted", () => {
    expect(quantityTargetOf({ title: "Study", targetNumber: "2.50", unit: "hours" })).toBeNull();
  });
});

describe("the count the doer enters", () => {
  it("takes a whole number, 0 or more", () => {
    expect(checkQuantity("18")).toEqual({ ok: true, value: 18 });
    expect(checkQuantity(" 0 ")).toEqual({ ok: true, value: 0 });
    expect(checkQuantity(String(MAX_QUANTITY))).toEqual({ ok: true, value: MAX_QUANTITY });
  });

  it("refuses a blank, a negative, a fraction, words and a typo-sized number", () => {
    for (const bad of ["", "   ", "-3", "2.5", "18 emails", "abc", "1e3", String(MAX_QUANTITY + 1)]) {
      expect(checkQuantity(bad).ok, bad).toBe(false);
    }
    expect(checkQuantity("")).toMatchObject({ error: "Enter how many were completed." });
  });

  it("reads a fill's own count, or the whole-number value the old DCC board or the app wrote", () => {
    expect(completedQuantityOf({ completedQuantity: 18, valueNumber: "18.00" })).toBe(18);
    expect(completedQuantityOf({ completedQuantity: 0 })).toBe(0);
    expect(completedQuantityOf({ completedQuantity: null, valueNumber: "19.00" })).toBe(19);
    expect(completedQuantityOf({ completedQuantity: null, valueNumber: "2.50" })).toBeNull();
    expect(completedQuantityOf({ completedQuantity: null, valueNumber: "-1" })).toBeNull();
    expect(completedQuantityOf({ completedQuantity: null, valueNumber: null })).toBeNull();
    expect(completedQuantityOf(null)).toBeNull();
  });

  it("writes a count against its target", () => {
    expect(quantityText(18, { target: 25, unit: "emails" })).toBe("18 / 25 emails");
    expect(quantityText(null, { target: 4, unit: null })).toBe("— / 4");
  });
});

/* ── Rows, the summary and the report ──────────────────────────────────── */

// 2026-09-15 is a Tuesday.
const item = (over: Partial<ComplianceItem>): ComplianceItem => ({
  id: "i1",
  ownerEmployeeId: "p1",
  title: "Send 25 emails",
  section: null,
  code: null,
  frequency: null,
  weekdays: 0b0111111,
  scheduleKind: "scheduled",
  monthDay: null,
  isParticipantList: false,
  sortOrder: 1,
  createdById: null,
  activeFrom: null,
  ...over,
});

const fill = (over: Partial<FillLike>): FillLike => ({
  itemId: "i1",
  entryDate: "2026-09-15",
  status: null,
  doerStatus: null,
  doneAt: null,
  note: null,
  approverStatus: null,
  approverNotes: null,
  updatedAt: null,
  ...over,
});

const rowsOf = (it: ComplianceItem, f: FillLike | null) => {
  const occ = wccOccurrences([it], "2026-09-15", "2026-09-15");
  return buildComplianceRows({
    occurrences: occ,
    fills: new Map(f ? [[occ[0]!.key, f]] : []),
    items: new Map([[it.id, it]]),
    names: new Map([["p1", "Priya"]]),
    masters: new Map(),
    today: "2026-09-18",
    viewer: { id: "p1", isAdmin: false, fillsForAnyone: false, visibleIds: new Set(["p1"]), canManageFor: () => true },
  });
};

describe("a row that counts", () => {
  it("carries its target and, once Done, how many were completed", () => {
    const [r] = rowsOf(item({}), fill({ doerStatus: "done", status: "Done", completedQuantity: 18, valueNumber: "18" }));
    expect(r!.quantity).toEqual({ target: 25, unit: null, source: "title" });
    expect(r!.completedQuantity).toBe(18);
  });

  it("shows no count on a row that is not Done", () => {
    const [r] = rowsOf(item({}), fill({ doerStatus: "initiated", status: "Pending", completedQuantity: 18 }));
    expect(r!.quantity?.target).toBe(25);
    expect(r!.completedQuantity).toBeNull();
  });

  it("reads the value on a fill the Android app marked Done in the old words", () => {
    const it = item({ title: "Tele-calls to workshop leads", targetNumber: "50.00", unit: "calls" });
    const [r] = rowsOf(it, fill({ status: "Done", valueNumber: "45.00" }));
    expect(r!.doerStatus).toBe("done");
    expect(r!.completedQuantity).toBe(45);
    expect(r!.targetNumber).toBe("50.00");
    expect(r!.unit).toBe("calls");
  });

  it("gives a compliance that does not count no quantity at all", () => {
    const [r] = rowsOf(item({ title: "Send update to Manan Sir" }), fill({ doerStatus: "done", status: "Done", valueNumber: "3" }));
    expect(r!.quantity).toBeNull();
    expect(r!.completedQuantity).toBeNull();
  });

  it("sums the counts in the summary, and counts who fell short", () => {
    const short = rowsOf(item({}), fill({ doerStatus: "done", status: "Done", completedQuantity: 18 }));
    const full = rowsOf(item({ id: "i2", title: "Make 10 calls" }), fill({ itemId: "i2", doerStatus: "done", status: "Done", completedQuantity: 12 }));
    const open = rowsOf(item({ id: "i3", title: "Screen 5 CVs" }), null);
    const plain = rowsOf(item({ id: "i4", title: "Send update to Manan Sir" }), fill({ itemId: "i4", doerStatus: "done", status: "Done" }));
    const s = summarise([...short, ...full, ...open, ...plain], "2026-09-18");
    expect(s).toMatchObject({ quantityDue: 3, quantityTarget: 40, quantityCompleted: 30, shortOfTarget: 1 });
    expect(s.due).toBe(4);
  });
});

describe("Manan Sir's Wednesday / Saturday email", () => {
  const people = [
    { id: "m", name: "Manan", managerId: null },
    { id: "a", name: "Aarti", managerId: "m" },
    { id: "a1", name: "Zoya", managerId: "a" },
  ];
  const email = (due: DueCompliance[]) =>
    buildFounderEmail({
      founder: { id: "m", name: "Manan", managerId: null, address: "manan@x.in" },
      groups: teamGroups("m", people),
      names: new Map(people.map((p) => [p.id, p.name])),
      due,
      today: "2026-09-17",
      weekDates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      monthDates: Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
      last3: ["2026-09-15", "2026-09-16", "2026-09-17"],
      previewFor: null,
    });
  const done = (over: Partial<DueCompliance>): DueCompliance => ({
    ownerId: "a1",
    kind: "wcc",
    title: "Send 25 emails",
    deadline: "2026-09-16",
    filled: true,
    done: true,
    target: 25,
    unit: "emails",
    completed: 25,
    ...over,
  });

  it("lists who marked Done short of the target in the last 3 days", () => {
    const html = email([done({ completed: 18 })]).html;
    expect(html).toContain("Done short of target");
    expect(html).toContain("18 of 25 emails");
    expect(html).toContain("Zoya");
    expect(html).toContain("Aarti's team");
  });

  it("leaves out the full counts, the uncounted, the open and the older days", () => {
    const html = email([
      done({}),
      done({ completed: null }),
      done({ done: false, completed: null }),
      done({ target: null, completed: null }),
      done({ completed: 5, deadline: "2026-09-10" }),
    ]).html;
    expect(html).not.toContain("Done short of target");
  });
});
