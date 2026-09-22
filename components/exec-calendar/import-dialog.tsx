"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { fireToast } from "@/lib/toast";
import { EXEC_CATEGORIES, FALLBACK_CATEGORY, categoryColors, type ExecCategoryKey } from "@/lib/exec-calendar/taxonomy";
import { durationLabel, minToLabel } from "@/lib/exec-calendar/grid";
import { parseSheetPaste, type ImportedBlock } from "@/lib/exec-calendar/import";
import { importExecBlocks } from "@/app/(app)/events/actions";

/**
 * Import a copied block of the master sheet (§1 — "digitises a multi-year
 * executive master schedule").
 *
 * PARSE, SHOW, THEN WRITE. The preview is the whole point: an importer that
 * writes straight from a paste is a way to put four hundred wrong rows into a
 * calendar, and the sheet is ten years old and not uniform. Everything is
 * listed, anything the code could not categorise is flagged in amber with a
 * picker beside it, and the Import button stays disabled until none are left.
 *
 * The blocks it shows are already collapsed — a title repeated down fifteen
 * rows of the sheet arrives here as one fifteen-hour block, not fifteen — which
 * is the behaviour worth checking before importing a decade.
 */

const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

export function ExecImportDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [yearInput, setYearInput] = React.useState(year);
  const [slotMin, setSlotMin] = React.useState(60);
  const [overrides, setOverrides] = React.useState<Record<number, ExecCategoryKey>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const parsed = React.useMemo(
    () => (text.trim() ? parseSheetPaste(text, { year: yearInput, slotMin }) : { blocks: [], warnings: [] }),
    [text, yearInput, slotMin],
  );

  const resolved: (ImportedBlock & { categoryKey: ExecCategoryKey | null })[] = parsed.blocks.map(
    (b, i) => ({ ...b, categoryKey: overrides[i] ?? b.categoryKey }),
  );
  const unplaced = resolved.filter((b) => b.categoryKey === null).length;
  const canImport = resolved.length > 0 && unplaced === 0 && !busy;

  async function submit() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    const res = await importExecBlocks({
      blocks: resolved.map((b) => ({
        day: b.day,
        startMin: b.startMin,
        endMin: b.endMin,
        title: b.title,
        categoryKey: b.categoryKey as ExecCategoryKey,
      })),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({
      message: res.skipped > 0 ? `Imported ${res.created} · skipped ${res.skipped} already there` : `Imported ${res.created} blocks`,
      type: "success",
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Import from the sheet">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-[760px] max-w-full flex-col overflow-hidden rounded-2xl bg-surface-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <Upload size={15} className="text-ink-muted" />
            <span className="text-[13px] font-bold text-ink-strong">Import from the sheet</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-muted hover:text-ink-strong">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <label className={LABEL}>Paste a block of the sheet</label>
            <textarea
              className={`${FIELD} min-h-[110px] resize-y font-mono text-[11.5px]`}
              placeholder={"Select the rows in Google Sheets — the time column and the day columns — and paste here.\n\n\t1 Jul\t2 Jul\n7:00 AM\tManan Sir Break\t\n8:00 AM\tManan Sir Break\tBNI Premier"}
              value={text}
              onChange={(e) => { setText(e.target.value); setOverrides({}); }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[110px]">
              <label className={LABEL}>Year</label>
              <input
                type="number"
                className={FIELD}
                value={yearInput}
                onChange={(e) => setYearInput(Number(e.target.value))}
              />
            </div>
            <div className="w-[150px]">
              <label className={LABEL}>One row is</label>
              <Chevroned>
                <select className={`${FIELD} appearance-none !pr-9`} value={slotMin} onChange={(e) => setSlotMin(Number(e.target.value))}>
                  <option value={60}>1 hour</option>
                  <option value={30}>30 minutes</option>
                </select>
              </Chevroned>
            </div>
            <p className="pb-2 text-[11.5px] font-semibold text-ink-muted">
              {resolved.length} block{resolved.length === 1 ? "" : "s"} found
              {unplaced > 0 ? ` · ${unplaced} need a category` : ""}
            </p>
          </div>

          {parsed.warnings.map((w) => (
            <p
              key={w}
              className="rounded-lg px-3 py-2 text-[11.5px] font-semibold"
              style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
            >
              {w}
            </p>
          ))}

          {resolved.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-hairline">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-soft text-[10.5px] uppercase tracking-wide text-ink-subtle">
                  <tr>
                    <th className="px-2.5 py-1.5">Day</th>
                    <th className="px-2.5 py-1.5">Time</th>
                    <th className="px-2.5 py-1.5">Title</th>
                    <th className="px-2.5 py-1.5">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((b, i) => {
                    const missing = b.categoryKey === null;
                    const col = categoryColors(b.categoryKey ?? FALLBACK_CATEGORY);
                    return (
                      <tr
                        key={`${b.day}-${b.startMin}-${i}`}
                        className="border-t border-hairline"
                        style={missing ? { background: "var(--color-amber-bg)" } : undefined}
                      >
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink-muted">{b.day}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-ink-muted">
                          {minToLabel(b.startMin)} · {durationLabel(b.endMin - b.startMin)}
                        </td>
                        <td className="px-2.5 py-1.5 font-semibold text-ink-strong">{b.title}</td>
                        <td className="px-2.5 py-1.5">
                          <select
                            value={b.categoryKey ?? ""}
                            onChange={(e) =>
                              setOverrides((p) => ({ ...p, [i]: e.target.value as ExecCategoryKey }))
                            }
                            className="w-full rounded-md border border-hairline bg-surface-card px-1.5 py-1 text-[11.5px] font-semibold"
                            style={missing ? undefined : { color: col.deep }}
                          >
                            <option value="" disabled>
                              — pick one —
                            </option>
                            {EXEC_CATEGORIES.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <p className="rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <p className="text-[11.5px] text-ink-subtle">
            Blocks already in the calendar at the same day, time and title are skipped.
          </p>
          <button onClick={onClose} className="ml-auto rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canImport}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Import {resolved.length > 0 ? resolved.length : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}
