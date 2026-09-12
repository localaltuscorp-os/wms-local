import { describe, it, expect } from "vitest";
import {
  ariaSort,
  attachmentCount,
  compareBySerial,
  describeJdSort,
  nextSort,
  notesText,
  sortJdRows,
  targetCount,
  type JdSortableRow,
  type JdSortKey,
  type JdSortState,
} from "@/lib/jd/bank-sort";

/**
 * SORTING THE JD BANK (account holder, 2026-09-12).
 *
 * Ten columns, and three of them hold SETS rather than values — Attachment,
 * Add To and Add To Person. What those sort by, and where an empty one lands,
 * is the part no screenshot shows and the part a reader will notice first.
 */

type Row = JdSortableRow & { id: string };

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    serialNo: `JD-${id}`,
    positionTitle: "Admin - Executive",
    functionKey: "admin",
    task: `Task ${id}`,
    notesHtml: null,
    estimatedMinutes: 15,
    videoUrl: null,
    guidelinesUrl: null,
    templateUrl: null,
    pushDcc: false,
    pushWms: false,
    pushEvent: false,
    assignees: [],
    ...over,
  };
}

const LABELS: Record<string, string> = {
  admin: "Admin",
  apps: "Apps/IT",
  hr: "HR",
  accounts: "Accounts",
};

const ctx = {
  labelOfFunction: (k: string) => LABELS[k] ?? k,
  describeFrequency: (r: Row) => (r.id === "daily" ? "Daily (Mon–Sat)" : "Every Monday"),
};

const ids = (rows: Row[]) => rows.map((r) => r.id);
const by = (rows: Row[], key: JdSortKey, dir: "asc" | "desc") =>
  ids(sortJdRows(rows, { key, dir }, ctx));

describe("the Bank's own order", () => {
  it("is by serial, counting properly past nine", () => {
    // A plain string compare puts JD-10 before JD-9, which looks like the Bank
    // lost a row.
    const rows = [row("10"), row("9"), row("1")];
    expect(ids(sortJdRows(rows, null, ctx))).toEqual(["1", "9", "10"]);
  });

  it("is what Sr. No. sorts by, forwards and backwards", () => {
    // The serial column was replaced by a row ordinal, so Sr. No. has no stored
    // value of its own — it can only mean the register's order or its reverse.
    const rows = [row("2"), row("1"), row("3")];
    expect(by(rows, "sr", "asc")).toEqual(["1", "2", "3"]);
    expect(by(rows, "sr", "desc")).toEqual(["3", "2", "1"]);
  });

  it("never reorders the caller's array", () => {
    const rows = [row("2"), row("1")];
    const before = ids(rows);
    sortJdRows(rows, { key: "task", dir: "asc" }, ctx);
    expect(ids(rows)).toEqual(before);
  });
});

describe("sorting by what is printed, not what is stored", () => {
  it("orders Function by its label, so Apps/IT is not filed under 'a'", () => {
    /* The stored keys are `admin`, `apps`, `hr`. Sorting on those puts Apps/IT
       second and HR last; sorting on the labels the grid prints puts Accounts,
       Admin, Apps/IT, HR — which is the order a reader sees. */
    const rows = [
      row("hr", { functionKey: "hr" }),
      row("apps", { functionKey: "apps" }),
      row("acc", { functionKey: "accounts" }),
    ];
    expect(by(rows, "function", "asc")).toEqual(["acc", "apps", "hr"]);
  });

  it("orders Frequency by the sentence the column shows", () => {
    const rows = [row("weekly"), row("daily")];
    expect(by(rows, "frequency", "asc")).toEqual(["daily", "weekly"]);
  });

  it("orders Time Estimated as a number", () => {
    // As text, "120" sorts before "15".
    const rows = [
      row("b", { estimatedMinutes: 15 }),
      row("a", { estimatedMinutes: 5 }),
      row("c", { estimatedMinutes: 120 }),
    ];
    expect(by(rows, "estimate", "asc")).toEqual(["a", "b", "c"]);
    expect(by(rows, "estimate", "desc")).toEqual(["c", "b", "a"]);
  });
});

describe("the three set columns", () => {
  it("counts what a JD actually holds", () => {
    expect(attachmentCount(row("x", { videoUrl: "u", templateUrl: "t" }))).toBe(2);
    expect(targetCount(row("x", { pushDcc: true, pushWms: true, pushEvent: true }))).toBe(3);
  });

  it("sorts Attachment by how many slots are filled, empties last both ways", () => {
    const none = row("none");
    const one = row("one", { guidelinesUrl: "g" });
    const three = row("three", { videoUrl: "v", guidelinesUrl: "g", templateUrl: "t" });
    expect(by([none, three, one], "attachment", "asc")).toEqual(["one", "three", "none"]);
    // Reversed, the JDs WITH an SOP still lead — a column of dashes at the top
    // is not what anybody clicked for.
    expect(by([none, one, three], "attachment", "desc")).toEqual(["three", "one", "none"]);
  });

  it("sorts Add To the same way", () => {
    const none = row("none");
    const two = row("two", { pushDcc: true, pushWms: true });
    expect(by([none, two], "addto", "asc")).toEqual(["two", "none"]);
    expect(by([none, two], "addto", "desc")).toEqual(["two", "none"]);
  });

  it("sinks 'by position' rows in Add To Person, under both arrows", () => {
    /* An empty Add To Person is not unowned — it means the seat's holder does
       it — but it has no NAME to sort, so it belongs at the end either way. */
    const seat = row("seat");
    const a = row("a", { assignees: ["Dattaram"] });
    const p = row("p", { assignees: ["Parvez"] });
    expect(by([seat, p, a], "person", "asc")).toEqual(["a", "p", "seat"]);
    expect(by([seat, a, p], "person", "desc")).toEqual(["p", "a", "seat"]);
  });
});

describe("Notes", () => {
  it("sorts on the text, with the markup stripped", () => {
    // The column prints a stripped preview, so it must sort on the same thing —
    // otherwise "<b>Alpha</b>" files under "<".
    expect(notesText(row("x", { notesHtml: "<p>Call <b>before</b> 9am</p>" }))).toBe(
      "Call before 9am",
    );
    const rows = [
      row("z", { notesHtml: "<p>Zebra</p>" }),
      row("a", { notesHtml: "<b>Alpha</b>" }),
    ];
    expect(by(rows, "notes", "asc")).toEqual(["a", "z"]);
  });

  it("treats a note of only markup as empty and sinks it", () => {
    const blank = row("blank", { notesHtml: "<p></p>" });
    const real = row("real", { notesHtml: "Ring the vendor" });
    expect(by([blank, real], "notes", "asc")).toEqual(["real", "blank"]);
    expect(by([blank, real], "notes", "desc")).toEqual(["real", "blank"]);
  });
});

describe("ties and the click cycle", () => {
  it("falls back to serial order when values match", () => {
    // Every JD at 15 minutes is the ordinary case; sorting by Time Estimated
    // there must not shuffle the register into something unrecognisable.
    const rows = [row("3"), row("1"), row("2")];
    expect(by(rows, "estimate", "asc")).toEqual(["1", "2", "3"]);
    expect(by(rows, "estimate", "desc")).toEqual(["1", "2", "3"]);
  });

  it("cycles ascending → descending → off", () => {
    let s: JdSortState = null;
    s = nextSort(s, "position");
    expect(s).toEqual({ key: "position", dir: "asc" });
    s = nextSort(s, "position");
    expect(s).toEqual({ key: "position", dir: "desc" });
    s = nextSort(s, "position");
    expect(s).toBeNull();
  });

  it("announces itself to a screen reader", () => {
    const s: JdSortState = { key: "task", dir: "asc" };
    expect(ariaSort(s, "task")).toBe("ascending");
    expect(ariaSort(s, "notes")).toBe("none");
  });

  it("describes the sort in the column's own words", () => {
    const label = (k: JdSortKey) =>
      ({ estimate: "Time Estimated", person: "Add To Person" } as Record<string, string>)[k] ?? k;
    expect(describeJdSort(null, label)).toBeNull();
    expect(describeJdSort({ key: "estimate", dir: "asc" }, label)).toBe(
      "Time Estimated (low to high)",
    );
    expect(describeJdSort({ key: "person", dir: "desc" }, label)).toBe("Add To Person (Z–A)");
  });

  it("compares serials numerically wherever it is used", () => {
    expect(compareBySerial(row("2"), row("10"))).toBeLessThan(0);
  });
});
