"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Download, FileText, Sparkles } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { generateSalary, setDisbursed } from "@/app/(app)/salary/actions";
import type { SalaryRunRow } from "@/lib/queries/salary";

interface Props {
  month: string; // YYYY-MM
  monthLabel: string;
  rows: SalaryRunRow[];
}

const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const days = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function SalaryReport({ month, monthLabel, rows }: Props) {
  const router = useRouter();
  const [generating, startGenerate] = useTransition();

  function onMonthChange(next: string) {
    if (!next) return;
    router.push(`/salary?month=${next}` as Route);
  }

  function onGenerate() {
    startGenerate(async () => {
      const res = await generateSalary({ month });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: `Generated ${res.generated} salary ${res.generated === 1 ? "run" : "runs"} for ${monthLabel}.`,
      });
      router.refresh();
    });
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += r.gross;
      acc.net += r.netPayable;
      return acc;
    },
    { gross: 0, net: 0 },
  );

  return (
    <>
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(40px, 4.2vw, 56px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Salary
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 18 }}>
            Monthly salary runs · {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="rounded-md border border-hairline bg-surface-card py-2.5 px-3.5 text-[14px] text-ink-strong tabular-nums"
          />
          <Link
            href={`/salary/export.xlsx?month=${month}` as Route}
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-medium text-ink-strong hover:border-hairline-strong transition-colors"
          >
            <Download size={15} strokeWidth={2.2} />
            Export Excel
          </Link>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            <Sparkles size={15} strokeWidth={2.2} />
            {generating ? "Generating…" : `Generate Salary for ${monthLabel}`}
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            No salary runs for {monthLabel} yet
          </p>
          <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
            Click “Generate Salary” above to materialize runs from this month’s
            attendance and each employee’s salary profile. Employees without a
            CTC profile are skipped.
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr
                className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th className="px-4 py-4">Employee</th>
                <th className="px-4 py-4">Designation</th>
                <th className="px-4 py-4 text-right tabular-nums">CTC / mo</th>
                <th className="px-4 py-4 text-right tabular-nums">Payable</th>
                <th className="px-4 py-4 text-right tabular-nums">Late ded.</th>
                <th className="px-4 py-4 text-right tabular-nums">Gross</th>
                <th className="px-4 py-4 text-right tabular-nums">PT</th>
                <th className="px-4 py-4 text-right tabular-nums">TDS</th>
                <th className="px-4 py-4 text-right tabular-nums">Advances</th>
                <th className="px-4 py-4 text-right tabular-nums">Pending-in</th>
                <th className="px-4 py-4 text-right tabular-nums">Net</th>
                <th className="px-4 py-4 text-center">Disbursed</th>
                <th className="px-4 py-4 text-right">
                  <span className="sr-only">Payslip</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <SalaryRow key={r.id} row={r} rowIndex={i} />
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t-2 border-hairline-strong font-bold text-ink-strong"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <td className="px-4 py-4" colSpan={5}>
                  Totals ({rows.length})
                </td>
                <td className="px-4 py-4 text-right tabular-nums">₹{inr(totals.gross)}</td>
                <td className="px-4 py-4" colSpan={4} />
                <td className="px-4 py-4 text-right tabular-nums">₹{inr(totals.net)}</td>
                <td className="px-4 py-4" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

function SalaryRow({ row, rowIndex }: { row: SalaryRunRow; rowIndex: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const monthlyCtc = row.annualCtc / 12;

  function toggleDisbursed() {
    const next = !row.disbursed;
    if (next && !window.confirm(`Mark ${row.employeeName}'s salary as disbursed?`)) {
      return;
    }
    startTransition(async () => {
      const res = await setDisbursed(row.id, next);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: next
          ? `${row.employeeName} marked disbursed.`
          : `${row.employeeName} disbursement undone.`,
      });
      router.refresh();
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-4 py-3.5 text-ink-strong font-medium whitespace-nowrap">
        {row.employeeName}
      </td>
      <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">
        {row.designationName ?? "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        ₹{inr(monthlyCtc)}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {days(row.payableDays)}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {row.lateDeductionDays > 0 ? days(row.lateDeductionDays) : "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-strong">
        ₹{inr(row.gross)}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {row.pt > 0 ? `₹${inr(row.pt)}` : "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {row.tds > 0 ? `₹${inr(row.tds)}` : "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {row.advances > 0 ? `₹${inr(row.advances)}` : "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-soft">
        {row.pendingBalanceIn !== 0 ? `₹${inr(row.pendingBalanceIn)}` : "—"}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums font-bold text-ink-strong">
        ₹{inr(row.netPayable)}
      </td>
      <td className="px-4 py-3.5 text-center">
        <button
          type="button"
          onClick={toggleDisbursed}
          disabled={pending}
          role="switch"
          aria-checked={row.disbursed}
          aria-label={row.disbursed ? "Mark not disbursed" : "Mark disbursed"}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
          style={{
            background: row.disbursed ? "var(--color-green)" : "rgba(15, 23, 42, 0.15)",
          }}
        >
          <span
            className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
            style={{ transform: row.disbursed ? "translateX(22px)" : "translateX(2px)" }}
          />
        </button>
      </td>
      <td className="px-4 py-3.5 text-right">
        <Link
          href={`/salary/payslip/${row.id}` as Route}
          prefetch={false}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors whitespace-nowrap"
        >
          <FileText size={14} strokeWidth={2.2} />
          Payslip
        </Link>
      </td>
    </tr>
  );
}
