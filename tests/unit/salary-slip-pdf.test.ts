import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";

vi.mock("server-only", () => ({}));

import { renderSalarySlipPdf } from "@/lib/salary/salary-slip-pdf";
import type { SalarySlipData } from "@/lib/salary/salary-slip-data";
import type { DayLedger, LedgerDay, LedgerWeek } from "@/lib/salary/day-ledger";
import type { MySalaryMonth } from "@/lib/salary/my-salary";

/**
 * THE THREE-PAGE SALARY SLIP.
 *
 * Page count is a hard rule of this document, and the only way to know it holds
 * is to RENDER the thing and count. So this suite builds a synthetic month,
 * renders it, and reads the result back with pdf-lib:
 *
 *   · exactly three pages, however many weeks or incentives the month holds;
 *   · page 1 is the slip, page 2 the attendance calculation, page 3 the
 *     incentives — checked by the text actually drawn on each page;
 *   · NOTHING interactive: no form fields, no JavaScript, no optional-content
 *     layers. These were the old design's whole mechanism, and the brief bans
 *     every one of them, so each gets an explicit assertion rather than a
 *     comment.
 *   · one empty state, not five — a month with no incentives prints the empty
 *     message once and no empty tables above it.
 *
 * The figures are read straight from the `SalarySlipData` handed in, which is
 * the same object the web statement renders: if the renderer ever invented a
 * number, the page text would stop matching the fixture. The structural tests at
 * the end pin that this file adds no arithmetic of its own.
 */

function day(over: Partial<LedgerDay> & { date: string }): LedgerDay {
  return {
    dateLabel: "01 Apr",
    dayLabel: "Wed",
    weekday: 3,
    code: "P",
    status: "full_day",
    statusLabel: "Full Day",
    place: "office",
    inAt: "10:00",
    outAt: "19:00",
    workedMinutes: 540,
    requiredMinutes: 540,
    balanceMinutes: 0,
    earned: 700,
    standardEarning: 700,
    adjustment: 0,
    adjustmentReason: null,
    payableMinutes: 540,
    late: false,
    leftEarly: false,
    lateWaived: false,
    future: false,
    missingCheckOut: false,
    missingCheckIn: false,
    notes: [],
    ...over,
  };
}

function week(index: number): LedgerWeek {
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    day({ date: `2026-04-0${d}`, earned: d === 6 ? null : 700, adjustment: d === 3 ? -350 : 0 }),
  );
  return {
    index,
    weekKey: `2026-W${index}`,
    startDate: "2026-04-01",
    endDate: "2026-04-07",
    rangeLabel: "01 Apr – 07 Apr",
    days,
    totals: {
      workedMinutes: 3240,
      offDayWorkedMinutes: 0,
      requiredMinutes: 3240,
      balanceMinutes: 0,
      earned: 4200,
      adjustment: -350,
      counts: { full_day: 5, absent: 1, weekly_off: 1 },
    },
    engine: {
      expectedDays: 6,
      targetMinutes: 3240,
      carryInMinutes: 0,
      effectiveTargetMinutes: 3240,
      balanceAppliedMinutes: 0,
      deviationsWaived: false,
    },
  };
}

function ledger(weekCount: number): DayLedger {
  const weeks = Array.from({ length: weekCount }, (_, i) => week(i + 1));
  return {
    month: "2026-04",
    monthLabel: "Apr 2026",
    mode: "daily",
    moneyNote: null,
    hourlyRate: null,
    dailyRate: 700,
    hasMoney: true,
    dailyTargetMinutes: 540,
    weeklyTargetMinutes: 3240,
    weeks,
    days: weeks.flatMap((w) => w.days),
    totals: {
      workedMinutes: 3240 * weekCount,
      offDayWorkedMinutes: 0,
      requiredMinutes: 3240 * weekCount,
      balanceMinutes: 0,
      earned: 4200 * weekCount,
      adjustment: -350,
      counts: { full_day: 5 * weekCount, absent: weekCount, weekly_off: weekCount },
    },
    engine: {
      targetMinutes: 3240 * weekCount,
      actualMinutes: 3240 * weekCount,
      payableMinutesRaw: 3240 * weekCount,
      payableHours: 54 * weekCount,
      creditedMinutes: 0,
      monthlyHourBalanceMinutes: 0,
      netSurplusMinutes: 0,
      chargeableHalfDays: 0,
      warnedHalfDays: 0,
      waiverAbsorbedHalfDays: 0,
      unpaidLeaveDays: 0,
    },
    reconciliation: null,
  } as DayLedger;
}

const MONTH: MySalaryMonth = {
  month: "2026-04",
  label: "April 2026",
  designation: "Operations Consultant",
  companyName: "Altus Corp",
  source: "run",
  monthlyCtc: 22000,
  baseAmount: 20350,
  overtimeAmount: 650,
  attendanceDeduction: 1000,
  gross: 21000,
  pt: 200,
  tds: 0,
  advance: 0,
  previousPending: 0,
  finalPayment: 20800,
  salaryGiven: null,
  paid: false,
  hourly: false,
  workedHours: 198,
  targetHours: 234,
  overtimeHours: 5,
  hourlyRate: null,
  cells: [],
  weekTargetMinutes: 3240,
  ledger: null,
  present: 22,
  absent: 4,
  halfDay: 0,
  finalWorkingDays: 26,
  daysInMonth: 30,
  remarks: null,
};

function data(over: Partial<SalarySlipData> = {}): SalarySlipData {
  const weeks = over.ledger?.weeks.length ?? 5;
  return {
    identity: {
      employeeId: "e-1",
      name: "Mishtie Kanani",
      code: "A-101",
      designation: "Operations Consultant",
      fn: "Marketing",
      entity: "Altus Corp",
      workerType: "full_time",
      doj: "2026-04-01",
      month: "2026-04",
      monthLabel: "Apr 2026",
      fy: "FY 26-27",
      daysInMonth: 30,
    },
    month: MONTH,
    salary: {
      monthlyCtc: 22000,
      perDay: 733,
      payableDays: 26,
      earnings: [
        { label: "Attendance-based Salary", amount: 20350 },
        { label: "Overtime / Additional Pay", amount: 650 },
      ],
      gross: 21000,
      additions: [],
      additionTotal: 0,
      deductions: [
        { label: "Professional Tax", amount: 200 },
        { label: "Advance", amount: 0 },
      ],
      deductionTotal: 200,
      net: 20800,
      attendanceShortfall: 1000,
      paid: false,
      salaryGiven: null,
      remarks: null,
    },
    ledger: null,
    attendance: {
      present: 22,
      halfDay: 0,
      absent: 4,
      weeklyOff: 4,
      holiday: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      workedHours: 198,
      targetHours: 234,
      payableDays: 26,
    },
    incentive: {
      lines: [
        {
          entryId: "x-1",
          incentiveName: "Consulting Pitch",
          earned: 1000,
          paid: 1000,
          adjustment: 0,
          payable: 0,
          state: "paid",
          paidDate: "2026-05-13",
        },
        {
          entryId: "x-2",
          incentiveName: "Big Deal",
          earned: 5000,
          paid: 500,
          adjustment: -250,
          payable: 4250,
          state: "reversed",
          paidDate: "2026-05-13",
        },
      ],
      totals: { earned: 6000, paid: 1500, payable: 4250, adjustment: -250 },
      linesByMonth: {
        "2026-04": [
          {
            entryId: "x-1",
            incentiveName: "Consulting Pitch",
            earned: 1000,
            paid: 1000,
            adjustment: 0,
            payable: 0,
            state: "paid",
            paidDate: "2026-05-13",
          },
        ],
      },
      recordsByMonth: {
        "2026-04": [
          {
            id: "r-1",
            typeLabel: "Sales Pitch",
            prospect: "Meera Shah",
            introducer: "Ravi Kulkarni",
            productCodes: ["PS", "BSS"],
            productNames: ["PS", "BSS"],
            date: "2026-04-12",
            status: "approved",
          },
        ],
      },
      targetVsPaid: {
        month: "2026-04",
        thisMonth: { target: 2000, paid: 1000, attainmentPct: 50 },
        last3Months: { target: 6000, paid: 4000, attainmentPct: 66.7 },
        ytd: { target: 6000, paid: 4000, attainmentPct: 66.7 },
        perMonth: [],
      },
      windows: {
        thisMonth: ["2026-04"],
        last3: ["2026-02", "2026-03", "2026-04"],
        ytd: ["2026-04"],
      },
    },
    reimbursement: { lines: [], paidThisMonth: 0, awaitingPayment: 0 },
    retention: null,
    totalEarnings: 22300,
    ...over,
    ...(over.ledger ? {} : {}),
    // The ledger is built last so `weeks` reflects any override above.
    ...(over.ledger === undefined ? { ledger: ledger(weeks) } : {}),
  } as SalarySlipData;
}

// ── READING THE RENDERED PDF BACK ───────────────────────────────────────────

async function render(over: Partial<SalarySlipData> = {}) {
  const bytes = await renderSalarySlipPdf(data(over), { generatedBy: "Manan Vasa" });
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { doc, bytes: Buffer.from(bytes) };
}

/** Inflate one content stream and return its operators as text. */
function streamText(stream: unknown): string {
  if (stream instanceof PDFRawStream) {
    return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  }
  return "";
}

/**
 * Everything one page draws, as raw content-stream source.
 *
 * pdfkit compresses its streams, so a page's bytes are not searchable as
 * written — they have to be inflated first. What comes back is PDF operators
 * (`(text) Tj`), which is what the assertions below read.
 */
function pageSource(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents();
  if (!contents) return "";
  if (contents instanceof PDFArray) {
    const parts: string[] = [];
    for (let i = 0; i < contents.size(); i++) {
      parts.push(streamText(doc.context.lookup(contents.get(i))));
    }
    return parts.join("\n");
  }
  return streamText(doc.context.lookup(contents));
}

/**
 * Decode one `TJ` array's body into the text it paints.
 *
 * pdfkit writes every run as `[<hex> 50 <hex> 0] TJ` — hex strings with kerning
 * numbers between them, split wherever a pair needs tightening ("Gener" + "ated
 * by"). So the fragments of one `doc.text` call have to be decoded and rejoined
 * IN ORDER; matching the raw operators finds nothing at all.
 */
function decodeRun(body: string): string {
  const parts: string[] = [];
  const token = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^()\\])*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = token.exec(body)) !== null) {
    if (t[1] !== undefined) {
      parts.push(Buffer.from(t[1].replace(/\s+/g, ""), "hex").toString("latin1"));
    } else {
      parts.push(t[2] ?? "");
    }
  }
  return parts.join("");
}

/**
 * Everything a page paints, one line per `TJ` run.
 *
 * Runs are joined with a newline rather than with nothing: a phrase is only ever
 * asserted within a single `doc.text` call, and the separator keeps two abutting
 * runs from inventing one.
 */
function pageText(doc: PDFDocument, index: number): string {
  const source = pageSource(doc, index);
  return [...source.matchAll(/\[([^\]]*)\]\s*TJ/g)]
    .map((m) => decodeRun(m[1] ?? ""))
    .join("\n");
}

/** How many times a phrase appears on a page — for the ONE-empty-state rule. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ── THE PAGE COUNT ──────────────────────────────────────────────────────────

describe("the reader itself", () => {
  it("actually reads text off every page", async () => {
    // Every "must NOT contain" assertion below would pass on an empty string, so
    // the extractor gets its own guard: each page must yield its footer.
    const { doc } = await render();
    for (let i = 0; i < 3; i++) {
      const text = pageText(doc, i);
      expect(text.length).toBeGreaterThan(200);
      expect(text).toContain("Generated by Manan Vasa");
    }
  });
});

describe("the statement is exactly three pages", () => {
  it("renders three pages for a five-week month", async () => {
    const { doc } = await render();
    expect(doc.getPageCount()).toBe(3);
  });

  it("stays three pages when the month has four weeks", async () => {
    const { doc } = await render({ ledger: ledger(4) });
    expect(doc.getPageCount()).toBe(3);
  });

  it("stays three pages when the month has six weeks", async () => {
    const { doc } = await render({ ledger: ledger(6) });
    expect(doc.getPageCount()).toBe(3);
  });

  it("stays three pages with twelve incentives", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      entryId: `x-${i}`,
      incentiveName: `Incentive ${i}`,
      earned: 100,
      paid: 0,
      adjustment: 0,
      payable: 100,
      state: "unpaid",
      paidDate: null,
    }));
    const { doc } = await render({
      incentive: {
        ...data().incentive,
        lines: many,
        linesByMonth: { "2026-04": many },
        totals: { earned: 1200, paid: 0, payable: 1200, adjustment: 0 },
      },
    });
    expect(doc.getPageCount()).toBe(3);
  });

  it("stays three pages with six weeks AND twelve incentives", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      entryId: `x-${i}`,
      incentiveName: `Incentive ${i}`,
      earned: 100,
      paid: 0,
      adjustment: 0,
      payable: 100,
      state: "unpaid",
      paidDate: null,
    }));
    const { doc } = await render({
      ledger: ledger(6),
      incentive: {
        ...data().incentive,
        lines: many,
        linesByMonth: { "2026-04": many },
        totals: { earned: 1200, paid: 0, payable: 1200, adjustment: 0 },
      },
    });
    expect(doc.getPageCount()).toBe(3);
  });

  it("stays three pages when the engine has no ledger at all", async () => {
    const { doc } = await render({ ledger: null });
    expect(doc.getPageCount()).toBe(3);
  });
});

// ── EACH PAGE IS THE PAGE IT CLAIMS TO BE ───────────────────────────────────

describe("page 1 is the salary slip", () => {
  it("titles itself SALARY SLIP", async () => {
    const { doc } = await render();
    expect(pageText(doc, 0)).toContain("SALARY SLIP");
  });

  it("shows the employee, the four figures and the net", async () => {
    const text = pageText((await render()).doc, 0);
    for (const marker of [
      "MISHTIE KANANI",
      "EMPLOYEE CODE",
      "Operations Consultant",
      "MONTHLY CTC",
      "SALARY / DAY",
      "PAYABLE DAYS",
      "SALARY EARNED",
      "Gross Earnings",
      "Total Deductions",
      "NET SALARY PAYABLE",
      "TOTAL EARNINGS THIS MONTH",
    ]) {
      expect(text).toContain(marker);
    }
  });

  it("prints the rupees it was handed, not rupees of its own", async () => {
    const text = pageText((await render()).doc, 0);
    // `data()` supplies these; `inr` groups them Indian-style with the "Rs "
    // prefix (Helvetica has no rupee glyph).
    expect(text).toContain("Rs 22,000"); // monthly CTC
    expect(text).toContain("Rs 20,800"); // NET SALARY PAYABLE
    expect(text).toContain("Rs 22,300"); // TOTAL EARNINGS THIS MONTH
  });

  it("spells its subtraction in characters Helvetica can actually print", async () => {
    const text = pageText((await render()).doc, 0);
    // U+2212 has no glyph in WinAnsi and pdfkit writes it as byte 0x22, so the
    // caption used to print `additions " Rs 200 deductions` in the real file.
    expect(text).toContain("Rs 0 additions - Rs 200 deductions");
    expect(text).not.toContain("−");
  });

  it("carries no attendance or incentive heading", async () => {
    const text = pageText((await render()).doc, 0);
    expect(text).not.toContain("ATTENDANCE & SALARY CALCULATION");
    expect(text).not.toContain("INCENTIVE STATEMENT");
    expect(text).not.toContain("WEEKLY SUMMARY");
  });
});

describe("page 2 is the attendance & salary calculation", () => {
  it("titles itself and summarises the month", async () => {
    const text = pageText((await render()).doc, 1);
    expect(text).toContain("ATTENDANCE & SALARY CALCULATION");
    expect(text).toContain("APR 2026");
    expect(text).toContain("WEEKLY SUMMARY");
    expect(text).toContain("MONTH CALCULATION");
    expect(text).toContain("Month total");
  });

  it("carries exactly the weeks the ledger produced — five here, not a fixed set", async () => {
    const text = pageText((await render()).doc, 1);
    for (const n of [1, 2, 3, 4, 5]) expect(text).toContain(`Week ${n}`);
    expect(text).not.toContain("Week 6");
  });

  it("prints a sixth week when the month really has six", async () => {
    const text = pageText((await render({ ledger: ledger(6) })).doc, 1);
    expect(text).toContain("Week 6");
    expect(text).not.toContain("Week 7");
  });

  it("stops at the last week the ledger has when there are only four", async () => {
    const text = pageText((await render({ ledger: ledger(4) })).doc, 1);
    expect(text).toContain("Week 4");
    expect(text).not.toContain("Week 5");
  });

  it("does NOT dump the days of every week", async () => {
    const text = pageText((await render()).doc, 1);
    // The old page drew one table per week — every day row with its own date and
    // status. Those strings are absent, which is the point of the redesign.
    expect(text).not.toContain("01 Apr");
    expect(text).not.toContain("Full Day");
    expect(text).not.toContain("Weekly Off");
  });

  it("prints the month's own totals from the ledger", async () => {
    const text = pageText((await render()).doc, 1);
    // `ledger(5)`: earned 4200 × 5; worked/required 3240 × 5 minutes.
    expect(text).toContain("Rs 21,000");
    expect(text).toContain("270h 00m / 270h 00m");
  });

  it("says so plainly when the engine has no day record", async () => {
    const text = pageText((await render({ ledger: null })).doc, 1);
    expect(text).toContain("no day-by-day record");
    expect(text).not.toContain("Week 1");
  });
});

describe("page 3 is the incentive statement", () => {
  it("titles itself and prints the four figures as tiles", async () => {
    const text = pageText((await render()).doc, 2);
    expect(text).toContain("INCENTIVE STATEMENT");
    for (const marker of ["EARNED", "PAID", "PAYABLE", "NEGATIVE PAYABLE"]) {
      expect(text).toContain(marker);
    }
    expect(text).toContain("Rs 6,000"); // earned
    expect(text).toContain("Rs 1,500"); // paid
    expect(text).toContain("Rs 4,250"); // payable
  });

  it("lists the month's records with the figures it was handed", async () => {
    const text = pageText((await render()).doc, 2);
    expect(text).toContain("INCENTIVE RECORDS");
    expect(text).toContain("INCENTIVE PAYMENTS");
    expect(text).toContain("Meera Shah"); // prospect
    expect(text).toContain("Ravi Kulkarni"); // introducer
    expect(text).toContain("PS (PS), BSS (BSS)"); // product name + code, from the master
    expect(text).toContain("Consulting Pitch");
    expect(text).toContain("Month total");
  });

  it("prints the period summary once", async () => {
    const text = pageText((await render()).doc, 2);
    expect(occurrences(text, "TARGET VS ACHIEVEMENT")).toBe(1);
    expect(occurrences(text, "This Month")).toBe(1);
    expect(occurrences(text, "Last 3 Months")).toBe(1);
    expect(occurrences(text, "Year to Date")).toBe(1);
    expect(text).toContain("50.0%");
  });

  it("carries no slip or attendance heading", async () => {
    const text = pageText((await render()).doc, 2);
    expect(text).not.toContain("SALARY SLIP");
    expect(text).not.toContain("WEEKLY SUMMARY");
    expect(text).not.toContain("NET SALARY PAYABLE");
  });
});

// ── ONE EMPTY STATE, NOT FIVE ───────────────────────────────────────────────

describe("a month with no incentives", () => {
  const NONE: Partial<SalarySlipData> = {
    incentive: {
      ...data().incentive,
      lines: [],
      linesByMonth: {},
      recordsByMonth: {},
      totals: { earned: 0, paid: 0, payable: 0, adjustment: 0 },
    },
  };

  it("still renders three pages", async () => {
    const { doc } = await render(NONE);
    expect(doc.getPageCount()).toBe(3);
  });

  it("shows the empty state exactly once", async () => {
    const text = pageText((await render(NONE)).doc, 2);
    expect(occurrences(text, "No incentive records for this period.")).toBe(1);
  });

  it("shows no tables above or below it", async () => {
    const text = pageText((await render(NONE)).doc, 2);
    for (const marker of [
      "INCENTIVE RECORDS",
      "INCENTIVE PAYMENTS",
      "TARGET VS ACHIEVEMENT",
      "Month total",
      "no incentive payment",
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("keeps the tiles, so the page still states the month's zeroes", async () => {
    const text = pageText((await render(NONE)).doc, 2);
    expect(text).toContain("INCENTIVE STATEMENT");
    expect(text).toContain("Rs 0");
  });
});

// ── NOTHING INTERACTIVE ─────────────────────────────────────────────────────

describe("the file is a document, not an application", () => {
  it("has no form fields at all", async () => {
    const { doc } = await render();
    expect(doc.getForm().getFields()).toEqual([]);
  });

  it("declares no optional-content groups — the old design's layer mechanism", async () => {
    const { doc } = await render();
    expect(doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFName)).toBeUndefined();
  });

  it("carries no JavaScript and no interactive-action dictionary", async () => {
    const { bytes } = await render();
    const raw = bytes.toString("latin1");
    expect(raw).not.toContain("/JavaScript");
    expect(raw).not.toContain("/AcroForm");
    expect(raw).not.toContain("/OpenAction");
    expect(raw).not.toContain("/Launch");
  });

  it("no longer ships the layer-and-script helper", () => {
    // `lib/pdf/layered-form.ts` existed only to build the dropdown/layer PDF.
    // With the statement plain, nothing may import it again.
    expect(existsSync("lib/pdf/layered-form.ts")).toBe(false);
  });
});

// ── NO SECOND CALCULATION ───────────────────────────────────────────────────

describe("no second calculation lives in the PDF layer", () => {
  const pdf = readFileSync("lib/salary/salary-slip-pdf.ts", "utf8");
  const dataLayer = readFileSync("lib/salary/salary-slip-data.ts", "utf8");

  it("the renderer divides no salary figure", () => {
    for (const forbidden of ["annualCtc", "PT_AMOUNT", "monthlyCtc /", "payableDays *", "/ 12"]) {
      expect(pdf).not.toContain(forbidden);
    }
  });

  it("the renderer never reaches for the database", () => {
    for (const forbidden of ["@/lib/db", "drizzle-orm", "loadSalarySlipData("]) {
      expect(pdf).not.toContain(forbidden);
    }
  });

  it("the data layer reads the engines rather than re-deriving their numbers", () => {
    expect(dataLayer).toContain("loadMySalaryMonths");
    expect(dataLayer).toContain("getIncentiveAccountsLedger");
    expect(dataLayer).toContain("getReimbursementsForMonth");
    // No payroll formula of its own.
    for (const forbidden of ["computeSalary", "computeHourlySalary", "payableDaysByHours"]) {
      expect(dataLayer).not.toContain(forbidden);
    }
  });

  it("every page header is centred through the shared helper", () => {
    expect(pdf).toContain("centredPageTitle");
    expect(pdf).toMatch(/left \+ \(width - w\) \/ 2/);
  });

  it("counts the pages with addPage calls instead of a loop over views", () => {
    expect(pdf.match(/doc\.addPage\(\)/g)?.length).toBe(2);
  });
});
