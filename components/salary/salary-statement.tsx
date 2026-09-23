"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Wallet } from "lucide-react";
import type { SalarySlipData } from "@/lib/salary/salary-slip-data";
import {
  DAY_STATUS_LABELS,
  hm,
  inr,
  signedHm,
  signedInr,
  shortDate,
  viewTotals,
  type LedgerWeek,
  type LedgerWeekView,
} from "@/lib/salary/day-ledger";

/**
 * SALARY STATEMENT — the employee's slip, their attendance calculation and their
 * incentives, on one page.
 *
 * ── EVERY FIGURE IS READ, NONE IS COMPUTED ─────────────────────────────────
 * The whole page renders `SalarySlipData`, which one server function builds
 * (`loadSalarySlipData`) out of the same attendance, salary and incentive
 * engines My Salary and the Accounts module read. This component does NO
 * arithmetic on money: not a sum, not a difference, not a percentage. Whatever
 * it shows is a field it was handed. That is what makes the web statement and
 * the PDF incapable of disagreeing — they render the same object.
 *
 * The one deliberate exception is the ADJ. column's sign, which is a rendering
 * decision (a plus, a minus, a dash), taken from `signedInr` — the engine's own
 * formatter, not a copy of its rule.
 *
 * ── THE VIEWS LIVE IN THE URL ──────────────────────────────────────────────
 * `?view=` and `?inv=` decide what is drawn, so the page stays server-rendered:
 * one week is on the page at a time, not twelve weeks hidden behind CSS. The
 * selects push a new URL rather than holding state, which also makes any view a
 * link somebody can send.
 */

type View = "summary" | "week" | "incentive";

/** The four incentive windows the slip data actually supports. */
const INCENTIVE_VIEWS = [
  { id: "monthly", label: "Monthly Summary" },
  { id: "thisMonth", label: "This Month" },
  { id: "last3", label: "Last 3 Months" },
  { id: "ytd", label: "Year To Date" },
  { id: "individual", label: "Individual Incentive" },
] as const;

type IncentiveView = (typeof INCENTIVE_VIEWS)[number]["id"];

export function SalaryStatement({
  data,
  months,
  month,
  employeeId,
  initialView,
  initialIncentive,
}: {
  data: SalarySlipData;
  months: { month: string; label: string }[];
  month: string;
  /** Whose statement this is — the PDF link opens THIS person's month. */
  employeeId: string;
  initialView: string | null;
  initialIncentive: string | null;
}) {
  const router = useRouter();
  const { identity, salary, ledger, attendance, incentive, totalEarnings } = data;

  // `?view=week-3` names a week; anything else is the weekly summary.
  const weekMatch = /^week-(\d+)$/.exec(initialView ?? "");
  const weekIndex = weekMatch ? Number(weekMatch[1]) : null;
  const section: View = weekIndex != null ? "week" : "summary";

  const incView: IncentiveView =
    (INCENTIVE_VIEWS.find((v) => v.id === initialIncentive)?.id as IncentiveView | undefined) ??
    "monthly";

  /** Replace one query param, keeping the others — the page's only state. */
  const go = React.useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      router.push(`${window.location.pathname}?${sp.toString()}`, { scroll: false });
    },
    [router],
  );

  /** The PDF is generated from the SAME month this page is showing. */
  const pdfHref = `/salary/earnings/${employeeId}?month=${month}`;

  if (!salary) {
    return (
      <div className="rounded-3xl border border-solid border-hairline-strong bg-surface-card p-12 text-center">
        <span
          className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl"
          style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
        >
          <Wallet size={22} strokeWidth={2.2} />
        </span>
        <p className="text-[15px] font-semibold text-ink-muted">
          No salary statement for {identity.monthLabel}.
        </p>
        <p className="mt-1 text-[13px] text-ink-subtle">
          Your statement appears once the month has a pay record.
        </p>
      </div>
    );
  }

  const eligibleIncentives = incentive.lines;
  const incWindowMonths =
    incView === "thisMonth"
      ? incentive.windows.thisMonth
      : incView === "last3"
        ? incentive.windows.last3
        : incView === "ytd"
          ? incentive.windows.ytd
          : [month];
  // One list per window, from the data the server already grouped — no re-query
  // and no re-summing in the browser.
  const incLines = incWindowMonths.flatMap((m) => incentive.linesByMonth[m] ?? []);
  const incRecords = incWindowMonths.flatMap((m) => incentive.recordsByMonth[m] ?? []);
  const individualNames = [...new Set(eligibleIncentives.map((l) => l.incentiveName))];
  const individualName =
    initialView && individualNames.includes(initialView) ? initialView : (individualNames[0] ?? null);
  const individualLines = individualName
    ? eligibleIncentives.filter((l) => l.incentiveName === individualName)
    : [];

  return (
    <div className="space-y-6">
      {/* ── Download + month ─────────────────────────────────────────────── */}
      <div className="wg-rise flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-hairline bg-surface-card px-5 py-4 max-md:px-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
            Payroll month
          </span>
          <select
            aria-label="Payroll month"
            value={month}
            onChange={(e) => go({ month: e.target.value, view: null, inv: null })}
            className="cursor-pointer rounded-lg border border-hairline bg-surface-soft py-1.5 pl-3 pr-8 text-[13px] font-bold text-ink-strong"
          >
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <a
          href={pdfHref}
          className="inline-flex items-center gap-2 rounded-pill bg-altus-red px-4 py-2.5 text-[13.5px] font-bold text-white"
        >
          <Download size={15} strokeWidth={2.6} /> Download PDF
        </a>
      </div>

      {/* ═══════════ 1 · SALARY SLIP ═══════════════════════════════════════ */}
      <Card>
        <StatementHead
          eyebrow="Private & Confidential"
          title="Salary Slip"
          month={identity.monthLabel}
          right={`FY ${identity.fy}`}
        />
        <Section title="Employee Details">
          <Pairs
            items={[
              ["Employee", identity.name],
              ["Employee Code", identity.code ?? "—"],
              ["Designation", identity.designation ?? "—"],
              ["Function", identity.fn ?? "—"],
              ["Entity", identity.entity ?? "—"],
              ["Employee Type", identity.workerType ?? "—"],
              // Formatted like every other date on the page, so the slip does
              // not print a raw ISO string beside a printed date.
              ["Date of Joining", identity.doj ? shortDate(identity.doj) : "—"],
              ["Payroll Month", identity.monthLabel],
            ]}
          />
        </Section>
        <Section title="Salary Summary">
          <Pairs
            items={[
              ["Monthly CTC", inr(salary.monthlyCtc)],
              ["Salary / Day", inr(salary.perDay)],
              ["Payable Days", String(salary.payableDays)],
              ["Salary Earned", inr(salary.gross)],
            ]}
          />
        </Section>
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Earnings">
            <Lines rows={salary.earnings} total={{ label: "Gross Earnings", amount: salary.gross }} />
          </Section>
          <Section title="Deductions">
            <Lines
              rows={salary.deductions}
              total={{ label: "Total Deductions", amount: salary.deductionTotal }}
            />
          </Section>
        </div>
        {salary.additions.length > 0 && (
          <Section title="Additions">
            <Lines
              rows={salary.additions}
              total={{ label: "Total Additions", amount: salary.additionTotal }}
            />
          </Section>
        )}
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-5 py-4"
          style={{ background: "var(--color-surface-soft)" }}
        >
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
            Net Salary Payable
          </span>
          <span
            className="tabular-nums leading-none text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 3.2vw, 36px)",
            }}
          >
            {inr(salary.net)}
          </span>
        </div>
        <Section title="Total Earnings This Month">
          <Pairs
            items={[
              ["Salary", inr(salary.net)],
              // Read off the data, not summed here: the server already added the
              // paid incentives for the month (see SalarySlipIncentive.totals).
              ["Incentive Paid", inr(incentive.totals.paid)],
              ["Total", inr(totalEarnings)],
            ]}
          />
        </Section>
      </Card>

      {/* ═══════════ 2 · ATTENDANCE & SALARY CALCULATION ═══════════════════ */}
      <Card>
        <StatementHead title="Attendance & Salary Calculation" month={identity.monthLabel} />
        <Pairs
          items={[
            ["Payroll Month", identity.monthLabel],
            ["Number of Days", String(identity.daysInMonth)],
            ["Salary / Day", inr(salary.perDay)],
            ["Target Hours", attendance.targetHours != null ? `${attendance.targetHours}h` : "—"],
            ["Worked Hours", attendance.workedHours != null ? `${attendance.workedHours}h` : "—"],
            ["Payable Days", String(attendance.payableDays)],
          ]}
        />

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
              View
            </span>
            <select
              aria-label="Attendance view"
              value={weekIndex != null ? `week-${weekIndex}` : "summary"}
              onChange={(e) => go({ view: e.target.value === "summary" ? null : e.target.value })}
              className="cursor-pointer rounded-lg border border-hairline bg-surface-soft py-1.5 pl-3 pr-8 text-[13px] font-bold text-ink-strong"
            >
              <option value="summary">Weekly Summary</option>
              {/* BUILT FROM THE DATA: one option per week the ledger actually
                  produced. A six-week month gets six; nothing is hardcoded. */}
              {(ledger?.weeks ?? []).map((w) => (
                <option key={w.index} value={`week-${w.index}`}>
                  Week {w.index} · {w.rangeLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!ledger ? (
          <Empty text="This month has no day-by-day calculation." />
        ) : weekIndex != null ? (
          <WeekDetail
            week={ledger.weeks.find((w) => w.index === weekIndex) ?? null}
            dailyRate={ledger.dailyRate}
          />
        ) : (
          <WeeklySummary weeks={ledger.weeks} hasMoney={ledger.hasMoney} />
        )}
      </Card>

      {/* ═══════════ 3 · INCENTIVE STATEMENT ═══════════════════════════════ */}
      <Card>
        <StatementHead
          title="Incentive Statement"
          month={identity.monthLabel}
          right={`FY ${identity.fy}`}
        />

        <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Earned" value={inr(incentive.totals.earned)} />
          <Tile label="Paid" value={inr(incentive.totals.paid)} />
          <Tile label="Payable" value={inr(incentive.totals.payable)} />
          <Tile
            label="Negative Payable Adjustment"
            value={signedInr(incentive.totals.adjustment)}
            tone={incentive.totals.adjustment < 0 ? "down" : undefined}
          />
        </div>

        {eligibleIncentives.length === 0 ? (
          // ONE empty state for the whole statement, exactly as the brief asks —
          // not one per window, not one per card.
          <Empty text="No incentive records for this period." />
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
                  View
                </span>
                <select
                  aria-label="Incentive view"
                  value={incView}
                  onChange={(e) => go({ inv: e.target.value, view: null })}
                  className="cursor-pointer rounded-lg border border-hairline bg-surface-soft py-1.5 pl-3 pr-8 text-[13px] font-bold text-ink-strong"
                >
                  {INCENTIVE_VIEWS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              {incView === "individual" && individualNames.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
                    Incentive
                  </span>
                  <select
                    aria-label="Incentive"
                    value={individualName ?? ""}
                    onChange={(e) => go({ view: e.target.value })}
                    className="cursor-pointer rounded-lg border border-hairline bg-surface-soft py-1.5 pl-3 pr-8 text-[13px] font-bold text-ink-strong"
                  >
                    {individualNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {incView === "individual" ? (
              <IndividualIncentive
                name={individualName}
                lines={individualLines}
                records={incRecords}
              />
            ) : (
              <>
                <Section title="Incentive Records">
                  {incRecords.length === 0 ? (
                    <Empty text="No requests filed in this window." />
                  ) : (
                    <Table
                      head={["Incentive", "Prospect", "Introducer", "Product", "Date", "Status"]}
                      rows={incRecords.map((r) => [
                        r.typeLabel,
                        r.prospect || "—",
                        r.introducer || "—",
                        // NAME plus CODE, both from the Product Master.
                        r.productNames.length > 0
                          ? r.productNames
                              .map((n, i) => (r.productCodes[i] ? `${n} (${r.productCodes[i]})` : n))
                              .join(", ")
                          : "—",
                        r.date ? shortDate(r.date) : "—",
                        r.status,
                      ])}
                    />
                  )}
                </Section>

                <Section title="Incentive Payments">
                  <Table
                    head={["Incentive", "Earned", "Paid", "Payable", "Adjustment", "Payment Date"]}
                    rows={incLines.map((l) => [
                      l.incentiveName,
                      inr(l.earned),
                      inr(l.paid),
                      inr(l.payable),
                      signedInr(l.adjustment),
                      l.paidDate ? shortDate(l.paidDate) : "—",
                    ])}
                    align={[false, true, true, true, true, false]}
                    foot={[
                      "Month total",
                      inr(incentive.totals.earned),
                      inr(incentive.totals.paid),
                      inr(incentive.totals.payable),
                      signedInr(incentive.totals.adjustment),
                      "",
                    ]}
                  />
                </Section>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE 2'S TWO TABLES — the weekly summary, and one week in detail
   ══════════════════════════════════════════════════════════════════════════ */

/** Status counts a week carries, read by the engine's own DayStatus keys. */
function count(week: LedgerWeek, ...statuses: string[]): number {
  return statuses.reduce((n, s) => n + (week.totals.counts[s as never] ?? 0), 0);
}

function WeeklySummary({ weeks, hasMoney }: { weeks: LedgerWeek[]; hasMoney: boolean }) {
  // THE MONTH TOTAL IS THE ENGINE'S OWN ARITHMETIC. `viewTotals` is the function
  // the daily report already uses to total whatever set of weeks it is showing;
  // calling it here (with every week visible) means the bottom row of this table
  // and the total in the Daily Salary Report are produced by the same code.
  const totals = viewTotals(weeks as LedgerWeekView[], hasMoney);

  return (
    <Table
      head={[
        "Week",
        "Present",
        "Half Day",
        "Absent",
        "Weekly Off",
        "Worked / Target",
        "Salary Earned",
        "Deduction / Additional Pay",
      ]}
      rows={weeks.map((w) => [
        `Week ${w.index}`,
        String(count(w, "full_day", "overtime", "holiday_worked")),
        String(count(w, "half_day", "holiday_half")),
        String(count(w, "absent")),
        String(count(w, "weekly_off", "holiday")),
        `${hm(w.totals.workedMinutes)} / ${hm(w.totals.requiredMinutes)}`,
        w.totals.earned == null ? "—" : inr(w.totals.earned),
        signedInr(w.totals.adjustment),
      ])}
      align={[false, true, true, true, true, true, true, true]}
      foot={[
        "Month total",
        "",
        "",
        "",
        "",
        `${hm(totals.workedMinutes)} / ${hm(totals.requiredMinutes)}`,
        totals.earned == null ? "—" : inr(totals.earned),
        signedInr(totals.adjustment),
      ]}
    />
  );
}

function WeekDetail({ week, dailyRate }: { week: LedgerWeek | null; dailyRate: number | null }) {
  if (!week) return <Empty text="That week is not part of this month." />;

  return (
    <div className="mt-4 space-y-4">
      <Table
        head={["Date", "Day", "Scheduled", "Worked", "Status", "Salary Earned", "Deduction / Additional Pay"]}
        rows={week.days.map((d) => [
          d.dateLabel,
          d.dayLabel,
          d.requiredMinutes == null ? "—" : hm(d.requiredMinutes),
          hm(d.workedMinutes),
          DAY_STATUS_LABELS[d.status] ?? d.statusLabel,
          d.earned == null ? "—" : inr(d.earned),
          signedInr(d.adjustment),
        ])}
        align={[false, false, true, true, false, true, true]}
      />

      <div
        className="rounded-2xl border border-hairline px-4 py-3"
        style={{ background: "var(--color-surface-soft)" }}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
          Week {week.index} calculation
        </p>
        <Pairs
          items={[
            // The week's own target — the engine's `effectiveTargetMinutes` when
            // it has one (target less any carry-in already banked), else the sum
            // of the days' required minutes.
            [
              "Target Hours",
              hm(week.engine ? week.engine.effectiveTargetMinutes : week.totals.requiredMinutes),
            ],
            ["Worked Hours", hm(week.totals.workedMinutes)],
            // Signed: negative is short of target, positive is over it.
            ["Hours Difference", signedHm(week.totals.balanceMinutes)],
            ["Salary / Day", dailyRate == null ? "—" : inr(dailyRate)],
            ["Attendance Salary", week.totals.earned == null ? "—" : inr(week.totals.earned)],
            // ONE figure, two names: a negative adjustment IS the deduction and a
            // positive one IS the additional pay, so each line shows only its own
            // sign and the other stays blank rather than printing a misleading ₹0.
            [
              "Deduction",
              week.totals.adjustment != null && week.totals.adjustment < 0
                ? signedInr(week.totals.adjustment)
                : "—",
            ],
            [
              "Additional Pay",
              week.totals.adjustment != null && week.totals.adjustment > 0
                ? signedInr(week.totals.adjustment)
                : "—",
            ],
            ["Final Week Salary", week.totals.earned == null ? "—" : inr(week.totals.earned)],
          ]}
        />
      </div>
    </div>
  );
}

function IndividualIncentive({
  name,
  lines,
  records,
}: {
  name: string | null;
  lines: SalarySlipData["incentive"]["lines"];
  records: SalarySlipData["incentive"]["recordsByMonth"][string];
}) {
  if (!name || lines.length === 0) return <Empty text="That incentive has no record this month." />;
  const first = lines[0]!;
  // Prospect/Introducer/Product live on the REQUEST, the money on the LEDGER row,
  // and the two carry no shared key — the reason the PDF prints them as two
  // tables. With exactly one request in the window the pairing is unambiguous;
  // with more, showing one of them would attach a stranger's prospect to this
  // incentive, so the fields stay blank instead of guessing.
  const record = records?.length === 1 ? (records[0] ?? null) : null;

  return (
    <Section title={name}>
      <Pairs
        items={[
          ["Incentive Name", name],
          ["Prospect", record?.prospect || "—"],
          ["Introducer", record?.introducer || "—"],
          ["Product Code", record?.productCodes.join(", ") || "—"],
          ["Product Name", record?.productNames.join(", ") || "—"],
          ["Status", first.state],
          ["Payment Date", first.paidDate ? shortDate(first.paidDate) : "—"],
        ]}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Earned" value={inr(first.earned)} />
        <Tile label="Paid" value={inr(first.paid)} />
        <Tile label="Payable" value={inr(first.payable)} />
        <Tile
          label="Adjustment"
          value={signedInr(first.adjustment)}
          tone={first.adjustment < 0 ? "down" : undefined}
        />
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PRESENTATION PIECES — the WMS language the rest of the salary area uses
   ══════════════════════════════════════════════════════════════════════════ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="wg-rise rounded-3xl border border-hairline bg-surface-card px-5 py-5 max-md:px-4">
      {children}
    </section>
  );
}

function StatementHead({
  title,
  eyebrow,
  month,
  right,
}: {
  title: string;
  eyebrow?: string;
  month: string;
  right?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-hairline pb-3">
      <div>
        {eyebrow && (
          <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-ink-subtle">
            {eyebrow}
          </p>
        )}
        <h2
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22 }}
        >
          {title}
        </h2>
      </div>
      <div className="text-right">
        <p className="text-[12.5px] font-bold text-ink-soft">{month}</p>
        {right && <p className="text-[11.5px] text-ink-subtle">{right}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">{title}</p>
      {children}
    </div>
  );
}

function Pairs({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1">
          <dt className="text-[12.5px] text-ink-subtle">{k}</dt>
          <dd className="text-[13px] font-semibold tabular-nums text-ink-strong">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Lines({
  rows,
  total,
}: {
  rows: { label: string; amount: number }[];
  total: { label: string; amount: number };
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1">
          <span className="text-[13px] text-ink-soft">{r.label}</span>
          <span className="text-[13px] font-semibold tabular-nums text-ink-strong">{inr(r.amount)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <span className="text-[12.5px] font-bold text-ink-muted">{total.label}</span>
        <span className="text-[14px] font-black tabular-nums text-ink-strong">{inr(total.amount)}</span>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "down" }) {
  return (
    <div className="rounded-2xl border border-hairline px-4 py-3" style={{ background: "var(--color-surface-soft)" }}>
      <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p
        className="mt-1 tabular-nums text-[20px] font-black leading-none"
        style={{ color: tone === "down" ? "var(--color-altus-red)" : "var(--color-ink-strong)" }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * A table that can WRAP. Long incentive and product names are the norm here, so
 * every cell is allowed to break rather than push the table wider than the page
 * (the desktop/tablet requirement) — the same reason the PDF's columns are
 * measured rather than assumed.
 */
function Table({
  head,
  rows,
  align,
  foot,
}: {
  head: string[];
  rows: string[][];
  /** Right-align the money and count columns. */
  align?: boolean[];
  foot?: string[];
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`border-b border-hairline-strong pb-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted ${
                  align?.[i] ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`border-b border-hairline py-1.5 text-[12.5px] break-words ${
                    align?.[ci] ? "text-right tabular-nums" : ""
                  } ${ci === 0 ? "font-semibold text-ink-strong" : "text-ink-soft"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="py-3 text-[12.5px] text-ink-subtle">
                Nothing to show.
              </td>
            </tr>
          )}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((cell, ci) => (
                <td
                  key={ci}
                  className={`pt-2 text-[12.5px] font-black text-ink-strong ${
                    align?.[ci] ? "text-right tabular-nums" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-2xl border border-hairline px-4 py-6 text-center" style={{ background: "var(--color-surface-soft)" }}>
      <p className="text-[13px] text-ink-subtle">{text}</p>
    </div>
  );
}
