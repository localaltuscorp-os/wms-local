"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  bulkColumns,
  bulkPayload,
  frequencyLabels,
  readComplianceMatrix,
  type BulkPerson,
  type BulkRow,
} from "@/lib/compliance/bulk";
import type { ComplianceKind } from "@/lib/compliance/schedule";
import { minutesText } from "@/lib/compliance/minutes";
import { bulkAddCompliances, type BulkProblem } from "@/app/(app)/dcc/compliance-actions";

/**
 * BULK UPLOAD — many WCC or MCC compliances from one Excel sheet (account
 * holder, 2026-09-19).
 *
 * 1. Download the template (lib/compliance/bulk-template.ts) — its Employee
 *    list is the people this viewer may add for, its dropdowns the frequencies.
 * 2. Upload the filled sheet, or paste the rows with their header.
 * 3. Every row is shown with what it will become, and its problems — first as
 *    the sheet reads (lib/compliance/bulk.ts), then as the server sees them
 *    (already on the checklist, not someone you can add for). Nothing is added
 *    until every row is right, and then all of them go in one transaction.
 */

const SKIP_SHEETS = new Set(["lists", "examples", "how to use"]);

export function ComplianceBulkUpload({
  open,
  onOpenChange,
  kind,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ComplianceKind;
  people: readonly BulkPerson[];
}) {
  const router = useRouter();
  const KIND = kind.toUpperCase();
  const [rows, setRows] = React.useState<BulkRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [paste, setPaste] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  const columns = bulkColumns(kind);

  function reset() {
    setRows(null);
    setError(null);
    setSource(null);
    setPaste("");
    setOnlyProblems(false);
  }

  /** Put the server's problems on their rows. */
  function withProblems(list: BulkRow[], problems: readonly BulkProblem[]): BulkRow[] {
    const byLine = new Map<number, string[]>();
    for (const p of problems) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p.error]);
    return list.map((r) => {
      const extra = (byLine.get(r.line) ?? []).filter((e) => !r.errors.includes(e));
      return extra.length ? { ...r, errors: [...r.errors, ...extra] } : r;
    });
  }

  async function read(matrix: unknown[][], from: string, firstLine: number) {
    const res = readComplianceMatrix(matrix, { kind, people, firstLine });
    setSource(from);
    setError(res.error ?? (res.rows.length === 0 ? "No compliance rows found under the header." : null));
    setRows(res.rows);
    const clean = res.rows.filter((r) => r.errors.length === 0);
    if (clean.length === 0) return;
    // What only the server can tell: already on the checklist, who you may add for.
    setChecking(true);
    try {
      const check = await bulkAddCompliances({ kind, rows: clean.map(bulkPayload), dryRun: true });
      if (check.ok && check.dryRun) setRows(withProblems(res.rows, check.problems));
      else if (!check.ok) setError(check.error);
    } finally {
      setChecking(false);
    }
  }

  async function onFile(file: File) {
    try {
      // A CSV is read as text, so 05/09 stays the 5th of September.
      const csv = /\.csv$/i.test(file.name);
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: csv });
      const name =
        wb.SheetNames.find((n) => n.trim().toUpperCase() === KIND) ??
        wb.SheetNames.find((n) => !SKIP_SHEETS.has(n.trim().toLowerCase())) ??
        wb.SheetNames[0]!;
      const sheet = wb.Sheets[name]!;
      const firstLine = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s.r + 1;
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
      await read(matrix, `${file.name}${name ? ` · sheet ${name}` : ""}`, firstLine);
    } catch {
      setError(`Couldn't read that file. Upload the .xlsx made from the ${KIND} template, or a .csv of it.`);
    }
  }

  function readPaste() {
    const lines = paste.replace(/\r\n?/g, "\n").split("\n");
    const tabbed = lines.some((l) => l.includes("\t"));
    void read(
      lines.map((l) => (tabbed ? l.split("\t") : l.split(","))),
      "pasted rows",
      1,
    );
  }

  const shown = rows ?? [];
  const clean = shown.filter((r) => r.errors.length === 0);
  const problemCount = shown.length - clean.length;
  const visible = onlyProblems ? shown.filter((r) => r.errors.length > 0) : shown;

  async function upload() {
    setBusy(true);
    try {
      const res = await bulkAddCompliances({ kind, rows: clean.map(bulkPayload) });
      if (res.ok && !res.dryRun) {
        fireToast({ message: `${res.created} compliance${res.created === 1 ? "" : "s"} added to ${KIND}.`, type: "success" });
        reset();
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        if (res.problems?.length) {
          setRows((cur) => (cur ? withProblems(cur, res.problems!) : cur));
          setOnlyProblems(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60]" style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex w-[min(1180px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-section bg-surface-card shadow-xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
        >
          <div
            className="relative flex items-start gap-3 px-8 py-5 max-md:px-5"
            style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
            <FileSpreadsheet className="mt-1 h-6 w-6 shrink-0" style={{ color: "#B91C1C" }} />
            <div className="min-w-0 flex-1 pr-12">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px, 2.2vw, 28px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                Bulk upload {KIND} compliances
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[14px] font-semibold text-ink-muted">
                One compliance per row, in the template&apos;s columns — checked row by row before anything is added.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-5 top-4 inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-all hover:bg-surface-soft"
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto px-8 py-5 max-md:px-5">
            {!rows ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-hairline p-4">
                  <p className="text-[14px] font-bold text-ink-strong">1. Get the {KIND} template</p>
                  <p className="mt-1 text-[12.5px] text-ink-muted">
                    Columns: {columns.map((c) => `${c.header}${c.required === "yes" ? " *" : ""}`).join(" · ")}.
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-muted">
                    <li>Frequency: {frequencyLabels(kind).join(", ")}.</li>
                    {kind === "wcc" ? (
                      <>
                        <li>Days for Each Day of the Week (Mon, Wed, Fri) — not used for Mon to Sat or Mon to Sun.</li>
                        <li>Mins: how many minutes each one takes — added up per day on the checklist.</li>
                      </>
                    ) : (
                      <>
                        <li>Deadline Day: 1–30 or Last day — two of them for 2 times/month, three for 3 times/month.</li>
                        <li>Due Month for Alternate Month, Quarterly, Half Yearly and Annually.</li>
                      </>
                    )}
                    <li>Dropdowns, a hint on every cell, red for what a row still needs — and an Examples sheet.</li>
                  </ul>
                  <a
                    href={`/dcc/${kind}/template.xlsx`}
                    download
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-soft hover:bg-surface-soft"
                  >
                    <Download className="h-4 w-4" /> Download the {KIND} template
                  </a>
                </div>
                <div className="rounded-xl border border-hairline p-4">
                  <p className="text-[14px] font-bold text-ink-strong">2. Upload the filled sheet</p>
                  <label
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                  >
                    <Upload className="h-4 w-4" /> Choose .xlsx / .csv
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      aria-label={`Upload the filled ${KIND} sheet`}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void onFile(f);
                      }}
                    />
                  </label>
                  <p className="mt-3 text-[12.5px] text-ink-muted">…or paste rows copied from Excel, with the header row:</p>
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={4}
                    aria-label="Rows pasted from Excel"
                    className="mt-1 w-full rounded-lg border border-hairline-strong px-3 py-2 font-mono text-[12px]"
                    placeholder={columns.map((c) => c.header).join("\t")}
                  />
                  <button
                    type="button"
                    onClick={readPaste}
                    disabled={!paste.trim()}
                    className="mt-2 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-soft disabled:opacity-50"
                  >
                    Read pasted rows
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700 md:col-span-2">{error}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold text-ink-soft">{source}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{clean.length} ready</span>
                  {problemCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setOnlyProblems((v) => !v)}
                      aria-pressed={onlyProblems}
                      className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700 hover:bg-red-100"
                    >
                      {problemCount} with problems{onlyProblems ? " — showing only these" : " — show only these"}
                    </button>
                  )}
                  {checking && (
                    <span className="inline-flex items-center gap-1 text-ink-subtle">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking against the checklist…
                    </span>
                  )}
                  <button type="button" onClick={reset} className="ml-auto rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft hover:bg-surface-soft">
                    Choose another file
                  </button>
                </div>
                {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}
                {problemCount > 0 && (
                  <p className="text-[12.5px] text-ink-muted">
                    Fix the rows with problems in your sheet (by row number) and upload it again — or delete them from the sheet. Nothing is added until every row is right.
                  </p>
                )}

                <div className="table-scroll max-h-[52vh] overflow-auto rounded-xl border border-hairline">
                  <table className="w-full min-w-[1000px] text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-surface-soft">
                      <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Compliance</th>
                        <th className="px-3 py-2">Frequency</th>
                        <th className="px-3 py-2">When</th>
                        {kind === "wcc" && <th className="px-3 py-2">Mins</th>}
                        <th className="px-3 py-2">Counts</th>
                        <th className="px-3 py-2">Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.line} className={`border-t border-hairline align-top ${r.errors.length ? "bg-red-50/50" : ""}`}>
                          <td className="px-3 py-2 tabular-nums text-ink-subtle">{r.line}</td>
                          <td className="px-3 py-2 text-ink-soft">{r.ownerName ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-ink-strong">{r.title || <span className="text-ink-subtle">—</span>}</div>
                            {r.section && <span className="mt-0.5 inline-block rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-soft">{r.section}</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink-soft">{r.frequency || "—"}</td>
                          <td className="px-3 py-2 text-ink-soft">{r.when || "—"}</td>
                          {kind === "wcc" && (
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums text-ink-soft">{r.minutes !== null ? minutesText(r.minutes) : "—"}</td>
                          )}
                          <td className="px-3 py-2 text-ink-soft">{r.counts ?? "—"}</td>
                          <td className="px-3 py-2">
                            {r.errors.length === 0 && r.warnings.length === 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                              </span>
                            )}
                            {r.errors.map((e) => (
                              <span key={e} className="block font-semibold text-red-700">
                                {e}
                              </span>
                            ))}
                            {r.warnings.map((w) => (
                              <span key={w} className="flex items-start gap-1 text-amber-700">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-8 py-4 max-md:px-5">
            <Dialog.Close asChild>
              <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
                Cancel
              </button>
            </Dialog.Close>
            {rows && (
              <button
                type="button"
                onClick={() => void upload()}
                disabled={busy || checking || clean.length === 0 || problemCount > 0}
                title={problemCount > 0 ? "Fix the rows with problems first — nothing is added until every row is right." : undefined}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Add {clean.length} compliance{clean.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
