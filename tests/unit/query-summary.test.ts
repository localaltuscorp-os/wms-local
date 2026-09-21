import { describe, it, expect } from "vitest";
import { bucketOf, filterRows, summarise } from "@/lib/hr/query-summary";
import { HR_TICKET_STATUSES, type HrTicketStatus } from "@/db/enums";

/**
 * THE KEY CARDS OVER "YOUR QUESTIONS".
 *
 * Six statuses collapse to three buckets, and the whole point is that the cards
 * and the badge on each row say the same thing. These pin the mapping and the
 * two ways it could quietly break: a new status appearing, and a filter that
 * does not agree with the count above it.
 */
describe("bucketOf — six HR statuses, three employee concerns", () => {
  it("treats New, In Progress and Reopened alike — all mean 'someone else has it'", () => {
    // The difference between them is HR's workflow, which the asker cannot act
    // on. Three separate cards would report HR's internals to the wrong person.
    expect(bucketOf("new")).toBe("withHr");
    expect(bucketOf("in_progress")).toBe("withHr");
    expect(bucketOf("reopened")).toBe("withHr");
  });

  it("puts Waiting on Employee in its own bucket — the one that needs action", () => {
    expect(bucketOf("waiting_on_employee")).toBe("waitingOnYou");
  });

  it("treats Resolved and Closed as finished", () => {
    expect(bucketOf("resolved")).toBe("resolved");
    expect(bucketOf("closed")).toBe("resolved");
  });

  it("gives every status in the enum a bucket", () => {
    // A status added later must not fall through to undefined and vanish from
    // the counts while still showing in the list below them.
    for (const s of HR_TICKET_STATUSES) {
      expect(["withHr", "waitingOnYou", "resolved"]).toContain(bucketOf(s));
    }
  });
});

describe("summarise", () => {
  const rows = (...st: HrTicketStatus[]) => st.map((status) => ({ status }));

  it("counts nothing as zeroes, not as absent", () => {
    expect(summarise([])).toEqual({ total: 0, withHr: 0, waitingOnYou: 0, resolved: 0 });
  });

  it("splits a mixed list across the three buckets", () => {
    const s = summarise(rows("new", "in_progress", "waiting_on_employee", "resolved", "closed"));
    expect(s).toEqual({ total: 5, withHr: 2, waitingOnYou: 1, resolved: 2 });
  });

  it("keeps the three buckets adding up to the total", () => {
    // If they ever stop adding up, one card is lying about the same rows.
    const s = summarise(rows(...HR_TICKET_STATUSES));
    expect(s.withHr + s.waitingOnYou + s.resolved).toBe(s.total);
  });
});

describe("filterRows — what a card shows when it is on", () => {
  const rows = [
    { id: "a", status: "new" as HrTicketStatus },
    { id: "b", status: "waiting_on_employee" as HrTicketStatus },
    { id: "c", status: "closed" as HrTicketStatus },
    { id: "d", status: "reopened" as HrTicketStatus },
  ];

  it("returns everything for 'all'", () => {
    expect(filterRows(rows, "all").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns exactly the rows the card counted", () => {
    const s = summarise(rows);
    expect(filterRows(rows, "withHr")).toHaveLength(s.withHr);
    expect(filterRows(rows, "waitingOnYou")).toHaveLength(s.waitingOnYou);
    expect(filterRows(rows, "resolved")).toHaveLength(s.resolved);
  });

  it("does not hand back the caller's array to mutate", () => {
    const out = filterRows(rows, "all");
    out.pop();
    expect(rows).toHaveLength(4);
  });
});
