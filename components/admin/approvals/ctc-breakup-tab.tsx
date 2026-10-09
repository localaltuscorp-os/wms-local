"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, WalletCards } from "lucide-react";
import type { CtcApprovalRow } from "@/lib/hr/ctc/approval-list";

const money = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const groups = ["earning", "deduction", "employer"] as const;
const groupLabels = { earning: "Earnings", deduction: "Deductions", employer: "Employer contributions" } as const;

function displayDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function CtcBreakupTab({ rows }: { rows: CtcApprovalRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <WalletCards size={17} className="text-red-700" aria-hidden />
          <span>View each employee&apos;s stored CTC versions and full component breakup.</span>
        </div>
        <Link href="/hr/ctc" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700">
          Open CTC workspace <ExternalLink size={14} aria-hidden />
        </Link>
      </div>
      <div className="no-scrollbar overflow-x-auto">
        <table className="min-w-[1140px] w-full text-left text-sm">
          <thead className="bg-slate-50/70 text-xs font-bold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="w-12 px-4 py-3" scope="col"><span className="sr-only">Details</span></th>
              <th className="px-4 py-3" scope="col">Employee</th>
              <th className="px-4 py-3" scope="col">Designation</th>
              <th className="px-4 py-3" scope="col">Department</th>
              <th className="px-4 py-3" scope="col">Version</th>
              <th className="px-4 py-3" scope="col">Reason</th>
              <th className="px-4 py-3" scope="col">Effective from</th>
              <th className="px-4 py-3 text-right" scope="col">Gross / month</th>
              <th className="px-4 py-3 text-right" scope="col">Take-home / month</th>
              <th className="px-4 py-3 text-right" scope="col">Annual CTC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = openId === row.id;
              return <Fragment key={row.id}>
                <tr className="border-t border-slate-100 text-slate-700 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setOpenId(expanded ? null : row.id)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} CTC breakup for ${row.employeeName}`} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-red-700">
                      {expanded ? <ChevronDown size={17} aria-hidden /> : <ChevronRight size={17} aria-hidden />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.employeeName}</td>
                  <td className="px-4 py-3">{row.designation}</td>
                  <td className="px-4 py-3">{row.department}</td>
                  <td className="px-4 py-3 font-semibold">V{row.version}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{row.reason}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{displayDate(row.effectiveDate)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(row.grossMonthly)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(row.netMonthly)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{money(row.ctcAnnual)}</td>
                </tr>
                {expanded && <tr className="border-t border-slate-100 bg-slate-50/70"><td colSpan={10} className="p-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="font-bold text-slate-900">{row.employeeName}&apos;s CTC breakup</h3><p className="mt-0.5 text-xs text-slate-500">Version {row.version} · Last updated {displayDate(row.updatedAt)}</p></div>
                      <div className="rounded-lg bg-red-50 px-3 py-2 text-right"><p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Monthly CTC</p><p className="font-bold tabular-nums text-red-800">{money(row.ctcMonthly)}</p></div>
                    </div>
                    {row.components.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No CTC components have been entered for this version.</p> : <div className="grid gap-3 lg:grid-cols-3">
                      {groups.map((group) => {
                        const components = row.components.filter((component) => component.group === group);
                        if (!components.length) return null;
                        return <section key={group} className="overflow-hidden rounded-lg border border-slate-200"><h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{groupLabels[group]}</h4><div className="divide-y divide-slate-100">{components.map((component) => <div key={component.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><span className="text-slate-600">{component.label}</span><span className="shrink-0 text-right font-semibold tabular-nums text-slate-900"><span className="block">{money(component.monthly)} / mo</span><span className="block text-[10px] font-medium text-slate-500">{money(component.annual)} / yr</span></span></div>)}</div></section>;
                      })}
                    </div>}
                  </div>
                </td></tr>}
              </Fragment>;
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-14 text-center text-slate-500">No CTC breakup records are available yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
