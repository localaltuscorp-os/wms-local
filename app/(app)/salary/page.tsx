import Link from "next/link";
import type { Route } from "next";
import { FileSpreadsheet, Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireFinanceAccess } from "@/lib/auth/finance-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { salaryBreakupMonths, listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { SalaryBreakupTable, type SalaryRow } from "@/components/salary/salary-breakup-table";
import { SalaryPeriodSelect } from "@/components/salary/salary-period-select";
import { SalaryEntitySelect, ALL_ENTITIES } from "@/components/salary/salary-entity-select";
import { SalaryExportButtons } from "@/components/salary/salary-export-buttons";
import { PageShell } from "@/components/layout/page-shell";
import {
  StatementDownloads,
  type StatementEmployee,
} from "@/components/salary/statement-downloads";
import { fyForMonth } from "@/lib/salary/period";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* Employees-module identity — matches the Attendance page. */
const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthLabel(ym: string, style: "long" | "short" = "long"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SalaryPage({ searchParams }: PageProps) {
  const me = await requireFinanceAccess();
  // TWO DIFFERENT WRITE GATES on this page, deliberately.
  //
  // Payment (record an amount, settle a row) is open to every FINANCE VIEWER —
  // admins, super-admins and the Accounts department — because recording what
  // has actually gone out is the accounts team's own job. `requireFinanceAccess`
  // above already admits exactly that population, so reaching this line is the
  // check; a normal employee is redirected to /hub and never sees a figure.
  //
  // Everything else that MOVES THE PAYABLE — the admin note, the wave-off grant
  // and the pre-payout adjustment — stays super-admin-only. Those change what is
  // owed; payment only records what was sent.
  const canRecordPayment = true;
  // Renamed from `canMarkPaid`: it no longer has anything to do with marking
  // payment. It now gates only the writes that MOVE the payable.
  const canEditPayable = isSuperAdmin(me.email);
  const sp = await searchParams;
  const months = await salaryBreakupMonths();
  const raw = typeof sp.month === "string" ? sp.month : undefined;
  // Default to the last COMPLETE month — not the current in-progress month (which
  // only has a day or two logged, so it would show tiny pro-rated pay). `months`
  // is newest-first; the first one before this IST month is the last full one.
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0] ?? "";
  const month = raw && MONTH_RE.test(raw) ? raw : defaultMonth;
  const allRows = month ? await listSalaryBreakup(month) : [];

  // ENTITY SCOPE, resolved server-side from `?entity=`. It used to be a
  // `useState` inside the workspace, under the header; the brief moves the
  // control into the header, which is a server component, so the scope has to
  // live on the URL for the server to honour it. It also makes the scope
  // shareable and reload-safe, exactly like `?month=`.
  const entities = [
    ...new Set(allRows.map((r) => r.companyName?.trim()).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b));
  const rawEntity = typeof sp.entity === "string" ? sp.entity : undefined;
  // An entity that isn't on this month's sheet falls back to All rather than
  // rendering an empty table — changing month must never strand the view.
  const entity = rawEntity && entities.includes(rawEntity) ? rawEntity : ALL_ENTITIES;
  const rows =
    entity === ALL_ENTITIES
      ? allRows
      : allRows.filter((r) => (r.companyName?.trim() ?? "") === entity);

  // WS-5/WS-6 — linked employees for the statement/earnings document downloads
  // (behind SALARY_STATEMENTS). Only rows with a resolved employeeId can be
  // used (attendance + incentive lookups key on it); dedupe by id.
  const statementsOn = process.env.SALARY_STATEMENTS !== "false";
  const statementEmployees: StatementEmployee[] = [];
  if (statementsOn) {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.employeeId && !seen.has(r.employeeId)) {
        seen.add(r.employeeId);
        statementEmployees.push({ id: r.employeeId, name: r.employeeName });
      }
    }
  }
  const fyStartYear = (() => {
    const [my, mm] = (month || "").split("-").map(Number);
    if (!my || !mm) return new Date().getFullYear();
    return mm >= 4 ? my : my - 1;
  })();

  // Plain serializable rows for the client table.
  const tableRows: SalaryRow[] = rows.map((r, i) => ({
    id: r.id,
    employeeId: r.employeeId,
    srNo: r.srNo ?? i + 1,
    employeeName: r.employeeName,
    avatarUrl: r.avatarUrl,
    designation: r.designation,
    companyName: r.companyName,
    present: r.present,
    absent: r.absent,
    halfDay: r.halfDay,
    weeklyOff: r.weeklyOff,
    totalDaysWorked: r.totalDaysWorked,
    finalWorkingDays: r.finalWorkingDays,
    daysInMonth: r.daysInMonth,
    monthlyCtc: r.monthlyCtc,
    payableAfterLeave: r.payableAfterLeave,
    pt: r.pt,
    payableAfterPt: r.payableAfterPt,
    advance: r.advance,
    previousPending: r.previousPending,
    finalPayment: r.finalPayment,
    paid: r.paid,
    amountPaid: r.amountPaid,
    adminNote: r.adminNote,
    waiveOffDays: r.waiveOffDays,
    waiveOffNote: r.waiveOffNote,
    payoutAdjustment: r.payoutAdjustment,
    payoutAdjustmentNote: r.payoutAdjustmentNote,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      {/* Full-width: the old `max-w-[1400px]` cap was what squeezed the payroll
          table and pushed the export buttons off the right edge once the rail
          was open. PageShell width="full" uses --content-full plus the fluid
          --page-gutter, so the table gets the whole column at any desktop width
          and the gutter shrinks instead of the content. */}
      <PageShell as="main" width="full" py={false} className="pt-6 pb-16 max-md:pt-4">
        {/* ── Glass hero: eyebrow · month title · month selector ── */}
        {/* Trimmed from a full-height glass hero to a compact bar: one soft tint
            instead of two stacked radials, ~40% less vertical space, and a title
            that tops out at 30px rather than 46px. Same green identity, same
            eyebrow, same links — it just stops occupying a third of the fold
            before the payroll table starts. */}
        <header
          className="wg-rise relative mb-4 overflow-hidden rounded-[18px] px-5 py-3.5 max-md:px-4 max-md:py-3"
          style={{
            background: [
              `radial-gradient(120% 170% at 100% 0%, color-mix(in srgb, ${GREEN} 7%, transparent), transparent 60%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(12px) saturate(130%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 8px 24px -20px rgba(15,23,42,0.20)",
          }}
        >
          {/* Title · period selector — then export actions hard right. The
              eyebrow pill that sat above the title is gone: it restated the
              breadcrumb the rail and the URL already carry, and cost the header
              a whole line before the heading even started. */}
          <div className="flex items-center justify-between gap-x-5 gap-y-3 flex-wrap">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <h1
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(20px,2.1vw,28px)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.05,
                }}
              >
                {month ? `${monthLabel(month)} payroll` : "Salary Breakup"}
              </h1>

              {/* Year + month, inline with the title — the two dropdowns that
                  replaced the year-chip and month-chip rows below the header. */}
              {months.length > 0 && (
                <SalaryPeriodSelect months={months} selected={month ?? ""} />
              )}
            </div>

            {/* Exports, then the entity filter directly beneath them (Sir): the
                three period/scope controls and the three export buttons are the
                whole header now. The "Exit Documents & Signatory Letters" and
                "Attendance Analytics" links are gone from here — both rooms are
                still reachable from the Accounts rail, and on this page they
                cost a line above a table that needs the height. */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2.5">
                <SalaryExportButtons month={month} />
              </div>
              <SalaryEntitySelect entities={entities} selected={entity} month={month} />
            </div>
          </div>

          {process.env.INCENTIVE_PAYOUT === "true" && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href={"/salary/incentive-payout" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: GREEN_DEEP }}>
                Pay Incentives with Salary →
              </Link>
            </div>
          )}
        </header>

        {/* ── The breakup workspace: a COMPANY selector scopes the KPI cards +
            table together; then document downloads below. ── */}
        {rows.length === 0 ? (
          <section
            className="wg-rise admin-panel px-6 py-16 text-center"
            style={{ animationDelay: "140ms" }}
          >
            <span
              className="mx-auto mb-4 inline-grid size-12 place-items-center rounded-2xl"
              style={{
                background: `color-mix(in srgb, ${GREEN} 10%, transparent)`,
                color: GREEN_DEEP,
              }}
              aria-hidden
            >
              <FileSpreadsheet size={22} strokeWidth={2.2} />
            </span>
            <p
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-serif), system-ui, sans-serif",
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.015em",
              }}
            >
              No salary rows for this month
            </p>
            <p className="mt-2 text-[14px] text-ink-subtle">
              {months.length > 0
                ? "Pick another month above, or generate salary for this one from attendance."
                : "Generate salary to compute the monthly breakup from attendance."}
            </p>
          </section>
        ) : (
          <>
            {/* The table is rendered directly now. `SalaryWorkspace` existed to
                own the company selector and the "Payroll totals" KPI strip; both
                are gone (the selector moved into the header, the strip was cut),
                which left it a wrapper around one child. */}
            <SalaryBreakupTable
              rows={tableRows}
              canRecordPayment={canRecordPayment}
              canEditNote={canEditPayable}
              canWaiveOff={canEditPayable}
              month={month ?? undefined}
              hideCompanyFilter
            />

            {/* ── Statement & earnings document downloads (behind SALARY_STATEMENTS) ── */}
            {statementsOn && month && statementEmployees.length > 0 && (
              <div className="mt-5">
                <StatementDownloads
                  employees={statementEmployees}
                  month={month}
                  monthLabel={monthLabel(month, "short")}
                  fy={fyForMonth(month)}
                  fyStartYear={fyStartYear}
                />
              </div>
            )}
          </>
        )}
      </PageShell>
    </>
  );
}
