"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import { setObligationCompletion } from "@/app/(app)/events/obligations/actions";
import type { CellStatus, FyMonthCol, ObligationCell } from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Background / text / border per cell status. Status hues are semantic (heat),
 *  intentionally outside the brand-chrome tokens. */
const STATUS_STYLE: Record<CellStatus, { bg: string; fg: string; border: string }> = {
  met: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  partial: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  missed: { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
  future: { bg: "#f1f5f9", fg: "#94a3b8", border: "#e2e8f0" },
  none: { bg: "#f8fafc", fg: "#cbd5e1", border: "#eef2f6" },
};

interface Props {
  obligationName: string;
  obligationId: string;
  target: number;
  fyStartYear: number;
  col: FyMonthCol;
  cell: ObligationCell;
  status: CellStatus;
}

export function CellBumpPopover({
  obligationName,
  obligationId,
  target,
  fyStartYear,
  col,
  cell,
  status,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [pending, startTransition] = useTransition();

  // Seed the inputs from the cell when the popover opens — synced during render
  // (React's recommended alternative to a syncing effect).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOverride(cell.manual !== null ? String(cell.manual) : "");
      setNote(cell.note ?? "");
    }
  }

  const st = STATUS_STYLE[status];
  const hasManual = cell.manual !== null;

  function onSave() {
    const parsed = override.trim() === "" ? 0 : Number(override);
    if (!Number.isFinite(parsed) || parsed < 0) {
      fireToast({ message: "Override must be a number ≥ 0.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await setObligationCompletion({
        obligationId,
        fyStartYear,
        periodMonth: col.month,
        completedCount: Math.round(parsed),
        note,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Count updated." });
      setOpen(false);
      router.refresh();
    });
  }

  function onClear() {
    startTransition(async () => {
      const res = await setObligationCompletion({
        obligationId,
        fyStartYear,
        periodMonth: col.month,
        completedCount: 0,
        note: "",
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Override cleared." });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${obligationName} — ${col.label} ${col.calYear}: ${cell.effective} of ${target}`}
          className="relative flex h-11 w-full items-center justify-center rounded-md border text-[13px] font-bold tabular-nums transition-transform hover:-translate-y-px focus-visible:outline-2"
          style={{
            background: st.bg,
            color: st.fg,
            borderColor: st.border,
            outlineColor: ACCENT,
          }}
        >
          {status === "future" ? (
            <span className="opacity-70">—</span>
          ) : (
            <span>
              {cell.effective}
              <span className="opacity-55">/{target}</span>
            </span>
          )}
          {hasManual && (
            <span
              aria-hidden
              title="Manual override"
              className="absolute right-1 top-1 size-1.5 rounded-full"
              style={{ background: ACCENT_DEEP }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-0">
        <div
          className="rounded-t-chip px-3.5 py-2.5"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, color: "#fff" }}
        >
          <p className="truncate text-[13.5px] font-bold">{obligationName}</p>
          <p className="text-[12px] opacity-90">
            {col.label} {col.calYear} · target {target}
          </p>
        </div>
        <div className="space-y-3 p-3.5">
          <div className="flex items-center justify-between rounded-lg bg-surface-soft px-3 py-2">
            <span className="text-[13px] font-semibold text-ink-muted">
              Auto-count (Tagged Events)
            </span>
            <span className="text-[15px] font-bold tabular-nums text-ink-strong">
              {cell.auto}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-bold text-ink-strong">
              Manual Override
            </label>
            <input
              type="number"
              min={0}
              max={999}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder={`auto (${cell.auto})`}
              className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[15px] text-ink-strong outline-none focus:border-[color:var(--ev-accent)] focus:ring-2"
              style={
                {
                  ["--ev-accent" as string]: ACCENT,
                  ["--tw-ring-color" as string]: `${ACCENT}33`,
                } as React.CSSProperties
              }
            />
            <p className="mt-1 text-[11.5px] text-ink-soft">
              Effective = max(override, auto-count). Leave blank to use the
              auto-count.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-bold text-ink-strong">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              maxLength={2000}
              className="w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-[color:var(--ev-accent)] focus:ring-2"
              style={
                {
                  ["--ev-accent" as string]: ACCENT,
                  ["--tw-ring-color" as string]: `${ACCENT}33`,
                } as React.CSSProperties
              }
            />
          </div>

          <div className="flex items-center justify-between pt-0.5">
            {hasManual ? (
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="bg-surface-card text-[13px] font-semibold text-ink-soft transition-colors hover:text-altus-red disabled:opacity-50"
              >
                Clear Override
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="brand-btn rounded-pill px-4 py-2 text-[14px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { STATUS_STYLE };
