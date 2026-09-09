"use client";

import * as React from "react";
import { X, Loader2, Clock } from "lucide-react";
import { fetchSheetEmployeeDays, type SheetDayRow } from "@/app/(app)/attendance/dashboard/actions";
import { formatDate } from "@/lib/format";

interface CodeInfo {
  label: string;
  bg: string;
  fg: string;
  worked: "full" | "half" | null;
}
function codeInfo(raw: string): CodeInfo {
  const c = raw.trim().toUpperCase();
  switch (c) {
    case "P":
      return { label: "Present", bg: "color-mix(in srgb,#16a34a 14%,white)", fg: "#15803d", worked: "full" };
    case "H-P":
      return { label: "Present (Holiday)", bg: "color-mix(in srgb,#16a34a 14%,white)", fg: "#15803d", worked: "full" };
    case "H/D":
      return { label: "Half Day", bg: "color-mix(in srgb,#f59e0b 16%,white)", fg: "#b45309", worked: "half" };
    case "H-H/D":
      return { label: "Half Day (Holiday)", bg: "color-mix(in srgb,#f59e0b 16%,white)", fg: "#b45309", worked: "half" };
    case "A":
      return { label: "Absent", bg: "color-mix(in srgb,var(--color-altus-red) 12%,white)", fg: "var(--color-altus-red-deep)", worked: null };
    case "W/O":
      return { label: "Weekly Off", bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", worked: null };
    case "H":
      return { label: "Holiday", bg: "color-mix(in srgb,#6366f1 12%,white)", fg: "#4338ca", worked: null };
    default:
      return { label: c === "-" || c === "" ? "—" : raw, bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", worked: null };
  }
}

export function SheetDailyDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  year: number;
  month: number;
}) {
  const [days, setDays] = React.useState<SheetDayRow[] | null>(null);

  React.useEffect(() => {
    if (!open || !employeeName) return;
    setDays(null);
    let alive = true;
    fetchSheetEmployeeDays(employeeId, employeeName, year, month)
      .then((d) => { if (alive) setDays(d); })
      .catch(() => { if (alive) setDays([]); });
    return () => { alive = false; };
  }, [open, employeeId, employeeName, year, month]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white" style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)" }}>
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Daily log · from HR sheet</span>
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}>{employeeName}</h2>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-hairline bg-surface-muted/50 px-5 py-2 text-[12.5px] font-semibold text-ink-muted">
          <Clock size={13} /> Actual in / out times, from app punches
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {days === null ? (
            <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-subtle"><Loader2 size={14} className="animate-spin" /> Loading…</p>
          ) : days.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-subtle">No day records in the sheet for this month.</p>
          ) : (
            <div className="space-y-1.5">
              {days.map((d) => {
                const info = codeInfo(d.statusCode);
                const hasPunch = !!(d.inTime || d.outTime);
                return (
                  <div key={d.day} className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-black" style={{ background: info.bg, color: info.fg }}>{d.day}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-ink-strong">{info.label}</span>
                      <span className="block text-[12px] text-ink-subtle">
                        {d.date ? formatDate(d.date) : `Day ${d.day}`}
                      </span>
                    </span>
                    {info.worked ? (
                      hasPunch ? (
                        <span className="shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink-strong">
                          {d.inTime ?? "—"} <span className="text-ink-subtle">–</span> {d.outTime ?? "—"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[12px] font-semibold text-ink-subtle">— no punch logged</span>
                      )
                    ) : (
                      <span className="shrink-0 text-[13px] font-semibold text-ink-subtle">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
