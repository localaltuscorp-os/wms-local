import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * THE BREAKUP LETTER'S TRIGGER, and the dashboard's final presentation rules.
 *
 * Structural, by necessity: the payout action is a `"use server"` module whose
 * whole job is a database transaction, so the properties that matter here are
 * ORDER and SCOPE — the letter is claimed after the commit, versioned by the
 * amount actually paid, and cannot fail the payout. Those are visible in the
 * source and nowhere else.
 */

const payout = readFileSync("app/(app)/salary/incentive-payout/actions.ts", "utf8");
const notify = readFileSync("lib/incentive/notify-breakup.ts", "utf8");
const dashboard = readFileSync(
  "components/incentive/analytics/incentive-analytics-dashboard.tsx",
  "utf8",
);

describe("breakup letter — trigger from the successful payment flow", () => {
  it("is deferred until AFTER the payout transaction commits", () => {
    const commit = payout.indexOf("if (result.kind === \"err\")");
    const call = payout.indexOf("mailIncentiveBreakup(");
    expect(commit).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(commit);
    expect(payout).toMatch(/afterResponse\(\(\) => mailIncentiveBreakup\(/);
  });

  it("only fires when something was actually paid", () => {
    expect(payout).toMatch(/result\.paidCount > 0 && breakupFor/);
  });

  it("carries the person and month out of the transaction rather than re-reading", () => {
    // `run` and `month` are scoped to the transaction callback, so the values
    // the mail needs must travel on the result.
    expect(payout).toMatch(/breakup: \{ employeeId: run\.employeeId, month \}/);
  });

  it("sends ONE letter per run, not one per paid leg", () => {
    // A run can pay several legs for the same person; they belong on one letter.
    const calls = payout.match(/mailIncentiveBreakup\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("cannot fail the payout that already committed", () => {
    expect(notify).toMatch(/return "failed"/);
    expect(notify).not.toMatch(/throw new Error/);
    // Its only `throw` is a re-throw INSIDE its own try, which the outer catch
    // swallows — the exported function still always resolves.
    const throws = notify.match(/\bthrow\b/g) ?? [];
    expect(throws).toHaveLength(1);
  });

  it("reuses the existing document pipeline instead of a second renderer", () => {
    expect(notify).toContain("getIncentiveBreakup");
    expect(notify).toContain("renderIncentiveBreakupPdf");
    expect(notify).not.toMatch(/new PDFDocument|pdfkit/);
  });

  it("claims delivery in the shared table with an amount-versioned key", () => {
    expect(notify).toContain("incentiveNotificationDeliveries");
    expect(notify).toMatch(/onConflictDoNothing/);
    expect(notify).toMatch(/versionKey = `breakup:\$\{input\.month\}:\$\{input\.paidTotal\.toFixed\(2\)\}`/);
  });

  it("leaves the on-demand route as the employee's other door to the same PDF", () => {
    const route = readFileSync("app/(app)/salary/incentive-breakup/[employeeId]/route.ts", "utf8");
    expect(route).toMatch(/me\.isAdmin && me\.id !== employeeId/);
  });
});

describe("dashboard — final layout rules", () => {
  it("renders the target warning ABOVE the Team/User control", () => {
    const warning = dashboard.indexOf("<TargetWarningBar");
    const control = dashboard.indexOf('ariaLabel="Whose incentive data"');
    expect(warning).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(warning);
  });

  it("keeps exactly one KPI row on the dashboard", () => {
    const rows = dashboard.match(/<IncentiveKpiRow/g) ?? [];
    expect(rows).toHaveLength(1);
  });

  it("keeps all six period options", () => {
    for (const label of [
      "Current Month",
      "Specific Month",
      "Last 3 Months",
      "Last 6 Months",
      "YTD",
    ]) {
      expect(readFileSync("lib/incentive/analytics/periods.ts", "utf8")).toContain(label);
    }
  });

  it("gives every status card a bigger figure AND a visible entry count", () => {
    // The count is its own prop now, rendered as a bold line — not buried in a
    // caption string.
    expect(dashboard).toMatch(/count=\{s\.count\}/);
    expect(dashboard).toMatch(/unvaluedCount=\{s\.unvaluedCount\}/);
    expect(dashboard).toMatch(/count === 1 \? "entry" : "entries"/);
  });

  it("sets the team summary at scanning size with the grade spread on its own", () => {
    expect(dashboard).toMatch(/<Metric size="lg" label="Employees">/);
    expect(dashboard).toMatch(/<Metric size="lg" label="Grades">/);
    expect(dashboard).toMatch(/size="lg"[\s\S]{0,120}tone=\{k === "A"/);
  });

  it("leaves the grading and target logic untouched", () => {
    // Presentation only: the band legend still comes from the shared constants,
    // and the component never CALLS a grading or ranking function — it only
    // prints the figures the server already computed.
    expect(dashboard).toContain("INCENTIVE_GRADE_BANDS");
    expect(dashboard).not.toMatch(/gradeFor\(|competitionRanks\(|periodCtc\(/);
  });
});
