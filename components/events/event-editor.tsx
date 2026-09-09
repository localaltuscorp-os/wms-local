"use client";

/**
 * Create / edit modal for a calendar event. Opened by quick-add, click-drag
 * create, double-click, or the "New event" button. Keyboard-first: title
 * autofocuses, Esc closes, ⌘/Ctrl+Enter saves. Times are 30-min <select>s so
 * everything snaps to the grid. Presentational — persistence is injected via
 * `onSave`.
 */
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventCategory, Obligation, EventStatus } from "@/lib/monthly-events/types";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  minToLabel,
} from "@/lib/monthly-events/types";
import { EVENT_PALETTE } from "./colors";
import type { EditorTarget } from "./model";

export interface EditorValues {
  title: string;
  categoryId: string | null;
  colorOverride: string | null;
  status: EventStatus;
  allDay: boolean;
  eventDate: string;
  startMin: number | null;
  endMin: number | null;
  location: string | null;
  notes: string | null;
  obligationId: string | null;
}

interface EventEditorProps {
  target: EditorTarget;
  categories: EventCategory[];
  obligations: Obligation[];
  onClose: () => void;
  onSave: (values: EditorValues) => Promise<boolean>;
}

const SLOT_OPTIONS: number[] = [];
for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += SLOT_MIN) SLOT_OPTIONS.push(m);

export function EventEditor({ target, categories, obligations, onClose, onSave }: EventEditorProps) {
  const init: EditorValues =
    target.mode === "edit"
      ? {
          title: target.event.title,
          categoryId: target.event.categoryId,
          colorOverride: target.event.colorOverride,
          status: target.event.status,
          allDay: target.event.allDay,
          eventDate: target.event.eventDate,
          startMin: target.event.startMin,
          endMin: target.event.endMin,
          location: target.event.location,
          notes: target.event.notes,
          obligationId: target.event.obligationId,
        }
      : {
          title: "",
          categoryId: categories[0]?.id ?? null,
          colorOverride: null,
          status: "confirmed",
          allDay: target.draft.allDay,
          eventDate: target.draft.eventDate,
          startMin: target.draft.startMin ?? DAY_START_MIN + 120,
          endMin: target.draft.endMin ?? DAY_START_MIN + 180,
          location: null,
          notes: null,
          obligationId: null,
        };

  const [v, setV] = React.useState<EditorValues>(init);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof EditorValues>(k: K, val: EditorValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const submit = async () => {
    if (!v.title.trim() || saving) return;
    setSaving(true);
    const payload: EditorValues = {
      ...v,
      title: v.title.trim(),
      startMin: v.allDay ? null : v.startMin,
      endMin: v.allDay ? null : v.endMin,
      location: v.location?.trim() ? v.location.trim() : null,
      notes: v.notes?.trim() ? v.notes.trim() : null,
    };
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) onClose();
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, saving]);

  const field = "w-full rounded-chip border border-hairline bg-surface-card px-3 h-10 text-[13.5px] text-ink-strong outline-none focus:border-hairline-strong";
  const label = "text-[11px] font-bold uppercase tracking-wide text-ink-soft";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="wg-modal-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 17 }}>
            {target.mode === "edit" ? "Edit Event" : "New Event"}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink-strong" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3.5 overflow-y-auto px-5 py-4">
          <div>
            <label className={label}>Title</label>
            <input
              autoFocus
              value={v.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. BNI meeting, PS Batch 7…"
              className={cn(field, "mt-1")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <select
                value={v.categoryId ?? ""}
                onChange={(e) => set("categoryId", e.target.value || null)}
                className={cn(field, "mt-1")}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <div className="mt-1 inline-flex h-10 w-full rounded-chip border border-hairline p-0.5">
                {(["confirmed", "tentative"] as EventStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("status", s)}
                    className={cn(
                      "flex-1 rounded-[calc(var(--radius-chip,10px)-2px)] text-[12.5px] font-semibold capitalize transition-colors",
                      v.status === s ? "text-white" : "text-ink-muted",
                    )}
                    style={v.status === s ? { background: "var(--color-altus-red, #c8102e)" } : undefined}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={label}>Colour override</label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {EVENT_PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  onClick={() => set("colorOverride", hex)}
                  className={cn(
                    "h-6 w-6 rounded-md ring-1 ring-black/10 transition-transform hover:scale-110",
                    v.colorOverride === hex && "ring-2 ring-offset-1 ring-ink-strong",
                  )}
                  style={{ background: hex }}
                />
              ))}
              <button
                type="button"
                onClick={() => set("colorOverride", null)}
                className="ml-1 rounded-chip border border-hairline px-2 py-1 text-[11.5px] font-medium text-ink-muted hover:bg-surface-soft"
              >
                Use Category
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Date</label>
              <input
                type="date"
                value={v.eventDate}
                onChange={(e) => e.target.value && set("eventDate", e.target.value)}
                className={cn(field, "mt-1")}
              />
            </div>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={v.allDay}
                onChange={(e) => set("allDay", e.target.checked)}
                className="h-4 w-4 accent-[var(--color-altus-red,#c8102e)]"
              />
              <span className="text-[13px] font-medium text-ink-strong">All-day</span>
            </label>
          </div>

          {!v.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Start</label>
                <select
                  value={v.startMin ?? DAY_START_MIN}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    set("startMin", s);
                    if (v.endMin == null || v.endMin <= s) set("endMin", Math.min(DAY_END_MIN, s + SLOT_MIN));
                  }}
                  className={cn(field, "mt-1")}
                >
                  {SLOT_OPTIONS.slice(0, -1).map((m) => (
                    <option key={m} value={m}>{minToLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>End</label>
                <select
                  value={v.endMin ?? DAY_START_MIN + SLOT_MIN}
                  onChange={(e) => set("endMin", Number(e.target.value))}
                  className={cn(field, "mt-1")}
                >
                  {SLOT_OPTIONS.filter((m) => m > (v.startMin ?? DAY_START_MIN)).map((m) => (
                    <option key={m} value={m}>{minToLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className={label}>Location</label>
            <input
              value={v.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Optional"
              className={cn(field, "mt-1")}
            />
          </div>

          {obligations.length > 0 && (
            <div>
              <label className={label}>Counts toward obligation</label>
              <select
                value={v.obligationId ?? ""}
                onChange={(e) => set("obligationId", e.target.value || null)}
                className={cn(field, "mt-1")}
              >
                <option value="">— None —</option>
                {obligations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.counterparty ? ` (${o.counterparty})` : ""}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Notes</label>
            <textarea
              value={v.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[13.5px] text-ink-strong outline-none focus:border-hairline-strong"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3.5">
          <button type="button" onClick={onClose} className="bg-surface-card h-10 rounded-chip border border-hairline px-4 text-[13px] font-semibold text-ink-strong hover:bg-surface-soft">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !v.title.trim()}
            className="h-10 rounded-chip px-5 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red, #c8102e)" }}
          >
            {saving ? "Saving…" : target.mode === "edit" ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
