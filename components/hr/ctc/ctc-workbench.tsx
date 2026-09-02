"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Building2,
  UserRound,
  Undo2,
  Redo2,
  Save,
  Loader2,
  Check,
  Plus,
  Trash2,
  CalendarDays,
  FileText,
  TrendingUp,
} from "lucide-react";
import { ENTITY_LIST, getEntity, type EntityId } from "@/lib/hr/entities";
import { formatDate } from "@/lib/format";
import { LookupSelect } from "@/components/ui/lookup-select";
import {
  CTC_REASONS,
  REASON_LABELS,
  computeTotals,
  formatINR,
  formatINRCompact,
  type CtcComponents,
  type CtcReason,
  type CtcVersion,
  type GrowthEntry,
} from "@/lib/hr/ctc/model";
import {
  readCtcDraft,
  writeCtcDraft,
  clearCtcDraft,
  hasCtcDraft,
  readCtcLastEmployee,
  writeCtcLetterPrefill,
} from "@/lib/hr/ctc/local-store";
import { fireToast } from "@/lib/toast";
import { CtcSheet } from "./ctc-sheet";
import {
  loadCtcVersions,
  saveCtcVersion,
  deleteCtcVersion,
  type CtcRosterOption,
} from "@/app/(app)/hr/ctc/actions";

const RED = "#E10600";
const RED_DEEP = "#A80400";

const LETTER_LINKS = [
  { key: "ctc-breakup", label: "CTC Breakup Letter" },
  { key: "appraisal-revised-ctc", label: "Appraisal — Revised CTC" },
  { key: "promotion-revised-ctc", label: "Promotion — Revised CTC" },
] as const;

/* ------------------------------------------------------------------ */
/* Undo/redo history for the components map                             */
/* ------------------------------------------------------------------ */

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  baseline: T;
}

function useHistory<T>(initial: T) {
  const [s, setS] = useState<HistoryState<T>>(() => ({ past: [], present: initial, future: [], baseline: initial }));
  const eq = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

  const update = useCallback((next: T) => setS((st) => ({ ...st, present: next, future: [] })), []);

  const commit = useCallback(
    () =>
      setS((st) => {
        if (eq(st.present, st.baseline)) return st;
        return { past: [...st.past, st.baseline], present: st.present, future: [], baseline: st.present };
      }),
    [],
  );

  const undo = useCallback(
    () =>
      setS((st) => {
        // flush any pending (uncommitted) edit into history first
        let cur = st;
        if (!eq(st.present, st.baseline)) {
          cur = { past: [...st.past, st.baseline], present: st.present, future: st.future, baseline: st.present };
        }
        if (cur.past.length === 0) return cur;
        const prev = cur.past[cur.past.length - 1]!;
        return { past: cur.past.slice(0, -1), present: prev, future: [cur.present, ...cur.future], baseline: prev };
      }),
    [],
  );

  const redo = useCallback(
    () =>
      setS((st) => {
        if (st.future.length === 0) return st;
        const nxt = st.future[0]!;
        return { past: [...st.past, st.present], present: nxt, future: st.future.slice(1), baseline: nxt };
      }),
    [],
  );

  const reset = useCallback((v: T) => setS({ past: [], present: v, future: [], baseline: v }), []);

  const canUndo = s.past.length > 0 || !eq(s.present, s.baseline);
  const canRedo = s.future.length > 0;
  return { present: s.present, update, commit, undo, redo, reset, canUndo, canRedo };
}

/* ------------------------------------------------------------------ */
/* Workbench                                                            */
/* ------------------------------------------------------------------ */

export function CtcWorkbench({ roster, isAdmin }: { roster: CtcRosterOption[]; isAdmin: boolean }) {
  const [employeeId, setEmployeeId] = useState("");
  const [versions, setVersions] = useState<CtcVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null); // null = unsaved new revision

  const [entity, setEntity] = useState<EntityId>("altus-corp");
  const [reason, setReason] = useState<CtcReason>("initial");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [growth, setGrowth] = useState<GrowthEntry[]>([]);

  const history = useHistory<CtcComponents>({});
  const components = history.present;

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectedEmployee = roster.find((r) => r.id === employeeId);
  const totals = useMemo(() => computeTotals(components), [components]);

  /* The employee's FIXED paying entity → resolve their stored payingEntityName
   * to a letterhead EntityId (falls back to the default when unset/unknown). */
  const entityForEmployeeId = useCallback(
    (id: string): EntityId => getEntity(roster.find((r) => r.id === id)?.payingEntityName ?? null).id,
    [roster],
  );

  /* ── load an employee's history ─────────────────────────── */
  const loadVersionInto = useCallback(
    (v: CtcVersion) => {
      setActiveId(v.id);
      setEntity(v.entity);
      setReason(v.reason);
      setEffectiveDate(v.effectiveDate ?? "");
      setGrowth(v.growthJourney);
      history.reset({ ...v.components });
      setDirty(false);
    },
    [history],
  );

  const startNewRevision = useCallback(
    (existing: CtcVersion[], forEntity?: EntityId) => {
      const latest = existing[existing.length - 1];
      setActiveId(null);
      // Paying entity is FIXED per employee → auto-pick theirs (not carried-forward).
      setEntity(forEntity ?? latest?.entity ?? "altus-corp");
      setReason(existing.length ? "appraisal" : "initial");
      setEffectiveDate("");
      setGrowth([]);
      history.reset(latest ? { ...latest.components } : {});
      setDirty(Boolean(latest)); // carried-forward numbers count as unsaved
    },
    [history],
  );

  const selectEmployee = useCallback(
    async (id: string) => {
      setEmployeeId(id);
      if (!id) {
        setVersions([]);
        setActiveId(null);
        history.reset({});
        return;
      }
      setLoading(true);
      try {
        const vs = await loadCtcVersions(id);
        setVersions(vs);
        // Restore an in-progress (unsaved) edit if one was left behind — so
        // leaving to a letter and pressing Back keeps the half-filled state.
        const draft = readCtcDraft(id);
        if (draft) {
          setActiveId(draft.activeId);
          setEntity(draft.entity);
          setReason(draft.reason);
          setEffectiveDate(draft.effectiveDate);
          setGrowth(draft.growth);
          history.reset({ ...draft.components });
          setDirty(true);
        } else if (vs.length) {
          loadVersionInto(vs[vs.length - 1]!);
        } else {
          startNewRevision([], entityForEmployeeId(id));
        }
      } catch {
        fireToast({ message: "Could not load this employee's CTC.", type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [history, loadVersionInto, startNewRevision, entityForEmployeeId],
  );

  /* ── restore the last in-progress edit on mount (Back from a letter) ─── */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const last = readCtcLastEmployee();
    if (last && hasCtcDraft(last) && roster.some((r) => r.id === last)) {
      void selectEmployee(last);
    }
  }, [roster, selectEmployee]);

  /* ── persist the working draft (clear it once saved / clean) ─────────── */
  useEffect(() => {
    if (!employeeId) return;
    if (dirty) {
      writeCtcDraft(employeeId, { activeId, entity, reason, effectiveDate, components, growth });
    } else {
      clearCtcDraft(employeeId);
    }
  }, [employeeId, dirty, activeId, entity, reason, effectiveDate, components, growth]);

  /* ── component edits ────────────────────────────────────── */
  const onChangeComponent = useCallback(
    (id: string, value: number) => {
      const next = { ...history.present };
      if (value > 0) next[id] = value;
      else delete next[id];
      history.update(next);
      setDirty(true);
    },
    [history],
  );

  /* ── save ───────────────────────────────────────────────── */
  const save = useCallback(async () => {
    if (!employeeId) {
      fireToast({ message: "Pick an employee first.", type: "error" });
      return;
    }
    history.commit();
    setSaving(true);
    try {
      const res = await saveCtcVersion({
        id: activeId ?? undefined,
        employeeId,
        reason,
        effectiveDate: effectiveDate || null,
        entity,
        components: history.present,
        growthJourney: growth,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const vs = await loadCtcVersions(employeeId);
      setVersions(vs);
      const saved = vs.find((v) => v.id === res.id);
      if (saved) loadVersionInto(saved);
      setDirty(false);
      fireToast({ message: activeId ? "CTC updated." : `Version ${res.version} saved.` });
    } catch {
      fireToast({ message: "Could not save the CTC.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [activeId, employeeId, entity, reason, effectiveDate, growth, history, loadVersionInto]);

  const removeVersion = useCallback(
    async (id: string) => {
      const res = await deleteCtcVersion(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const vs = await loadCtcVersions(employeeId);
      setVersions(vs);
      if (vs.length) loadVersionInto(vs[vs.length - 1]!);
      else startNewRevision([]);
      fireToast({ message: "Version removed." });
    },
    [employeeId, loadVersionInto, startNewRevision],
  );

  /* ── keyboard: ⌘S save · ⌘Z undo · ⌘⇧Z / ⌘Y redo ─────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void save();
      } else if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        setDirty(true);
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        history.redo();
        setDirty(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, save]);

  /* ── growth-journey notes ───────────────────────────────── */
  const addGrowthNote = () =>
    setGrowth((g) => [
      ...g,
      { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), title: "", detail: "" },
    ]);
  const updateGrowthNote = (id: string, patch: Partial<GrowthEntry>) => {
    setGrowth((g) => g.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  };
  const removeGrowthNote = (id: string) => {
    setGrowth((g) => g.filter((n) => n.id !== id));
    setDirty(true);
  };

  return (
    <div className="ctcw">
      <style>{WORKBENCH_CSS}</style>

      {/* ── Pickers ─────────────────────────────────────────── */}
      <div className="ctcw-pickers">
        <div className="ctcw-pick">
          <UserRound size={15} strokeWidth={2.2} aria-hidden />
          <span className="ctcw-pick-label">Employee</span>
          <LookupSelect
            label="employee"
            value={employeeId || null}
            onChange={(id) => void selectEmployee(id ?? "")}
            options={roster.map((r) => ({
              id: r.id,
              name: r.designation ? `${r.name} · ${r.designation}` : r.name,
            }))}
            placeholder="— Select an employee —"
            className="ctcw-lookup-trigger"
          />
        </div>

        <label className="ctcw-pick">
          <Building2 size={15} strokeWidth={2.2} aria-hidden />
          <span className="ctcw-pick-label">Paying Entity</span>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as EntityId);
              setDirty(true);
            }}
            aria-label="Paying entity"
            disabled={!employeeId}
          >
            {ENTITY_LIST.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="ctcw-pick">
          <TrendingUp size={15} strokeWidth={2.2} aria-hidden />
          <span className="ctcw-pick-label">Revision Reason</span>
          <select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value as CtcReason);
              setDirty(true);
            }}
            aria-label="Revision reason"
            disabled={!employeeId}
          >
            {CTC_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="ctcw-pick">
          <CalendarDays size={15} strokeWidth={2.2} aria-hidden />
          <span className="ctcw-pick-label">Effective Date</span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => {
              setEffectiveDate(e.target.value);
              setDirty(true);
            }}
            aria-label="Effective date"
            disabled={!employeeId}
          />
        </label>
      </div>

      {!employeeId ? (
        <EmptyState />
      ) : loading ? (
        <div className="ctcw-loading">
          <Loader2 size={22} className="ctcw-spin" /> Loading compensation history…
        </div>
      ) : (
        <div className="ctcw-body">
          {/* ── Left: Growth Journey timeline ───────────────── */}
          <aside className="ctcw-journey">
            <div className="ctcw-journey-head">
              <span className="ctcw-journey-title">Growth Journey</span>
              <button
                type="button"
                className="ctcw-newrev"
                onClick={() => startNewRevision(versions, entityForEmployeeId(employeeId))}
                title="Start a new CTC revision (carries the current numbers forward)"
              >
                <Plus size={14} strokeWidth={2.6} /> New revision
              </button>
            </div>

            <ol className="ctcw-timeline">
              {versions.map((v) => {
                const t = computeTotals(v.components);
                const active = v.id === activeId;
                return (
                  <li key={v.id} className={`ctcw-node${active ? " is-active" : ""}`}>
                    <button type="button" className="ctcw-node-btn" onClick={() => loadVersionInto(v)}>
                      <span className="ctcw-node-dot" />
                      <span className="ctcw-node-main">
                        <span className="ctcw-node-top">
                          <span className="ctcw-node-ver">v{v.version}</span>
                          <span className="ctcw-node-reason">{REASON_LABELS[v.reason]}</span>
                        </span>
                        <span className="ctcw-node-ctc">{formatINRCompact(t.ctcAnnual)}/yr</span>
                        {v.effectiveDate && <span className="ctcw-node-date">w.e.f. {fmtDate(v.effectiveDate)}</span>}
                      </span>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="ctcw-node-del"
                        onClick={() => void removeVersion(v.id)}
                        aria-label={`Delete version ${v.version}`}
                        title="Delete this version"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                );
              })}

              {activeId === null && (
                <li className="ctcw-node is-active is-draft">
                  <span className="ctcw-node-btn ctcw-node-static">
                    <span className="ctcw-node-dot" />
                    <span className="ctcw-node-main">
                      <span className="ctcw-node-top">
                        <span className="ctcw-node-ver">v{(versions[versions.length - 1]?.version ?? 0) + 1}</span>
                        <span className="ctcw-node-reason">{REASON_LABELS[reason]}</span>
                      </span>
                      <span className="ctcw-node-ctc">{formatINRCompact(totals.ctcAnnual)}/yr</span>
                      <span className="ctcw-node-draft">Unsaved draft</span>
                    </span>
                  </span>
                </li>
              )}
            </ol>

            {/* Journey notes for this version */}
            <div className="ctcw-notes">
              <div className="ctcw-notes-head">
                <span>Journey Notes</span>
                <button type="button" className="ctcw-note-add" onClick={addGrowthNote}>
                  <Plus size={13} strokeWidth={2.6} /> Add
                </button>
              </div>
              {growth.length === 0 ? (
                <p className="ctcw-notes-empty">No notes on this revision yet.</p>
              ) : (
                growth.map((n) => (
                  <div key={n.id} className="ctcw-note">
                    <div className="ctcw-note-row">
                      <input
                        type="date"
                        className="ctcw-note-date"
                        value={n.date}
                        onChange={(e) => updateGrowthNote(n.id, { date: e.target.value })}
                        aria-label="Note date"
                      />
                      <button
                        type="button"
                        className="ctcw-note-del"
                        onClick={() => removeGrowthNote(n.id)}
                        aria-label="Remove note"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <input
                      type="text"
                      className="ctcw-note-title"
                      placeholder="Milestone (e.g. Promoted to Senior BDM)"
                      value={n.title}
                      onChange={(e) => updateGrowthNote(n.id, { title: e.target.value })}
                      aria-label="Note title"
                    />
                    <textarea
                      className="ctcw-note-detail"
                      rows={2}
                      placeholder="Detail (optional)"
                      value={n.detail}
                      onChange={(e) => updateGrowthNote(n.id, { detail: e.target.value })}
                      aria-label="Note detail"
                    />
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* ── Right: editor ───────────────────────────────── */}
          <div className="ctcw-editor">
            {/* Toolbar */}
            <div className="ctcw-toolbar">
              <div className="ctcw-headline">
                <span className="ctcw-headline-label">
                  {selectedEmployee?.name}
                  {selectedEmployee?.designation ? ` · ${selectedEmployee.designation}` : ""}
                </span>
                <span className="ctcw-headline-ctc">{formatINR(totals.ctcAnnual)}<span className="ctcw-yr">/yr CTC</span></span>
                <span className="ctcw-headline-sub">
                  {formatINR(totals.netMonthly)} net / month · {formatINR(totals.ctcMonthly)} CTC / month
                </span>
              </div>

              <div className="ctcw-tools">
                <button
                  type="button"
                  className="ctcw-tbtn"
                  onClick={() => {
                    history.undo();
                    setDirty(true);
                  }}
                  disabled={!history.canUndo}
                  title="Undo (⌘Z)"
                >
                  <Undo2 size={15} strokeWidth={2.2} /> Undo
                </button>
                <button
                  type="button"
                  className="ctcw-tbtn"
                  onClick={() => {
                    history.redo();
                    setDirty(true);
                  }}
                  disabled={!history.canRedo}
                  title="Redo (⌘⇧Z)"
                >
                  <Redo2 size={15} strokeWidth={2.2} /> Redo
                </button>
                <button
                  type="button"
                  className="ctcw-tbtn ctcw-tbtn-primary"
                  onClick={() => void save()}
                  disabled={saving || (!dirty && activeId !== null)}
                  title="Save (⌘S)"
                >
                  {saving ? (
                    <Loader2 size={15} className="ctcw-spin" />
                  ) : dirty || activeId === null ? (
                    <Save size={15} strokeWidth={2.2} />
                  ) : (
                    <Check size={15} strokeWidth={2.6} />
                  )}
                  {saving ? "Saving…" : activeId === null ? "Save version" : dirty ? "Save changes" : "Saved"}
                </button>
              </div>
            </div>

            <CtcSheet
              components={components}
              onChange={onChangeComponent}
              onCommit={history.commit}
            />

            {/* Compensation letters that quote these numbers */}
            <div className="ctcw-letters">
              <span className="ctcw-letters-label">
                <FileText size={14} strokeWidth={2.2} /> Compensation letters
              </span>
              <div className="ctcw-letters-links">
                {LETTER_LINKS.map((l) => (
                  <Link
                    key={l.key}
                    href={`/hr/letters/${l.key}?employee=${employeeId}&ctc=current` as Route}
                    className="ctcw-letter-link"
                    onClick={() =>
                      writeCtcLetterPrefill({ employeeId, components: history.present, entity })
                    }
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ctcw-empty">
      <span className="ctcw-empty-badge">
        <TrendingUp size={26} strokeWidth={2.1} />
      </span>
      <h2 className="ctcw-empty-title">Build a Structured CTC</h2>
      <p className="ctcw-empty-text">
        Pick an employee to open their compensation. Enter the earnings, deductions and employer contributions —
        the gross, net take-home and total Cost to Firm recompute live. Every save adds a version to their
        Growth Journey.
      </p>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

const WORKBENCH_CSS = `
.ctcw{width:100%;}
.ctcw-spin{animation:ctcw-spin 1s linear infinite;}
@keyframes ctcw-spin{to{transform:rotate(360deg);}}

/* Pickers */
.ctcw-pickers{
  display:flex;flex-wrap:wrap;gap:14px;margin-bottom:22px;
  padding:14px 16px;border:1px solid var(--color-hairline, #e2e8f0);border-radius:16px;
  background:color-mix(in srgb, var(--color-surface-soft, #f8fafc) 92%, transparent);
}
.ctcw-pick{display:flex;flex-direction:column;gap:5px;position:relative;padding-left:22px;flex:1 1 200px;min-width:180px;}
.ctcw-pick > svg{position:absolute;left:0;top:27px;color:${RED_DEEP};}
.ctcw-pick-label{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.ctcw-pick select,.ctcw-pick input{
  appearance:none;-webkit-appearance:none;width:100%;
  padding:9px 12px;border-radius:10px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1.5px solid var(--color-hairline-strong, #cbd5e1);
}
.ctcw-pick select{padding-right:30px;cursor:pointer;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.4'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 9px center;}
.ctcw-pick select:focus,.ctcw-pick input:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);}
.ctcw-pick select:disabled,.ctcw-pick input:disabled{background:var(--color-surface-soft, #f1f5f9);color:var(--color-ink-muted, #94a3b8);cursor:default;}
/* The searchable employee combobox trigger — matched to the native selects. */
.ctcw-pick .ctcw-lookup-trigger{
  width:100%;padding:9px 12px;border-radius:10px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1.5px solid var(--color-hairline-strong, #cbd5e1);
}
.ctcw-pick .ctcw-lookup-trigger:hover{border-color:var(--color-ink-muted, #94a3b8);}
.ctcw-pick .ctcw-lookup-trigger:focus-visible,.ctcw-pick .ctcw-lookup-trigger[aria-expanded="true"]{
  outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);
}

/* Body layout */
.ctcw-body{display:grid;grid-template-columns:288px 1fr;gap:22px;align-items:start;}
@media (max-width:920px){.ctcw-body{grid-template-columns:1fr;}}

.ctcw-loading{
  display:flex;align-items:center;justify-content:center;gap:10px;
  padding:80px 0;color:var(--color-ink-muted, #64748b);font-size:15px;font-weight:600;
}

/* Growth Journey */
.ctcw-journey{
  border:1px solid var(--color-hairline, #e2e8f0);border-radius:16px;background:#fff;
  padding:14px;position:sticky;top:76px;
}
@media (max-width:920px){.ctcw-journey{position:static;}}
.ctcw-journey-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.ctcw-journey-title{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:14px;font-weight:800;letter-spacing:.01em;color:var(--color-ink-strong, #0f172a);
}
.ctcw-newrev{
  display:inline-flex;align-items:center;gap:5px;
  padding:6px 11px;border-radius:9px;cursor:pointer;
  font-size:12px;font-weight:800;color:${RED_DEEP};
  background:#fff;border:1.5px solid color-mix(in srgb, ${RED} 40%, #fff);
  transition:background .12s ease, transform .12s ease;
}
.ctcw-newrev:hover{background:rgba(225,6,0,.06);transform:translateY(-1px);}

.ctcw-timeline{list-style:none;margin:0 0 8px;padding:0;position:relative;}
.ctcw-node{position:relative;display:flex;align-items:stretch;}
.ctcw-node-btn{
  flex:1;display:flex;gap:10px;align-items:flex-start;
  padding:9px 8px 9px 4px;border-radius:11px;cursor:pointer;
  background:transparent;border:1px solid transparent;text-align:left;width:100%;
  transition:background .12s ease, border-color .12s ease;
}
.ctcw-node-static{cursor:default;}
.ctcw-node-btn:hover:not(.ctcw-node-static){background:var(--color-surface-soft, #f8fafc);}
.ctcw-node.is-active > .ctcw-node-btn{background:rgba(225,6,0,.05);border-color:color-mix(in srgb, ${RED} 30%, #fff);}
.ctcw-node.is-draft > .ctcw-node-btn{background:repeating-linear-gradient(135deg, rgba(225,6,0,.05) 0 8px, rgba(225,6,0,.02) 8px 16px);}
.ctcw-node-dot{
  margin-top:4px;flex:0 0 auto;width:11px;height:11px;border-radius:9999px;
  background:#fff;border:2.5px solid var(--color-hairline-strong, #cbd5e1);
}
.ctcw-node.is-active .ctcw-node-dot{border-color:${RED};background:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.18);}
.ctcw-node:not(:last-child)::before{
  content:"";position:absolute;left:9.5px;top:20px;bottom:-4px;width:2px;
  background:var(--color-hairline, #e2e8f0);
}
.ctcw-node-main{display:flex;flex-direction:column;gap:2px;min-width:0;}
.ctcw-node-top{display:flex;align-items:baseline;gap:7px;}
.ctcw-node-ver{font-size:12px;font-weight:900;color:${RED_DEEP};}
.ctcw-node-reason{font-size:12.5px;font-weight:700;color:var(--color-ink-strong, #0f172a);}
.ctcw-node-ctc{font-size:13.5px;font-weight:800;color:var(--color-ink-strong, #0f172a);font-variant-numeric:tabular-nums;}
.ctcw-node-date{font-size:11px;font-weight:600;color:var(--color-ink-muted, #94a3b8);}
.ctcw-node-draft{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${RED};}
.ctcw-node-del{
  flex:0 0 auto;align-self:center;padding:5px;border-radius:7px;cursor:pointer;
  color:var(--color-ink-muted, #94a3b8);background:transparent;border:none;
  opacity:0;transition:opacity .12s ease, color .12s ease, background .12s ease;
}
.ctcw-node:hover .ctcw-node-del{opacity:1;}
.ctcw-node-del:hover{color:${RED};background:rgba(225,6,0,.08);}

/* Journey notes */
.ctcw-notes{border-top:1px solid var(--color-hairline, #eef0f4);padding-top:12px;}
.ctcw-notes-head{
  display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--color-ink-muted, #64748b);
}
.ctcw-note-add{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:7px;cursor:pointer;
  font-size:11px;font-weight:800;color:${RED_DEEP};background:transparent;border:1px solid var(--color-hairline-strong, #cbd5e1);}
.ctcw-note-add:hover{background:var(--color-surface-soft, #f8fafc);}
.ctcw-notes-empty{font-size:12.5px;font-style:italic;color:var(--color-ink-muted, #94a3b8);margin:2px 0 0;}
.ctcw-note{border:1px solid var(--color-hairline, #e2e8f0);border-radius:11px;padding:9px;margin-bottom:9px;background:var(--color-surface-soft, #fbfbfd);}
.ctcw-note-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;}
.ctcw-note-date{border:1px solid var(--color-hairline-strong, #cbd5e1);border-radius:7px;padding:4px 7px;font-size:11.5px;font-weight:700;color:var(--color-ink-strong, #0f172a);background:#fff;}
.ctcw-note-del{padding:4px;border-radius:6px;cursor:pointer;color:var(--color-ink-muted, #94a3b8);background:transparent;border:none;}
.ctcw-note-del:hover{color:${RED};}
.ctcw-note-title,.ctcw-note-detail{
  width:100%;border:1px solid var(--color-hairline-strong, #cbd5e1);border-radius:8px;
  padding:6px 9px;font-size:13px;font-weight:600;color:var(--color-ink-strong, #0f172a);background:#fff;margin-bottom:6px;
}
.ctcw-note-title{font-weight:700;}
.ctcw-note-detail{resize:vertical;line-height:1.5;}
.ctcw-note-title:focus,.ctcw-note-detail:focus,.ctcw-note-date:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.12);}

/* Editor */
.ctcw-editor{min-width:0;}
.ctcw-toolbar{
  display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;
  padding:14px 18px;margin-bottom:16px;border-radius:16px;
  border:1px solid var(--color-hairline, #e2e8f0);background:#fff;
  box-shadow:0 16px 40px -34px rgba(15,23,42,.4);
}
.ctcw-headline{display:flex;flex-direction:column;gap:1px;min-width:0;}
.ctcw-headline-label{font-size:12.5px;font-weight:700;color:var(--color-ink-muted, #64748b);}
.ctcw-headline-ctc{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:26px;font-weight:900;letter-spacing:-.02em;color:var(--color-ink-strong, #0f172a);
  font-variant-numeric:tabular-nums;line-height:1.1;
}
.ctcw-yr{font-size:13px;font-weight:800;color:var(--color-ink-muted, #94a3b8);margin-left:6px;letter-spacing:0;}
.ctcw-headline-sub{font-size:12px;font-weight:600;color:var(--color-ink-muted, #94a3b8);font-variant-numeric:tabular-nums;}
.ctcw-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.ctcw-tbtn{
  display:inline-flex;align-items:center;gap:6px;
  padding:8px 13px;border-radius:10px;cursor:pointer;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:700;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1.5px solid var(--color-hairline-strong, #cbd5e1);
  transition:transform .12s ease, border-color .12s ease, background .12s ease;
}
.ctcw-tbtn:not(:disabled):hover{border-color:var(--color-ink-muted, #94a3b8);transform:translateY(-1px);}
.ctcw-tbtn:disabled{opacity:.5;cursor:default;}
.ctcw-tbtn-primary{color:#fff;background:linear-gradient(135deg, ${RED}, ${RED_DEEP});border-color:transparent;box-shadow:0 10px 22px -12px rgba(168,4,0,.8);}
.ctcw-tbtn-primary:not(:disabled):hover{transform:translateY(-1px);}

/* Letters strip */
.ctcw-letters{
  display:flex;flex-wrap:wrap;align-items:center;gap:12px;
  margin-top:16px;padding:14px 18px;border-radius:14px;
  border:1px dashed var(--color-hairline-strong, #cbd5e1);background:#fff;
}
.ctcw-letters-label{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.02em;color:var(--color-ink-muted, #64748b);}
.ctcw-letters-links{display:flex;flex-wrap:wrap;gap:8px;}
.ctcw-letter-link{
  display:inline-flex;padding:7px 13px;border-radius:9px;
  font-size:13px;font-weight:700;color:${RED_DEEP};text-decoration:none;
  background:rgba(225,6,0,.06);border:1px solid color-mix(in srgb, ${RED} 26%, #fff);
  transition:background .12s ease, transform .12s ease;
}
.ctcw-letter-link:hover{background:rgba(225,6,0,.12);transform:translateY(-1px);}

/* Empty */
.ctcw-empty{
  max-width:560px;margin:40px auto;text-align:center;
  padding:48px 32px;border-radius:22px;background:#fff;
  border:1px solid var(--color-hairline, #e2e8f0);box-shadow:0 30px 70px -46px rgba(15,23,42,.4);
}
.ctcw-empty-badge{
  display:inline-flex;align-items:center;justify-content:center;
  width:60px;height:60px;border-radius:18px;margin-bottom:16px;
  background:rgba(225,6,0,.1);color:${RED_DEEP};
}
.ctcw-empty-title{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:23px;font-weight:800;color:var(--color-ink-strong, #0f172a);margin:0 0 8px;
}
.ctcw-empty-text{font-size:14.5px;font-weight:500;line-height:1.65;color:var(--color-ink-muted, #64748b);margin:0;}
`;

export default CtcWorkbench;
