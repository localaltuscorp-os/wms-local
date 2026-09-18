import { describe, it, expect } from "vitest";
import {
  buildDccReportHtml,
  buildPersonReports,
  downlineOf,
  escapeHtml,
  GMAIL_CLIP_BYTES,
  planDccDailyEmails,
  type ReportEmployee,
  type ReportItem,
} from "@/lib/dcc/daily-report";

/**
 * THE 10 PM DCC REPORT — who gets what.
 *
 * The org below mirrors the real reporting lines on 2026-09-15:
 *   Manan → Jeevan, Rohan, Ruchita;  Rohan → Suresh;  Ruchita → Krish.
 * 2026-09-15 is a Tuesday; 2026-09-13 a Sunday.
 */

const DAY = "2026-09-15";
const OWNER = { name: "Vinal Patil", email: "vinal@example.com" };

const emp = (id: string, managerId: string | null, address: string | null = `${id}@example.com`): ReportEmployee => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  managerId,
  address,
});

const ORG: ReportEmployee[] = [
  emp("manan", null),
  emp("jeevan", "manan"),
  emp("rohan", "manan"),
  emp("ruchita", "manan"),
  emp("suresh", "rohan"),
  emp("krish", "ruchita"),
  emp("vinal", null),
];

const kpi = (id: string, owner: string, over: Partial<ReportItem> = {}): ReportItem => ({
  id,
  ownerEmployeeId: owner,
  section: "Self Hygiene",
  code: null,
  title: `KPI ${id}`,
  frequency: "Daily",
  weekdays: 0b111111,
  scheduleKind: "scheduled",
  isParticipantList: false,
  activeFrom: null,
  ...over,
});

describe("each person's sheet", () => {
  it("lists the KPIs due that day with their outcome", () => {
    const [r] = buildPersonReports(
      [emp("suresh", "rohan")],
      [kpi("a", "suresh"), kpi("b", "suresh"), kpi("c", "suresh")],
      [
        { itemId: "a", status: "Done", valueNumber: null, note: null },
        { itemId: "b", status: "Not done", valueNumber: null, note: "client away" },
      ],
      DAY,
    );
    expect(r!.rows.map((x) => x.outcome)).toEqual(["done", "notDone", "unfilled"]);
    expect(r).toMatchObject({ due: 3, done: 1, notDone: 1, notFilled: 1, compliance: 33, filled: 67 });
  });

  it("adds a non-due KPI only when it was filled, and keeps it out of the counts", () => {
    const [r] = buildPersonReports(
      [emp("suresh", "rohan")],
      [kpi("d", "suresh"), kpi("w", "suresh", { scheduleKind: "weekly" }), kpi("x", "suresh", { scheduleKind: "adhoc" })],
      [{ itemId: "w", status: "Done", valueNumber: null, note: null }],
      DAY,
    );
    expect(r!.rows.map((x) => [x.title, x.due])).toEqual([
      ["KPI d", true],
      ["KPI w", false],
    ]);
    expect(r!.due).toBe(1);
    expect(r!.done).toBe(0);
  });

  it("skips KPIs that did not exist yet, and people with nothing to report", () => {
    const reports = buildPersonReports(
      [emp("suresh", "rohan"), emp("krish", "ruchita")],
      [kpi("new", "suresh", { activeFrom: "2026-09-16" })],
      [],
      DAY,
    );
    expect(reports).toEqual([]);
  });

  it("sends nothing on a Sunday when nothing was due or filled", () => {
    expect(buildPersonReports([emp("suresh", "rohan")], [kpi("a", "suresh")], [], "2026-09-13")).toEqual([]);
  });
});

describe("reporting lines", () => {
  it("walks every level below a lead, excluding the lead", () => {
    expect([...downlineOf(ORG, "manan")].sort()).toEqual(["jeevan", "krish", "rohan", "ruchita", "suresh"]);
    expect([...downlineOf(ORG, "rohan")]).toEqual(["suresh"]);
    expect(downlineOf(ORG, "suresh").size).toBe(0);
  });

  it("survives a manager loop in the data", () => {
    const loop = [emp("a", "b"), emp("b", "a")];
    expect([...downlineOf(loop, "a")]).toEqual(["b"]);
  });
});

describe("who gets which email", () => {
  const items = ["manan", "jeevan", "rohan", "suresh", "krish"].map((id) => kpi(`k-${id}`, id));
  const reports = buildPersonReports(ORG, items, [], DAY);
  const plan = planDccDailyEmails({ employees: ORG, reports, day: DAY, owner: OWNER });
  const byKind = (kind: string) => plan.filter((p) => p.kind === kind);

  it("gives everyone with KPIs their own report", () => {
    expect(byKind("self").map((p) => p.recipientName).sort()).toEqual(["Jeevan", "Krish", "Manan", "Rohan", "Suresh"]);
  });

  it("gives each Team Lead everyone below them, and not themselves", () => {
    const team = Object.fromEntries(byKind("team").map((p) => [p.recipientName, p.people.map((r) => r.employee.id).sort()]));
    expect(team).toEqual({
      Manan: ["jeevan", "krish", "rohan", "suresh"],
      Rohan: ["suresh"],
      Ruchita: ["krish"],
    });
  });

  it("sends the all-employees report to the owner", () => {
    const [all] = byKind("all");
    expect(all!.to).toBe(OWNER.email);
    expect(all!.people).toHaveLength(5);
  });

  it("keeps a recipient with no address in the plan, with a null `to`", () => {
    const orgNoMail = ORG.map((e) => (e.id === "suresh" ? { ...e, address: null } : e));
    const p = planDccDailyEmails({ employees: orgNoMail, reports: buildPersonReports(orgNoMail, items, [], DAY), day: DAY, owner: OWNER });
    expect(p.find((x) => x.kind === "self" && x.recipientName === "Suresh")!.to).toBeNull();
  });
});

describe("the email", () => {
  it("escapes what people type", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
    const [r] = buildPersonReports(
      [emp("suresh", "rohan")],
      [kpi("a", "suresh", { title: "<script>x</script>" })],
      [{ itemId: "a", status: "Done", valueNumber: null, note: null }],
      DAY,
    );
    const [email] = planDccDailyEmails({ employees: [emp("suresh", "rohan")], reports: [r!], day: DAY, owner: OWNER });
    const html = buildDccReportHtml(email!, DAY, { siteUrl: "https://wms.example" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Done");
    expect(html).toContain("https://wms.example/dcc");
  });

  it("stays under Gmail's clip limit for a whole company's report", () => {
    // 23 people × 40 KPIs with long titles and notes — well past the real org.
    const staff = Array.from({ length: 23 }, (_, i) => emp(`person${i}`, null));
    const items = staff.flatMap((s) =>
      Array.from({ length: 40 }, (_, j) =>
        kpi(`${s.id}-${j}`, s.id, { title: `Follow up with the client on the weekly deliverable number ${j}`, section: "CORE DELIVERABLES + CLIENT-FACING SUPPORT" }),
      ),
    );
    const entries = items.map((it, j) => ({
      itemId: it.id,
      status: j % 3 === 0 ? "Not done" : "Done",
      valueNumber: null,
      note: j % 3 === 0 ? "Client did not respond to the call, will try again tomorrow" : null,
    }));
    const reports = buildPersonReports(staff, items, entries, DAY);
    const all = planDccDailyEmails({ employees: staff, reports, day: DAY, owner: OWNER }).find((p) => p.kind === "all")!;
    const html = buildDccReportHtml(all, DAY);
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(GMAIL_CLIP_BYTES);
    // Too long even without its Done rows: the per-person totals still arrive,
    // with the Not done counts, and the reader is told where the rest is.
    expect(html).toContain("too long for email");
    expect(html).toContain("Not done");
    expect(html).toContain("Person22");
  });

  it("drops only the Done rows when that is enough to fit", () => {
    const staff = Array.from({ length: 13 }, (_, i) => emp(`person${i}`, null));
    const items = staff.flatMap((s) =>
      Array.from({ length: 30 }, (_, j) => kpi(`${s.id}-${j}`, s.id, { title: `Weekly deliverable follow-up number ${j}` })),
    );
    const entries = items.map((it, j) => ({ itemId: it.id, status: j % 5 === 0 ? "Not done" : "Done", valueNumber: null, note: null }));
    const reports = buildPersonReports(staff, items, entries, DAY);
    const all = planDccDailyEmails({ employees: staff, reports, day: DAY, owner: OWNER }).find((p) => p.kind === "all")!;
    const html = buildDccReportHtml(all, DAY);
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(GMAIL_CLIP_BYTES);
    if (html.includes("left out")) expect(html).not.toContain("too long for email");
  });

  it("keeps every row when the report is short", () => {
    const [r] = buildPersonReports(
      [emp("suresh", "rohan")],
      [kpi("a", "suresh")],
      [{ itemId: "a", status: "Done", valueNumber: null, note: null }],
      DAY,
    );
    const [email] = planDccDailyEmails({ employees: [emp("suresh", "rohan")], reports: [r!], day: DAY, owner: OWNER });
    expect(buildDccReportHtml(email!, DAY)).not.toContain("left out");
  });

  it("names the real recipient in preview mode", () => {
    const [r] = buildPersonReports([emp("suresh", "rohan")], [kpi("a", "suresh")], [], DAY);
    const [email] = planDccDailyEmails({ employees: [emp("suresh", "rohan")], reports: [r!], day: DAY, owner: OWNER });
    const html = buildDccReportHtml(email!, DAY, { previewFor: "Suresh <suresh@example.com>" });
    expect(html).toContain("Preview.");
    expect(html).toContain("Suresh &lt;suresh@example.com&gt;");
    expect(html).toContain("Not filled");
  });
});
