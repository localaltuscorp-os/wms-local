"use client";

import * as React from "react";
import { Plus, Trash2, X, Users, PauseCircle, PlayCircle } from "lucide-react";
import {
  ALLOCATION_CATEGORIES,
  HH_CALL_TYPES,
  HH_DAYS,
  HH_BATCHED_SECTIONS,
  hhCallTypeLabel,
  hhDayLabel,
} from "@/db/enums";
import { DateField } from "@/components/ui/date-field";
import { formatDMonY } from "@/lib/format";
import {
  upsertAmbassador,
  removeAmbassador,
  setAmbassadorHold,
} from "@/app/(app)/people-allocation/actions";
import { Kbd } from "@/components/layout/keyboard-shortcuts";
import type { Ambassador, HhCall } from "@/lib/queries/people-allocation";

/**
 * HAND-HOLDING › AMBASSADORS — its own screen, reached from its own rail entry.
 * No link to clients or the four categories, by design.
 *
 * The Add form is the participants' form, with one difference the brief calls
 * for: Product Name is a multi-select, because an ambassador may carry several.
 */

const ORANGE = "#ea580c";
const ORANGE_DEEP = "#c2410c";

const DELETE_CONFIRM = "Are you sure you want to delete? This cannot be undone.";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#ea580c]/40";

type Run = (fn: () => void) => void;

/** Wrapper that owns the error + transition state the list needs. */
export function AmbassadorsScreen({ rows, calls }: { rows: Ambassador[]; calls: HhCall[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          {error}
        </p>
      )}
      <AmbassadorList rows={rows} calls={calls} pending={pending} run={startTransition} onError={setError} />
    </>
  );
}

function AmbassadorList({
  rows,
  calls,
  pending,
  run,
  onError,
}: {
  rows: Ambassador[];
  calls: HhCall[];
  pending: boolean;
  run: Run;
  onError: (s: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [products, setProducts] = React.useState<string[]>([]);
  const [batchNo, setBatchNo] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const blankCall = () => ({
    callType: HH_CALL_TYPES[0].code as string,
    day: HH_DAYS[0].code as string,
    durationMin: "",
  });
  const [weekly, setWeekly] = React.useState([blankCall(), blankCall()]);

  const showBatch = products.some((c) => HH_BATCHED_SECTIONS.includes(c));

  /** "A" opens the Add form here too, so the shortcut means one thing app-wide. */
  React.useEffect(() => {
    let lastKey = "";
    let lastAt = 0;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(t?.isContentEditable);
      const now = Date.now();
      // The app-wide nav shortcut is G-then-key; don't hijack the A of "G A".
      const afterG = lastKey === "g" && now - lastAt < 1500;
      const key = e.key.toLowerCase();
      if (key === "a" && !typing && !afterG && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
      lastKey = key;
      lastAt = now;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function reset() {
    setName("");
    setProducts([]);
    setBatchNo("");
    setStart("");
    setEnd("");
    setWeekly([blankCall(), blankCall()]);
    setOpen(false);
  }

  function toggleProduct(code: string) {
    setProducts((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));
  }

  function save() {
    if (!name.trim()) return;
    onError(null);
    run(async () => {
      const res = await upsertAmbassador({
        name,
        products,
        batchNo: showBatch ? batchNo : null,
        startDate: start || null,
        endDate: end || null,
        calls: weekly
          .filter((c) => c.callType && c.day)
          .map((c) => ({ callType: c.callType, day: c.day, durationMin: Number(c.durationMin || 0) })),
      });
      if (res.ok) reset();
      else onError(res.error);
    });
  }

  function confirmDelete(a: Ambassador) {
    if (!confirm(DELETE_CONFIRM)) return;
    run(async () => {
      const r = await removeAmbassador(a.id);
      if (!r.ok) onError(r.error);
    });
  }

  return (
    <section
      className="rounded-[22px] bg-surface-card p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Ambassadors"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-ink-strong">
          Ambassadors <span className="text-ink-subtle">- {rows.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="max-md:hidden" title="Press A to add">
            <Kbd>A</Kbd>
          </span>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
          >
            <Plus size={14} strokeWidth={2.8} /> Add
          </button>
        </div>
      </div>

      {open && (
        <div className="mb-3 rounded-xl p-3" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[210px] flex-1">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                Ambassador Name
              </span>
              <input
                className={inputCls}
                value={name}
                autoFocus
                aria-label="Ambassador Name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") reset();
                }}
              />
            </label>

            {/* Multi-select as toggles rather than a <select multiple>: four
                options, and ctrl-click is not a thing anyone should need. */}
            <div className="min-w-[300px] flex-1">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                Product Name
              </span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Product Name">
                {ALLOCATION_CATEGORIES.map((c) => {
                  const on = products.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleProduct(c.code)}
                      className="rounded-pill px-3.5 py-2 text-[13px] font-bold transition-colors"
                      style={
                        on
                          ? { background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`, color: "#fff" }
                          : {
                              color: "var(--color-ink-soft)",
                              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                            }
                      }
                    >
                      {c.short}
                    </button>
                  );
                })}
              </div>
            </div>

            {showBatch && (
              <label className="w-[130px]">
                <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  Batch No.
                </span>
                <input
                  className={inputCls}
                  value={batchNo}
                  aria-label="Batch No."
                  onChange={(e) => setBatchNo(e.target.value)}
                />
              </label>
            )}
            <label className="w-[165px]">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                Start Date
              </span>
              <DateField
                className={inputCls}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label="Start Date"
              />
            </label>
            <label className="w-[165px]">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                End Date
              </span>
              <DateField
                className={inputCls}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                aria-label="End Date"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {weekly.map((c, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <label className="w-[185px]">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                    Weekly Call {i + 1} Type
                  </span>
                  <select
                    className={inputCls}
                    value={c.callType}
                    aria-label={`Weekly Call ${i + 1} Type`}
                    onChange={(e) => {
                      const next = [...weekly];
                      next[i] = { ...next[i]!, callType: e.target.value };
                      setWeekly(next);
                    }}
                  >
                    {HH_CALL_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-[110px]">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                    Day
                  </span>
                  <select
                    className={inputCls}
                    value={c.day}
                    aria-label={`Weekly Call ${i + 1} Day`}
                    onChange={(e) => {
                      const next = [...weekly];
                      next[i] = { ...next[i]!, day: e.target.value };
                      setWeekly(next);
                    }}
                  >
                    {HH_DAYS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-[145px]">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                    Duration (min)
                  </span>
                  <input
                    type="number"
                    min="0"
                    className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                    value={c.durationMin}
                    aria-label={`Weekly Call ${i + 1} Duration`}
                    onChange={(e) => {
                      const next = [...weekly];
                      next[i] = { ...next[i]!, durationMin: e.target.value };
                      setWeekly(next);
                    }}
                  />
                </label>
                {weekly.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove Weekly Call ${i + 1}`}
                    onClick={() => setWeekly(weekly.filter((_, k) => k !== i))}
                    className="mb-1 rounded-lg p-2 text-ink-subtle hover:bg-black/5 hover:text-ink-strong"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setWeekly([...weekly, blankCall()])}
              className="inline-flex w-fit items-center gap-1.5 text-[13px] font-bold"
              style={{ color: ORANGE }}
            >
              <Plus size={14} strokeWidth={2.8} /> Add more weekly calls
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !name.trim()}
              className="wg-btn rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={reset}
              className="wg-btn rounded-pill px-4 py-2 text-[13px] font-bold"
              style={{
                background: "var(--color-surface-card)",
                color: "var(--color-ink-soft)",
                boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p
          className="rounded-xl px-3 py-8 text-center text-[13.5px] text-ink-subtle"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <Users size={22} className="mx-auto mb-2 text-ink-subtle" />
          No ambassadors yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr
                className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
                style={{ background: "color-mix(in srgb, var(--color-ink-strong) 3%, transparent)" }}
              >
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="w-[110px] px-4 py-2.5">Batch No.</th>
                <th className="w-[140px] px-4 py-2.5">Start Date</th>
                <th className="w-[140px] px-4 py-2.5">End Date</th>
                <th className="px-4 py-2.5">Weekly Calls</th>
                <th className="w-[96px] px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const mine = calls.filter((c) => c.entryId === a.id);
                return (
                  <tr
                    key={a.id}
                    className="border-t border-hairline transition-colors hover:bg-black/[0.02]"
                    style={a.onHold ? { opacity: 0.55 } : undefined}
                  >
                    <td className="px-4 py-3 font-semibold text-ink-strong">
                      {a.name}
                      {a.onHold && (
                        <span
                          className="ml-2 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                          style={{
                            background: "color-mix(in srgb, var(--color-ink-strong) 7%, transparent)",
                            color: "var(--color-ink-soft)",
                          }}
                        >
                          On Hold
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.products.length === 0
                        ? "-"
                        : a.products
                            .map((c) => ALLOCATION_CATEGORIES.find((x) => x.code === c)?.short ?? c)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{a.batchNo || "-"}</td>
                    <td className="px-4 py-3 tabular-nums">{a.startDate ? formatDMonY(a.startDate) : "-"}</td>
                    <td className="px-4 py-3 tabular-nums">{a.endDate ? formatDMonY(a.endDate) : "-"}</td>
                    <td className="px-4 py-3">
                      {mine.length === 0 ? (
                        <span className="text-ink-subtle">{"-"}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {mine.map((c) => (
                            <span
                              key={c.id}
                              className="rounded-pill px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft"
                              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                            >
                              {hhCallTypeLabel(c.callType)} · {hhDayLabel(c.day)} · {c.durationMin}m
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={a.onHold ? `Resume ${a.name}` : `Hold ${a.name}`}
                          title={a.onHold ? "Resume" : "Put on hold"}
                          onClick={() =>
                            run(async () => {
                              const r = await setAmbassadorHold(a.id, !a.onHold);
                              if (!r.ok) onError(r.error);
                            })
                          }
                          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                        >
                          {a.onHold ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${a.name}`}
                          onClick={() => confirmDelete(a)}
                          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
