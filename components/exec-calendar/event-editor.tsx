"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { fireToast } from "@/lib/toast";
import { EXEC_CATEGORIES, categoryColors, execCategory, guessCategory } from "@/lib/exec-calendar/taxonomy";
import { EXEC_CLIENTS } from "@/lib/exec-calendar/clients";
import { SwatchSelect } from "./swatch-select";
import { DayMarkerForm } from "./day-marker-form";
import { MARKER_BG, type DayMarker } from "@/lib/exec-calendar/day-markers";
import { durationLabel, minToLabel } from "@/lib/exec-calendar/grid";
import { saveExecEvent, deleteExecEvent, type ExecEventInput } from "@/app/(app)/events/actions";

/**
 * The edit drawer (§6: "click opens an edit drawer").
 *
 * A right-hand drawer rather than a centred modal on purpose: the calendar stays
 * visible beside it, so you can see what you are booking around while you book.
 *
 * THE CATEGORY IS THE FIRST FIELD, not the last, because in this module the
 * category decides behaviour — whether the block is protected, whether it takes
 * a client, whether it renders as an all-day banner. Choosing it last would
 * mean re-answering the questions above it.
 *
 * Duration is DERIVED from the clock and shown live, never typed. A typed
 * duration and a typed end time are two sources of truth that eventually
 * disagree, and the one people trust is whichever is wrong.
 */

const TIME_STEP = 15;
const TIMES = Array.from({ length: (24 * 60) / TIME_STEP }, (_, i) => i * TIME_STEP);

export interface EditorEvent {
  id?: string;
  title: string;
  categoryKey: string;
  day: string;
  startMin: number | null;
  endMin: number | null;
  allDay: boolean;
  location?: string | null;
  notes?: string | null;
  clientEntryId?: string | null;
  /** The fixed-list client (lib/exec-calendar/clients.ts). */
  clientKey?: string | null;
  batchLabel?: string | null;
}

/** Messages read as labels here, not sentences: no trailing full stop. */
function tidy(msg: string): string {
  return msg.trim().replace(/\.+$/, "");
}

/** Server messages that belong under the time row rather than at the bottom. */
function isTimeMessage(msg: string): boolean {
  return /end after it starts|both a start and an end|protected|all-day block has no times/i.test(msg);
}

const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

export function ExecEventEditor({
  initial,
  onClose,
  initialMarker = null,
  startTab = "block",
  today,
}: {
  initial: EditorEvent;
  onClose: () => void;
  /** An existing Day Marker to edit - opens the drawer on the marker form. */
  initialMarker?: DayMarker | null;
  startTab?: "block" | "marker";
  today?: string;
}) {
  const router = useRouter();
  // BLOCK | DAY MARKER (2026-09-18). Offered only for something NEW: an
  // existing block stays a block and an existing marker a marker.
  const [tab, setTab] = React.useState<"block" | "marker">(initialMarker ? "marker" : startTab);
  const offerTabs = !initial.id && !initialMarker;
  const [v, setV] = React.useState<EditorEvent>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cat = execCategory(v.categoryKey);
  const col = categoryColors(v.categoryKey);
  const set = <K extends keyof EditorEvent>(k: K, val: EditorEvent[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Suggest a category from the title while it is still untouched — the import
  // path for sheet cells, offered rather than imposed.
  React.useEffect(() => {
    if (v.id || !v.title.trim()) return;
    const guess = guessCategory(v.title);
    if (guess && guess !== v.categoryKey) setV((p) => ({ ...p, categoryKey: guess }));
    // Only while typing a NEW block's title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.title]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dropdown inside the drawer marks its own Esc as handled.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && tab === "block") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A server error is about the version you SENT. The moment a field changes it
  // may no longer be true — the drawer kept saying "It has to end after it
  // starts" beside a valid 10:00–11:00 (2026-09-18) — so any edit clears it.
  React.useEffect(() => {
    setError(null);
  }, [v]);

  // The time rule, checked live rather than only on submit.
  const timeError =
    v.allDay
      ? null
      : v.startMin != null && v.endMin != null && v.endMin <= v.startMin
        ? "It has to end after it starts"
        : (v.startMin == null) !== (v.endMin == null)
          ? "Give it both a start and an end"
          : null;
  const shownError = timeError ?? (error && isTimeMessage(error) ? tidy(error) : null);

  const duration =
    !v.allDay && v.startMin != null && v.endMin != null && v.endMin > v.startMin
      ? durationLabel(v.endMin - v.startMin)
      : null;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveExecEvent(v as ExecEventInput);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({ message: v.id ? "Updated" : "Added to the calendar", type: "success" });
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!v.id || busy) return;
    setBusy(true);
    const res = await deleteExecEvent(v.id);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({ message: "Removed", type: "success" });
    onClose();
    router.refresh();
  }

  return (
    /* z-[70], ABOVE the global top bar. The top bar is `position: sticky;
       z-index: 60` (.aura-topbar, app/aura.css), so at the old z-50 this
       drawer's own header — the "NEW BLOCK" eyebrow and the date — was painted
       underneath it, and what showed between the bar and the Block|Day Marker
       toggle was a tinted sliver of half-covered header that read as unexplained
       empty space. The backdrop was under the top bar too, leaving the bar live
       and clickable while a modal was open. Raising the whole drawer fixes both:
       the header is visible and the backdrop covers what it is supposed to. */
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-label="Edit block">
      <button className="flex-1 bg-black/25" aria-label="Close" onClick={onClose} />
      <div className="flex h-full w-[380px] max-w-full flex-col overflow-y-auto bg-surface-card shadow-2xl">
        <header
          className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3"
          style={tab === "marker" ? { background: MARKER_BG } : { background: col.bg }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: tab === "marker" ? "#fff" : col.deep }}>
              {tab === "marker" ? (initialMarker ? "Edit day marker" : "New day marker") : v.id ? "Edit block" : "New block"}
            </div>
            {tab === "block" && <div className="truncate text-[13px] font-semibold text-ink-strong">{v.day}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`rounded-lg p-1.5 ${tab === "marker" ? "text-white/80 hover:text-white" : "text-ink-muted hover:text-ink-strong"}`}
          >
            <X size={16} />
          </button>
        </header>

        {offerTabs && (
          <div className="border-b border-hairline px-4 py-2.5">
            <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-hairline bg-surface-soft p-0.5" role="tablist" aria-label="What to add">
              {([
                ["block", "Block"],
                ["marker", "Day Marker"],
              ] as const).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className="rounded-md py-1.5 text-[12.5px] font-bold transition"
                  style={tab === k ? { background: "var(--color-altus-red)", color: "#fff" } : { color: "var(--color-ink-muted)" }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "marker" ? (
          <DayMarkerForm initial={initialMarker} defaultDay={v.day} today={today} onClose={onClose} />
        ) : (
        <>

        <div className="flex-1 space-y-3.5 px-4 py-4">
          <div>
            {/* A dropdown of coloured boxes (2026-09-18) - fourteen categories
                no longer fit as a grid of buttons. */}
            <label className={LABEL}>Category</label>
            <SwatchSelect
              ariaLabel="Category"
              value={v.categoryKey}
              options={EXEC_CATEGORIES.map((c) => ({ value: c.key, label: c.label, hex: c.hex }))}
              onChange={(k) => k && set("categoryKey", k)}
            />
            {cat.protected && (
              <p className="mt-1.5 text-[11px] font-semibold" style={{ color: col.deep }}>
                Protected — nobody but you can book over this.
              </p>
            )}
          </div>

          <div>
            <label className={LABEL}>Title</label>
            <input
              className={FIELD}
              value={v.title}
              autoFocus
              placeholder="e.g. BSS 90 S21, Arihant review, Exercise"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label className={LABEL}>Place</label>
            <input
              className={FIELD}
              value={v.location ?? ""}
              placeholder="e.g. Andheri office, Zoom, client site"
              maxLength={200}
              onChange={(e) => set("location", e.target.value || null)}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={v.allDay}
              onChange={(e) => {
                const on = e.target.checked;
                setV((p) => ({ ...p, allDay: on, startMin: on ? null : 10 * 60, endMin: on ? null : 11 * 60 }));
              }}
            />
            <span className="text-[12.5px] font-semibold text-ink-strong">All day</span>
          </label>

          {!v.allDay && (
            <div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className={LABEL}>From</label>
                <Chevroned>
                  <select
                    className={`${FIELD} appearance-none !pr-9`}
                    value={v.startMin ?? ""}
                    onChange={(e) => set("startMin", e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">—</option>
                    {TIMES.map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
                  </select>
                </Chevroned>
              </div>
              <div className="min-w-0 flex-1">
                <label className={LABEL}>To</label>
                <Chevroned>
                  <select
                    className={`${FIELD} appearance-none !pr-9`}
                    value={v.endMin ?? ""}
                    onChange={(e) => set("endMin", e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="">—</option>
                    {TIMES.map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
                  </select>
                </Chevroned>
              </div>
              {/* The derived length, boxed in red so it reads as the answer to
                  the two fields beside it. Sized to its text, so "10h 30m" fits
                  without squeezing the time pickers (2026-09-18). */}
              <div
                className="mb-[3px] shrink-0 whitespace-nowrap rounded-lg border-2 px-2.5 py-[5px] text-center text-[12.5px] font-bold tabular-nums"
                style={{
                  borderColor: "var(--color-altus-red)",
                  color: "var(--color-altus-red-deep)",
                  minWidth: 46,
                }}
              >
                {duration ?? "—"}
              </div>
            </div>
            {/* Right under the times it is about, centred, no full stop. */}
            {shownError && (
              <p
                className="mt-2 rounded-lg px-3 py-2 text-center text-[12px] font-semibold"
                style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}
              >
                {shownError}
              </p>
            )}
            </div>
          )}

          {cat.linksClient && (
            <div>
              <label className={LABEL}>Client</label>
              <SwatchSelect
                ariaLabel="Client"
                value={v.clientKey ?? null}
                options={EXEC_CLIENTS.map((c) => ({ value: c.key, label: c.label, hex: c.hex }))}
                noneLabel="— no client —"
                onChange={(k) => set("clientKey", k)}
              />
            </div>
          )}

          {cat.linksCohort && (
            <div>
              <label className={LABEL}>Batch</label>
              <input
                className={FIELD}
                value={v.batchLabel ?? ""}
                placeholder="e.g. BSS 90, PS 76 S5"
                onChange={(e) => set("batchLabel", e.target.value || null)}
              />
            </div>
          )}

          <div>
            <label className={LABEL}>Notes</label>
            <textarea
              className={`${FIELD} min-h-[64px] resize-y`}
              value={v.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </div>

          {/* Errors that are NOT about the times (and the time error when the
              block is all-day, where there is no time row to sit under). */}
          {error && (v.allDay || !isTimeMessage(error)) && (
            <p
              className="rounded-lg px-3 py-2 text-center text-[12px] font-semibold"
              style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}
            >
              {tidy(error)}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          {v.id && (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-hairline p-2 text-ink-muted transition hover:text-[var(--color-red-deep)]"
              aria-label="Delete"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !v.title.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {v.id ? "Save" : "Add"}
          </button>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}
