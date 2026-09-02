"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileSpreadsheet, Download } from "lucide-react";
import { importGoals } from "@/app/(app)/goals/import/actions";
import { GOALS_ACCENT, GOALS_ACCENT_DEEP, type RosterMember } from "./util";

/** The enterprise exceljs template (branded, validated dropdowns, no frozen panes). */
const TEMPLATE_URL = "/goals/template.xlsx";

type Result = { imported: number; skipped: number; warnings: string[] } | null;

export function GoalsImport({ roster }: { roster: RosterMember[] }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result>(null);
  const [ownerId, setOwnerId] = React.useState<string>("all");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("employeeId", ownerId);
    start(async () => {
      const res = await importGoals(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ imported: res.imported, skipped: res.skipped, warnings: res.warnings });
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl rounded-section border border-hairline bg-surface-card p-6 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-grid size-10 place-items-center rounded-xl text-white"
          style={{
            background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 20px -8px ${GOALS_ACCENT_DEEP}`,
          }}
        >
          <FileSpreadsheet size={20} strokeWidth={2.2} />
        </span>
        <h2 className="text-[18px] font-black text-ink-strong">Import Cascade Goals</h2>
      </div>
      <p className="mt-3 text-[14px] font-semibold text-ink-soft">
        Upload a CSV or Excel file. First row = headers; each row becomes a goal at the
        level its <strong className="text-ink-strong">Period</strong> +{" "}
        <strong className="text-ink-strong">PeriodKey</strong> name (Year <code>2026</code> ·
        Quarter <code>2026-Q1</code> · Month <code>2026-07</code>).
      </p>

      <div className="mt-3 rounded-xl border border-hairline bg-black/[0.015] p-3">
        <p className="text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">Branded Excel template</p>
        <p className="mt-1 text-[13px] font-semibold text-ink-soft">
          Level · Title · Year/Quarter/Month · Type · Category · Area · UoM · Target/Actual · Owner ·
          Reviewer · Team · Status · Weight — with dropdowns, frozen panes and locked read-only columns.
        </p>
        <a
          href={TEMPLATE_URL}
          className="wg-btn mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95"
        >
          <Download size={14} strokeWidth={2.4} /> Download template (.xlsx)
        </a>
      </div>

      <div className="mt-4">
        <label className="text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-muted">
          Default owner (rows without an Employee column)
        </label>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-hairline bg-surface-card px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-hairline-strong"
        >
          <option value="all">Use the file&apos;s Employee column</option>
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-bold text-altus-red">{error}</p>
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
      <div className="mt-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {pending ? "Importing…" : "Choose file"}
        </button>
      </div>
    </div>
  );
}
