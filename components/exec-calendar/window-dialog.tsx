"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { fireToast } from "@/lib/toast";
import { DEFAULT_GRID, minToLabel, type GridConfig } from "@/lib/exec-calendar/grid";
import { saveExecGridPrefs } from "@/app/(app)/events/actions";

/**
 * The grid window editor (§2A, "configurable time slots").
 *
 * Saved per PERSON in `exec_calendar_prefs`, not in the browser: a window kept
 * in localStorage is a different calendar on the laptop and the phone, and the
 * one you are not looking at is the one that hides an early block.
 *
 * The presets carry the point of the setting. "Working day" is the brief's
 * 07:00–22:00; "Office hours" is the tighter window most weeks actually need;
 * "Full day" exists because a 06:00 flight is real and a grid that cannot show
 * it would quietly drop it — `layoutDay` clamps such a block to the top edge
 * rather than losing it, but clamped is not the same as visible.
 */

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60);

const PRESETS: { label: string; cfg: GridConfig }[] = [
  { label: "Working day", cfg: DEFAULT_GRID },
  { label: "Office hours", cfg: { startMin: 9 * 60, endMin: 19 * 60, slotMin: 30 } },
  { label: "Full day", cfg: { startMin: 0, endMin: 24 * 60, slotMin: 60 } },
];

const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

export function ExecWindowDialog({ current, onClose }: { current: GridConfig; onClose: () => void }) {
  const router = useRouter();
  const [startMin, setStartMin] = React.useState(current.startMin);
  const [endMin, setEndMin] = React.useState(current.endMin);
  const [slotMin, setSlotMin] = React.useState<30 | 60>(current.slotMin);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rows = endMin > startMin ? Math.ceil((endMin - startMin) / slotMin) : 0;

  async function submit() {
    if (busy || endMin <= startMin) return;
    setBusy(true);
    setError(null);
    const res = await saveExecGridPrefs({ startMin, endMin, slotMin });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({ message: "Window saved", type: "success" });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Grid window">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div className="relative w-[400px] max-w-full overflow-hidden rounded-2xl bg-surface-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-ink-muted" />
            <span className="text-[13px] font-bold text-ink-strong">The day you see</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-muted hover:text-ink-strong">
            <X size={16} />
          </button>
        </header>

        <div className="space-y-3.5 px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setStartMin(p.cfg.startMin); setEndMin(p.cfg.endMin); setSlotMin(p.cfg.slotMin); }}
                className="rounded-pill border border-hairline px-2.5 py-1 text-[11.5px] font-bold text-ink-muted transition hover:border-hairline-strong hover:text-ink-strong"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={LABEL}>Day starts</label>
              <Chevroned>
                <select className={`${FIELD} appearance-none !pr-9`} value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
                  {HOURS.slice(0, 24).map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
                </select>
              </Chevroned>
            </div>
            <div className="flex-1">
              <label className={LABEL}>Day ends</label>
              <Chevroned>
                <select className={`${FIELD} appearance-none !pr-9`} value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
                  {HOURS.slice(1).map((m) => (
                    <option key={m} value={m}>{m === 1440 ? "12:00 AM (midnight)" : minToLabel(m)}</option>
                  ))}
                </select>
              </Chevroned>
            </div>
          </div>

          <div>
            <label className={LABEL}>Rows</label>
            <div className="flex gap-1.5">
              {([30, 60] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlotMin(s)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition"
                  style={
                    slotMin === s
                      ? { background: "var(--color-altus-red)", color: "#fff" }
                      : { background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)", color: "var(--color-ink-muted)" }
                  }
                >
                  {s === 30 ? "Half-hourly" : "Hourly"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11.5px] leading-snug text-ink-subtle">
            {endMin > startMin
              ? `${rows} rows. Blocks outside this window still exist — they are pinned to the edge rather than hidden — but you will not see where they sit.`
              : "The day has to end after it starts."}
          </p>

          {error && (
            <p className="rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || endMin <= startMin}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
