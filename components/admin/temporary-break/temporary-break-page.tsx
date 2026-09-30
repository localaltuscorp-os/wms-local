"use client";

import * as React from "react";
import { PauseCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { endEmployeeTemporaryBreak, putEmployeeOnTemporaryBreak } from "@/app/(admin)/admin/temporary-break/actions";
import type { TemporaryBreakRow } from "@/lib/employees/temporary-break";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { CompactSelect } from "@/components/ui/compact-select";

type EmployeeOption = { id: string; name: string; functionName: string | null; designationName: string | null };

export function TemporaryBreakPage({ breaks, eligibleEmployees, canEdit }: {
  breaks: TemporaryBreakRow[];
  eligibleEmployees: EmployeeOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [functionFilter, setFunctionFilter] = React.useState("");
  const [designationFilter, setDesignationFilter] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [endingId, setEndingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return breaks.filter((row) => {
      const haystack = [row.employeeName, row.employeeCode, row.functionName, row.designationName, row.reason].filter(Boolean).join(" ").toLowerCase();
      return (!needle || haystack.includes(needle)) && (!functionFilter || row.functionName === functionFilter) && (!designationFilter || row.designationName === designationFilter);
    });
  }, [breaks, designationFilter, functionFilter, query]);
  const functions = React.useMemo(() => [...new Set(breaks.map((row) => row.functionName).filter((value): value is string => Boolean(value)))].sort(), [breaks]);
  const designations = React.useMemo(() => [...new Set(breaks.map((row) => row.designationName).filter((value): value is string => Boolean(value)))].sort(), [breaks]);

  function endBreak(row: TemporaryBreakRow) {
    if (!window.confirm(row.employeeName + " will become active again. Continue?")) return;
    setEndingId(row.id);
    startTransition(async () => {
      const result = await endEmployeeTemporaryBreak(row.id);
      setEndingId(null);
      if (!result.ok) return fireToast(result.error, "error");
      fireToast(result.restoredManager ? "Temporary Break ended. Previous manager restored." : "Temporary Break ended. No manager is assigned.", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 max-w-[380px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" className="w-full rounded-lg border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-altus-red" />
        </label>
        <select value={functionFilter} onChange={(event) => setFunctionFilter(event.target.value)} className="rounded-lg border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] text-ink-soft"><option value="">All functions</option>{functions.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={designationFilter} onChange={(event) => setDesignationFilter(event.target.value)} className="rounded-lg border border-hairline-strong bg-white px-2.5 py-2 text-[12.5px] text-ink-soft"><option value="">All designations</option>{designations.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        {canEdit ? <button type="button" onClick={() => setDialogOpen(true)} className="rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white">+ Put Employee on Temporary Break</button> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="min-w-[900px] w-full border-collapse text-left">
          <thead><tr className="border-b border-hairline bg-surface-soft text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted"><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Function</th><th className="px-3 py-2">Designation</th><th className="px-3 py-2 whitespace-nowrap">Break From</th><th className="px-3 py-2 whitespace-nowrap">Expected Return</th><th className="px-3 py-2">Reason / Notes</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead>
          <tbody>
            {filtered.map((row) => <tr key={row.id} className="border-b border-hairline/60 text-[12.5px] text-ink-soft">
              <td className="px-3 py-2 font-semibold text-ink-strong">{row.employeeName}{row.employeeCode ? <span className="ml-1.5 font-normal text-ink-subtle">({row.employeeCode})</span> : null}</td>
              <td className="px-3 py-2">{row.functionName ?? "—"}</td><td className="px-3 py-2">{row.designationName ?? "—"}</td><td className="px-3 py-2 whitespace-nowrap">{formatDate(row.breakFrom)}</td><td className="px-3 py-2 whitespace-nowrap">{row.expectedReturn ? formatDate(row.expectedReturn) : "—"}</td><td className="max-w-[300px] px-3 py-2">{row.reason ?? "—"}</td>
              <td className="px-3 py-2"><span className="rounded-pill bg-[#f1f2f4] px-2 py-0.5 text-[11px] font-bold text-[#6b7280]">Temporary Break</span></td>
              <td className="px-3 py-2">{canEdit ? <button type="button" disabled={pending && endingId === row.id} onClick={() => endBreak(row)} className="rounded-md border border-hairline-strong px-2 py-1 text-[11.5px] font-semibold text-ink-strong disabled:opacity-50">End Break</button> : "—"}</td>
            </tr>)}
            {filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-ink-muted">No employees are currently on Temporary Break.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {dialogOpen ? <TemporaryBreakDialog employees={eligibleEmployees} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); router.refresh(); }} /> : null}
    </div>
  );
}

function TemporaryBreakDialog({ employees, onClose, onSaved }: { employees: EmployeeOption[]; onClose: () => void; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [breakFrom, setBreakFrom] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [expectedReturn, setExpectedReturn] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, startTransition] = React.useTransition();
  const options = React.useMemo(() => employees.map((employee) => ({ value: employee.id, label: [employee.name, employee.functionName, employee.designationName].filter(Boolean).join(" · ") })), [employees]);
  function save() {
    if (!employeeId || !breakFrom) return fireToast("Employee and Break From are required.", "error");
    startTransition(async () => {
      const result = await putEmployeeOnTemporaryBreak({ employeeId, breakFrom, expectedReturn: expectedReturn || null, reason: reason.trim() || null });
      if (!result.ok) return fireToast(result.error, "error");
      fireToast("Employee placed on Temporary Break.", "success");
      onSaved();
    });
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Put employee on Temporary Break">
    <div className="w-full max-w-md rounded-xl border border-hairline-strong bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center gap-2"><PauseCircle size={17} className="text-ink-muted" /><h2 className="text-[15px] font-bold text-ink-strong">Put Employee on Temporary Break</h2></div>
      <div className="space-y-3">
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-ink-muted">Employee</span><CompactSelect value={employeeId} onChange={setEmployeeId} options={options} placeholder="Select employee" required matchTriggerWidth aria-label="Employee" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1 block text-[11px] font-semibold text-ink-muted">Break From</span><input type="date" value={breakFrom} onChange={(event) => setBreakFrom(event.target.value)} className="w-full rounded-lg border border-hairline-strong px-2 py-1.5 text-[12.5px]" /></label><label className="block"><span className="mb-1 block text-[11px] font-semibold text-ink-muted">Expected Return <em className="font-normal">(optional)</em></span><input type="date" value={expectedReturn} min={breakFrom} onChange={(event) => setExpectedReturn(event.target.value)} className="w-full rounded-lg border border-hairline-strong px-2 py-1.5 text-[12.5px]" /></label></div>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-ink-muted">Reason / Notes</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={2000} className="w-full resize-y rounded-lg border border-hairline-strong px-2 py-1.5 text-[12.5px]" /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-semibold text-ink-muted">Cancel</button><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-altus-red px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">Put on Temporary Break</button></div>
    </div>
  </div>;
}
