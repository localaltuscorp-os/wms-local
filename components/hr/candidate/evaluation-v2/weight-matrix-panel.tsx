"use client";

import * as React from "react";
import {
  Loader2,
  Save,
  SlidersHorizontal,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { listWeightProfiles, saveWeightProfile } from "@/app/(app)/hr/evaluation-v2-actions";
import {
  RATING_SECTIONS,
  DESIGNATION_LADDER,
} from "@/lib/hr/candidate/evaluation-v2";

/**
 * WEIGHT MATRIX PANEL — super-admin editor for the per-designation section-weight
 * profiles that drive the Candidate Evaluation v2 weighted overall.
 *
 * · Loads every stored profile on mount (listWeightProfiles).
 * · A designation selector — "Default" + the rank ladder (Intern → Sr VP) — swaps
 *   the editable weight grid beneath it.
 * · Weights are RELATIVE (renormalized at score time), so the live total is a
 *   guide, not a hard "must equal 100" gate.
 * · Save persists just the selected designation; "Copy from Default" seeds the
 *   current designation from the Default profile; Reset reverts to what's on file.
 *
 * Load-neutral: CSS-string styling, no motion library. The parent is expected to
 * gate this to super-admins; it also fails safe when the action denies access.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** Ordered designation keys: the "default" profile first, then the ladder. */
const DESIGNATION_KEYS: string[] = ["default", ...DESIGNATION_LADDER];

type WeightMap = Record<string, number>;
type Model = Record<string, WeightMap>;

function labelFor(key: string): string {
  return key === "default" ? "Default" : key;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A fresh weight map from each rating section's coded default. */
function defaultWeights(): WeightMap {
  const w: WeightMap = {};
  for (const s of RATING_SECTIONS) w[s.id] = s.weight ?? 0;
  return w;
}

function totalOf(w: WeightMap | undefined): number {
  if (!w) return 0;
  return RATING_SECTIONS.reduce((sum, s) => sum + (Number(w[s.id]) || 0), 0);
}

function sameWeights(a: WeightMap | undefined, b: WeightMap | undefined): boolean {
  return RATING_SECTIONS.every((s) => (Number(a?.[s.id]) || 0) === (Number(b?.[s.id]) || 0));
}

export function WeightMatrixPanel() {
  // Collapsed by default — it's a super-admin tuning panel, not the main task;
  // the header stays visible and clicking it expands the metrics.
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<Model>({});
  const [baseline, setBaseline] = React.useState<Model>({});
  const [selected, setSelected] = React.useState<string>("default");
  const [saving, setSaving] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWeightProfiles();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const byDes = new Map(res.rows.map((r) => [r.designation, r.weights]));
      const next: Model = {};
      for (const key of DESIGNATION_KEYS) {
        const stored = byDes.get(key);
        const w: WeightMap = {};
        for (const s of RATING_SECTIONS) {
          const v = stored?.[s.id];
          w[s.id] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : (s.weight ?? 0);
        }
        next[key] = w;
      }
      setModel(next);
      // Deep-ish clone for an untouched baseline (flat number maps → spread is enough).
      const clone: Model = {};
      for (const key of DESIGNATION_KEYS) clone[key] = { ...next[key]! };
      setBaseline(clone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the weight profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Esc closes the floating panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = model[selected] ?? defaultWeights();
  const base = baseline[selected] ?? defaultWeights();
  const total = totalOf(current);
  const dirty = !sameWeights(current, base);

  function setOne(sectionId: string, raw: string) {
    const n = raw === "" ? 0 : Number(raw);
    const clean = Number.isFinite(n) ? Math.max(0, Math.min(1000, n)) : 0;
    setModel((prev) => ({
      ...prev,
      [selected]: { ...(prev[selected] ?? defaultWeights()), [sectionId]: clean },
    }));
    setJustSaved(false);
  }

  function copyFromDefault() {
    const src = model.default ?? defaultWeights();
    setModel((prev) => ({ ...prev, [selected]: { ...src } }));
    setJustSaved(false);
  }

  function reset() {
    setModel((prev) => ({ ...prev, [selected]: { ...base } }));
    setJustSaved(false);
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setJustSaved(false);
    try {
      const payload: WeightMap = {};
      for (const s of RATING_SECTIONS) payload[s.id] = Number(current[s.id]) || 0;
      const res = await saveWeightProfile(selected, payload);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setBaseline((prev) => ({ ...prev, [selected]: { ...payload } }));
      setJustSaved(true);
      fireToast({ message: `Saved weights for ${labelFor(selected)}.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative mb-4 w-fit">
      <style>{CSS}</style>

      {/* Collapsed = a compact square utility button (finger-sized). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Weight Metrics — tune section weights"
        title="Weight Metrics"
        className="grid h-11 w-11 place-items-center rounded-xl text-white shadow-[0_10px_24px_-12px_rgba(168,4,0,0.7)] transition-transform hover:scale-[1.06] active:scale-95"
        style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
      >
        <SlidersHorizontal size={19} strokeWidth={2.3} />
      </button>

      {open && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} aria-hidden />
          {/* floating panel — expands to the RIGHT of the button */}
          <div
            role="dialog"
            aria-label="Weight Metrics"
            className="wm-pop absolute left-[calc(100%+10px)] top-0 z-[90] w-[560px] max-w-[82vw] overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_28px_70px_-24px_rgba(24,24,27,0.5)]"
          >
            <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-3.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
              >
                <SlidersHorizontal size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[15.5px] font-black text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
                >
                  Weight Metrics
                </span>
                <span className="block truncate text-[12.5px] font-medium text-ink-muted">
                  Super-admin · tune how much each section counts, per designation.
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-5 pb-5 pt-4">
          {loading ? (
            <div className="grid place-items-center py-14 text-ink-muted">
              <Loader2 className="animate-spin" style={{ color: RED }} />
              <p className="mt-2 text-[13px] font-medium">Loading weight profiles…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-solid border-hairline-strong bg-surface-soft px-6 py-12 text-center">
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl"
                style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}
              >
                <AlertTriangle size={22} />
              </span>
              <p className="max-w-[40ch] text-[13.5px] font-semibold text-ink-strong">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <RotateCcw size={14} /> Try again
              </button>
            </div>
          ) : (
            <>
              {/* Designation selector */}
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <label
                    htmlFor="wm-designation"
                    className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft"
                  >
                    Designation
                  </label>
                  <div className="wm-select-wrap">
                    <select
                      id="wm-designation"
                      data-autofocus
                      value={selected}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        setJustSaved(false);
                      }}
                      className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 pr-9 text-[14px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                    >
                      {DESIGNATION_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {labelFor(key)}
                          {key !== "default" && !sameWeights(model[key], model.default) ? "  ·  customised" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <span
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold tabular-nums"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}
                >
                  <span className="text-[10.5px] uppercase tracking-wide opacity-80">Total weight</span>
                  {fmtNum(total)}
                </span>
              </div>

              <p className="mb-4 flex items-start gap-2 rounded-xl bg-surface-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                <SlidersHorizontal size={13} className="mt-0.5 shrink-0" style={{ color: RED }} />
                Weights are <strong className="font-bold text-ink-strong">relative</strong> — they&apos;re
                renormalized over the sections a candidate is actually rated on, so they need not add up to 100.
                Sections rated higher for this rank should simply carry more weight than the rest.
              </p>

              {/* Weight grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
                {RATING_SECTIONS.map((s) => {
                  const changed = (Number(current[s.id]) || 0) !== (Number(base[s.id]) || 0);
                  return (
                    <label key={s.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-black text-white"
                          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                        >
                          {s.code}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </span>
                      <span className="relative shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step={1}
                          inputMode="numeric"
                          value={String(Number(current[s.id]) || 0)}
                          onChange={(e) => setOne(s.id, e.target.value)}
                          aria-label={`${s.title} weight`}
                          className="w-[96px] rounded-lg border bg-white px-3 py-2 text-right text-[14px] font-bold tabular-nums text-ink-strong outline-none transition-colors focus:border-altus-red"
                          style={{
                            borderColor: changed ? RED : "var(--color-hairline-strong)",
                            boxShadow: changed ? `0 0 0 2px color-mix(in srgb, ${RED} 14%, transparent)` : "none",
                          }}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Footer: status + actions */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" style={{ color: RED }} /> Saving…
                    </>
                  ) : dirty ? (
                    <>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: RED }} /> Unsaved changes to{" "}
                      <strong className="font-bold text-ink-strong">{labelFor(selected)}</strong>
                    </>
                  ) : justSaved ? (
                    <>
                      <Check size={14} strokeWidth={3} style={{ color: "#15803d" }} /> Saved
                    </>
                  ) : (
                    <>Editing <strong className="font-bold text-ink-strong">{labelFor(selected)}</strong></>
                  )}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {selected !== "default" && (
                    <button
                      type="button"
                      onClick={copyFromDefault}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                    >
                      <Copy size={14} /> Copy from Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    disabled={!dirty}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-40"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save weights
                  </button>
                </div>
              </div>
            </>
          )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
  @keyframes wmPop { from { opacity: 0; transform: translateX(-8px) scale(0.98); } to { opacity: 1; transform: translateX(0) scale(1); } }
  .wm-pop { animation: wmPop 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: left center; }
  @media (prefers-reduced-motion: reduce) { .wm-pop { animation: none; } }
  .wm-select-wrap { position: relative; }
  .wm-select-wrap::after { content: ""; position: absolute; right: 14px; top: 50%; width: 9px; height: 9px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
`;
