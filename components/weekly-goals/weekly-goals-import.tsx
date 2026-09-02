"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileSpreadsheet, X } from "lucide-react";
import { importWeeklyGoals } from "@/app/(app)/weekly-goals/actions";

interface Props {
  /** The team member rows import into; "" / "all" means "use the file's Employee column". */
  employeeId: string;
  weekStart: string;
  weekLabel: string;
  isAdmin: boolean;
}

type Result = { imported: number; skipped: number; warnings: string[] } | null;

/**
 * "Import file" button for the Weekly Goals board. Accepts a CSV / Excel file
 * (the same thing you'd download from Google Sheets) whose first row is the
 * column headers. Each data row becomes a weekly goal for the week in view.
 */
export function WeeklyGoalsImport(props: Props) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result>(null);

  const needsEmployeeColumn = props.isAdmin && (!props.employeeId || props.employeeId === "all");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("weekStart", props.weekStart);
    fd.set("employeeId", props.employeeId);
    start(async () => {
      const res = await importWeeklyGoals(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ imported: res.imported, skipped: res.skipped, warnings: res.warnings });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setResult(null);
        }}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all hover:brightness-95 active:scale-[0.98]"
      >
        <Upload size={16} strokeWidth={2.4} />
        Import file
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={20} className="text-altus-red" />
                <h2 className="font-black text-ink-strong text-[19px]">Import Weekly Goals</h2>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="rounded-md p-1 text-ink-muted hover:bg-black/[0.05]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-3 text-[14px] font-semibold text-ink-soft">
              Upload a CSV or Excel file (or one exported from Google Sheets) for{" "}
              <strong className="text-ink-strong">{props.weekLabel}</strong>. The first row
              must be the column headers; every row after becomes a goal.
            </p>

            <div className="mt-3 rounded-xl border border-hairline bg-black/[0.015] p-3">
              <p className="text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
                Recognised headers
              </p>
              <p className="mt-1 text-[13px] font-semibold text-ink-soft">
                Client · Subject · Priority · Incentive · KPI · Target · % Done · Explanation · Link
                {props.isAdmin && " · Employee (name or email)"}
              </p>
            </div>

            {needsEmployeeColumn && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-700">
                You&apos;re viewing all team members — include an <strong>Employee</strong> column
                (name or email) in the file, or pick one person first.
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-bold text-altus-red">
                {error}
              </p>
            )}

            {result && (
              <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[13px] font-bold text-green-700">
                Imported {result.imported} goal{result.imported === 1 ? "" : "s"}
                {result.skipped > 0 ? ` · ${result.skipped} row(s) skipped` : ""}.
                {result.warnings.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-4 font-semibold text-amber-700">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onPick}
            />

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-soft hover:text-ink-strong transition-colors"
              >
                {result ? "Done" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                }}
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {pending ? "Importing…" : "Choose file"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
