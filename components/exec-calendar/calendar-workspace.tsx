"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2, Minimize2, Plus, Upload } from "lucide-react";
import { useCalendarMaximize } from "./calendar-layout";
import { ExecWeekGrid } from "./week-grid";
import { ExecMonthGrid } from "./month-grid";
import { ExecMonthlyGridView } from "./monthly-grid-view";
import { ExecEventEditor, type EditorEvent } from "./event-editor";
import { ExecRoutineDialog } from "./routine-dialog";
import { ExecImportDialog } from "./import-dialog";
import { fireToast } from "@/lib/toast";
import { saveExecEvent } from "@/app/(app)/events/actions";
import { addMonths, monthStart, weekDays, weekStart, type GridConfig } from "@/lib/exec-calendar/grid";
import {
  CALENDAR_VIEWS,
  isNow,
  periodLabel,
  periodRange,
  stepPeriod,
  type CalendarView,
} from "@/lib/exec-calendar/period";
import { type ExecCategoryKey } from "@/lib/exec-calendar/taxonomy";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";
import type { DayMarker } from "@/lib/exec-calendar/day-markers";
import { ExecWeeklyGridView } from "./weekly-grid-view";

/**
 * The interactive shell: the view switcher, the period stepper, the add
 * buttons, and every dialog.
 *
 * LAYOUT (asked for 2026-09-17): horizons on the LEFT, add buttons on the
 * RIGHT, and the row wraps BETWEEN groups rather than inside a button — the
 * toolbar squeezed and broke "New block" over two lines once the global sidebar
 * was open, so every control carries `shrink-0 whitespace-nowrap`.
 *
 * KEYBOARD: ← → step the period, `t` returns to now, `n` opens a new block, and
 * A category letter (s f c q p t l g x m o y e i - see HOTKEY_CATEGORY) retags the block the drawer has open. All ignored while a field
 * has focus, so typing "b" in a title does not retag it.
 */

const HOTKEY_CATEGORY: Record<string, ExecCategoryKey> = {
  s: "sales",
  f: "fixed",
  c: "consulting",
  q: "cq",
  p: "ps",
  t: "staff_time",
  l: "lead_gen",
  g: "grad_workshop",
  x: "flexible_time",
  m: "festival",
  o: "wkly_off",
  y: "family_time",
  e: "personal",
  i: "siaa_exam",
};

function blankEvent(day: string, startMin: number | null): EditorEvent {
  return {
    title: "",
    categoryKey: "consulting",
    day,
    startMin,
    endMin: startMin == null ? null : Math.min(startMin + 60, 1440),
    allDay: false,
  };
}

export function ExecCalendarWorkspace({
  view,
  day,
  events,
  cfg,
  today,
  draftDay,
  canEdit = true,
  openRoutine = false,
  routineMode = "edit",
  openImport = false,
  ownerId,
  isOwner,
  markers = [],
}: {
  view: CalendarView;
  day: string;
  events: ExecEventRow[];
  /** Day Markers touching the period on show. */
  markers?: DayMarker[];
  cfg: GridConfig;
  today: string;
  draftDay?: string | null;
  canEdit?: boolean;
  openRoutine?: boolean;
  routineMode?: "edit" | "delete";
  openImport?: boolean;
  ownerId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EditorEvent | null>(
    draftDay ? blankEvent(draftDay, 10 * 60) : null,
  );
  const [markerEditing, setMarkerEditing] = React.useState<DayMarker | null>(null);
  const [routineOpen, setRoutineOpen] = React.useState(openRoutine);
  const [importOpen, setImportOpen] = React.useState(openImport);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportBusy, setExportBusy] = React.useState<"pdf" | "jpg" | null>(null);
  const { maximized, toggle: toggleMaximized } = useCalendarMaximize();

  /** Export the MONTH `day` falls in, as a PDF or JPG — read-only, so unlike
   *  Import/Routine/New block this isn't gated on `canEdit`. */
  const runExport = React.useCallback(
    async (format: "pdf" | "jpg") => {
      setExportOpen(false);
      setExportBusy(format);
      try {
        const r = await fetch("/api/events/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerId, day, format }),
        });
        if (!r.ok) {
          fireToast({ message: "Could not build the export.", type: "error" });
          return;
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cd = r.headers.get("content-disposition") ?? "";
        a.download = /filename="([^"]+)"/.exec(cd)?.[1] ?? `calendar.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } catch {
        fireToast({ message: "Could not build the export.", type: "error" });
      } finally {
        setExportBusy(null);
      }
    },
    [ownerId, day],
  );

  const href = React.useCallback(
    (v: CalendarView, d: string): Route => {
      const own = isOwner ? "" : `&owner=${ownerId}`;
      return `/events?view=${v}&day=${d}${own}` as Route;
    },
    [isOwner, ownerId],
  );

  const go = React.useCallback((v: CalendarView, d: string) => router.push(href(v, d)), [router, href]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft") { e.preventDefault(); go(view, stepPeriod(view, day, -1)); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); go(view, stepPeriod(view, day, 1)); return; }
      if (e.key.toLowerCase() === "t") { go(view, today); return; }
      if (e.key.toLowerCase() === "n") {
        if (!canEdit) return;
        e.preventDefault();
        setEditing(blankEvent(day, 10 * 60));
        return;
      }
      const cat = HOTKEY_CATEGORY[e.key.toLowerCase()];
      if (cat && editing) setEditing({ ...editing, categoryKey: cat });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, day, today, canEdit, editing, go]);

  const openEvent = (row: ExecEventRow) =>
    setEditing({
      id: row.id,
      title: row.title,
      categoryKey: row.categoryKey,
      day: row.day,
      startMin: row.startMin,
      endMin: row.endMin,
      allDay: row.allDay,
      location: row.location,
      notes: row.notes,
      clientKey: row.clientKey,
      batchLabel: row.batchLabel,
    });

  /** Persist a drag through the SAME action the drawer uses, so it validates identically. */
  const commitMove = React.useCallback(
    async (row: ExecEventRow, d: string, startMin: number, endMin: number) => {
      const res = await saveExecEvent({
        id: row.id,
        title: row.title,
        categoryKey: row.categoryKey as ExecCategoryKey,
        day: d,
        startMin,
        endMin,
        allDay: row.allDay,
        location: row.location,
        notes: row.notes,
        clientKey: row.clientKey,
        batchLabel: row.batchLabel,
      });
      if (!res.ok) fireToast({ message: res.error, type: "error", duration: 6000 });
      router.refresh();
    },
    [router],
  );

  const openMarker = canEdit ? (m: DayMarker) => setMarkerEditing(m) : undefined;
  const pickDay = (d: string) => go("day", d);
  const pickMonth = (d: string) => go("month", monthStart(d));
  const pickWeek = (monday: string) => go("week", monday);

  const label = periodLabel(view, day, today);
  const onNow = isNow(view, day, today);

  // Day, Week and Weekly Grid share one hourly working window.
  const dayWeekCfg: GridConfig = { ...cfg, slotMin: 60 };
  const gridCfg: GridConfig = { ...cfg, startMin: Math.ceil(cfg.startMin / 60) * 60, slotMin: 60 };

  return (
    <>
      {/* Horizons left · stepper · add buttons right. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 rounded-pill border border-hairline bg-surface-card p-0.5">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => go(v.key, day)}
              className={`whitespace-nowrap rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                view === v.key ? "text-white" : "text-ink-muted hover:text-ink-strong"
              }`}
              style={view === v.key ? { background: "var(--color-altus-red)" } : undefined}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => go(view, stepPeriod(view, day, -1))}
            aria-label="Previous"
            className="grid h-8 w-8 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition hover:border-hairline-strong"
          >
            <ChevronLeft size={16} />
          </button>
          {/* The label IS the button: it says where you are, and returns you to now. */}
          <button
            onClick={() => go(view, today)}
            disabled={onNow}
            title={onNow ? undefined : "Back to now"}
            className="min-w-[120px] whitespace-nowrap rounded-lg border px-3 py-1.5 text-center text-[12.5px] font-bold transition"
            style={
              onNow
                ? { borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)", color: "var(--color-ink-strong)" }
                : { borderColor: "var(--color-altus-red)", background: "var(--color-altus-red-wash)", color: "var(--color-altus-red-deep)" }
            }
          >
            {label}
          </button>
          <button
            onClick={() => go(view, stepPeriod(view, day, 1))}
            aria-label="Next"
            className="grid h-8 w-8 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition hover:border-hairline-strong"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative shrink-0">
            <button
              onClick={() => setExportOpen((v) => !v)}
              disabled={exportBusy !== null}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong transition hover:border-hairline-strong disabled:opacity-60"
            >
              {exportBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exportBusy ? "Exporting…" : "Export"}
            </button>
            {exportOpen && (
              <div
                // z-50: above the grid's own sticky headers (z-30 for the day
                // names, z-20 for each week's bar) — a plain z-20 here sat in
                // the SAME stacking context as those and lost, so the menu
                // rendered half-hidden under the grid instead of over it.
                className="absolute right-0 top-[calc(100%+4px)] z-50 w-36 overflow-hidden rounded-lg border border-hairline-strong bg-surface-card shadow-lg"
                onMouseLeave={() => setExportOpen(false)}
              >
                <button
                  onClick={() => void runExport("pdf")}
                  className="block w-full px-3 py-2 text-left text-[12.5px] font-semibold text-ink-strong hover:bg-surface-soft"
                >
                  Export as PDF
                </button>
                <button
                  onClick={() => void runExport("jpg")}
                  className="block w-full px-3 py-2 text-left text-[12.5px] font-semibold text-ink-strong hover:bg-surface-soft"
                >
                  Export as JPG
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <>
              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong transition hover:border-hairline-strong"
              >
                <Upload size={14} /> Import
              </button>
              <button
                onClick={() => setEditing(blankEvent(day, 10 * 60))}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-white"
                style={{ background: "var(--color-altus-red)" }}
              >
                <Plus size={14} /> New block
              </button>
            </>
          )}
          {/* Icon-only, right of New block (2026-09-26: was its own "Maximize"
              pill on the left side of this group) — same toggle, every view. */}
          <button
            onClick={toggleMaximized}
            aria-label={maximized ? "Restore calendar" : "Maximize calendar"}
            title={maximized ? "Restore calendar" : "Maximize calendar"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-muted transition hover:border-hairline-strong hover:text-ink-strong"
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {(view === "day" || view === "week") && (
        <ExecWeekGrid
          days={view === "day" ? [day] : weekDays(weekStart(day))}
          events={events}
          cfg={dayWeekCfg}
          today={today}
          onPickDay={pickDay}
          onPickEvent={canEdit ? openEvent : undefined}
          onPickSlot={canEdit ? (d, startMin) => setEditing(blankEvent(d, startMin)) : undefined}
          onMove={canEdit ? (row, d, s, e) => void commitMove(row, d, s, e) : undefined}
          markers={markers}
          onPickMarker={openMarker}
        />
      )}

      {view === "grid" && (
        <ExecWeeklyGridView
          monday={weekStart(day)}
          events={events}
          markers={markers}
          cfg={gridCfg}
          today={today}
          onPickEvent={canEdit ? openEvent : undefined}
          onPickSlot={canEdit ? (d, startMin) => setEditing(blankEvent(d, startMin)) : undefined}
          onPickMarker={openMarker}
        />
      )}

      {view === "month" && (
        <div className="border border-hairline bg-surface-card p-4">
          <ExecMonthGrid
            anchor={monthStart(day)}
            events={events}
            today={today}
            onPickDay={pickDay}
            onPickWeek={pickWeek}
            onPickEvent={canEdit ? openEvent : undefined}
            markers={markers}
            onPickMarker={openMarker}
          />
        </div>
      )}

      {view === "monthgrid" && (
        <ExecMonthlyGridView
          anchor={day}
          events={events}
          cfg={gridCfg}
          today={today}
          markers={markers}
          onPickDay={pickDay}
          onPickEvent={canEdit ? openEvent : undefined}
          onPickSlot={canEdit ? (d, startMin) => setEditing(blankEvent(d, startMin)) : undefined}
          onPickMarker={openMarker}
        />
      )}

      {view === "quarter" && (
        <div className="grid grid-cols-1 gap-4 border border-hairline bg-surface-card p-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <ExecMonthGrid
              key={i}
              anchor={addMonths(periodRange("quarter", day).from, i)}
              events={events}
              today={today}
              onPickDay={pickDay}
              onPickMonth={pickMonth}
              onPickWeek={pickWeek}
              markers={markers}
            />
          ))}
        </div>
      )}

      {editing && <ExecEventEditor initial={editing} today={today} onClose={() => setEditing(null)} />}
      {markerEditing && (
        <ExecEventEditor
          initial={blankEvent(markerEditing.dates[0] ?? day, 10 * 60)}
          initialMarker={markerEditing}
          today={today}
          onClose={() => setMarkerEditing(null)}
        />
      )}
      {routineOpen && (
        <ExecRoutineDialog
          today={today}
          initialMode={routineMode}
          onClose={() => setRoutineOpen(false)}
        />
      )}
      {importOpen && <ExecImportDialog year={Number(day.slice(0, 4))} onClose={() => setImportOpen(false)} />}
    </>
  );
}
