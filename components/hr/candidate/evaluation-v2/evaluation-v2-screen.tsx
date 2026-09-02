"use client";

import * as React from "react";
import {
  Loader2,
  Check,
  UserRound,
  AlertTriangle,
  Briefcase,
  ShieldCheck,
  Printer,
  Share2,
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { fireToast } from "@/lib/toast";
import { PageShell } from "@/components/layout/page-shell";
import { LookupSelect } from "@/components/ui/lookup-select";
import { deleteCandidateIntake } from "@/app/(app)/hr/candidate-actions";
import {
  EVAL_SECTIONS,
  type EvaluationInstance,
  type EvaluatorRole,
  type EvalSection,
  type InterviewAiInsights,
  type OverrideEvent,
  type PassFail,
  type RecommendationValue,
  type TextboxId,
  RECOMMENDATIONS,
} from "@/lib/hr/candidate/evaluation-v2";
import {
  eligibilityVerdict,
  allSectionScores,
  type ScoreContext,
  type WeightProfile,
} from "@/lib/hr/candidate/evaluation-v2-scoring";
import { computeComposites } from "@/lib/hr/candidate/evaluation-v2-composites";
import { getEvaluationV2, saveEvaluationV2 } from "@/app/(app)/hr/evaluation-v2-actions";
import type { EvaluationV2Load } from "@/app/(app)/hr/evaluation-v2-actions-types";
import { SectionShell } from "./layout";
import { EligibilitySection } from "./eligibility-section";
import { RatingSection } from "./rating-section";
import { GateSection, SellGateSection } from "./gate-section";
import { OverallSection } from "./special-sections";
import { SectionRail, sectionStatus } from "./section-rail";
import { EvaluationV2Report } from "./evaluation-v2-report";
import type { EvalController } from "./controller";

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

type Candidate = { id: string; fullName: string; positionApplied?: string | null; status?: string | null };

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: "New" },
  shortlisted: { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Shortlisted" },
  rejected: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)", label: "Rejected" },
  hired: { bg: "color-mix(in srgb, #2563eb 12%, white)", fg: "#1d4ed8", label: "Hired" },
};

/** The Sales Competency section (M) applies only when the interviewer answers
 *  "Yes" to the "Responsibility to Sell?" gate (L) — no keyword guessing. */
const SELL_GATE_ID = "sell";

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const sectionDomId = (id: string) => `ev2-sec-${id}`;

export function EvaluationV2Screen({
  candidates,
  role,
  isSuperAdmin,
  fixedCandidateId,
}: {
  candidates: Candidate[];
  role: EvaluatorRole;
  isSuperAdmin: boolean;
  fixedCandidateId?: string;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  // Local, mutable copy so a deleted candidate drops out of the picker instantly.
  const [candList, setCandList] = React.useState<Candidate[]>(candidates);
  React.useEffect(() => setCandList(candidates), [candidates]);
  // Destructive-delete confirmation (super-admins only). Resolves the LookupSelect
  // confirmDelete promise via a ref so Cancel aborts silently.
  const [confirmCand, setConfirmCand] = React.useState<{ id: string; name: string } | null>(null);
  const confirmResolve = React.useRef<((go: boolean) => void) | null>(null);
  const [instance, setInstance] = React.useState<EvaluationInstance | null>(null);
  const [load, setLoad] = React.useState<EvaluationV2Load | null>(null);
  const [designation, setDesignation] = React.useState<string>("default");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [railCollapsed, setRailCollapsed] = React.useState(false);

  const cidRef = React.useRef(candidateId); cidRef.current = candidateId;
  const instRef = React.useRef(instance); instRef.current = instance;
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = candList.find((c) => c.id === candidateId) ?? null;

  const candidateLabel = React.useCallback(
    (c: Candidate) => `${c.fullName || "Unnamed"}${c.positionApplied ? ` · ${c.positionApplied}` : ""}`,
    [],
  );

  /** Opens the warning dialog and resolves true/false when the user chooses. */
  const requestDelete = React.useCallback(
    (id: string) =>
      new Promise<boolean>((resolve) => {
        const c = candList.find((x) => x.id === id);
        confirmResolve.current = resolve;
        setConfirmCand({ id, name: c ? candidateLabel(c) : "this candidate" });
      }),
    [candList, candidateLabel],
  );
  const closeConfirm = React.useCallback((go: boolean) => {
    const r = confirmResolve.current;
    confirmResolve.current = null;
    setConfirmCand(null);
    r?.(go);
  }, []);

  // Sales applicability is driven by the L "Responsibility to Sell?" gate answer,
  // not by keyword-matching the job title.
  const isSalesRole = instance?.gates?.[SELL_GATE_ID] === "yes";
  const ctx: ScoreContext = React.useMemo(() => ({ isSalesRole }), [isSalesRole]);

  /** Sections applicable to this candidate (drop the Sales Competency section unless
   *  "Responsibility to Sell?" is answered Yes). The gate (L) itself always shows. */
  const visibleSections = React.useMemo(
    () => EVAL_SECTIONS.filter((s) => !(s.salesOnly && !isSalesRole)),
    [isSalesRole],
  );

  const profile: WeightProfile = React.useMemo(() => {
    if (!load) return {};
    return load.profilesByDesignation[designation] ?? load.profilesByDesignation["default"] ?? {};
  }, [load, designation]);

  const saveNow = React.useCallback(async () => {
    const id = cidRef.current;
    const inst = instRef.current;
    if (!id || !inst) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaving(true);
    try {
      const res = await saveEvaluationV2(id, role, inst);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setDirty(false);
    } catch {
      fireToast({ message: "Couldn't save the evaluation — check your connection.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [role]);

  const scheduleSave = React.useCallback(() => {
    if (!cidRef.current || !instRef.current) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 800);
  }, [saveNow]);

  const patch = React.useCallback(
    (fn: (prev: EvaluationInstance) => EvaluationInstance) => {
      setInstance((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        instRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  async function selectCandidate(id: string) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setCandidateId(id); cidRef.current = id;
    setInstance(null); instRef.current = null;
    setLoad(null);
    setError(null);
    setDirty(false);
    setActiveId(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await getEvaluationV2(id, role);
      if (cidRef.current !== id) return;
      if (!res.ok) { setError(res.error); return; }
      setLoad(res.load);
      setInstance(res.load.instance); instRef.current = res.load.instance;
      setDesignation(res.load.suggestedDesignation || "default");
    } catch {
      if (cidRef.current === id) setError("Couldn't load this candidate's evaluation.");
    } finally {
      if (cidRef.current === id) setLoading(false);
    }
  }

  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  React.useEffect(() => {
    if (fixedCandidateId && fixedCandidateId !== cidRef.current) {
      void selectCandidate(fixedCandidateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedCandidateId]);

  // Scrollspy — highlight the section currently in view.
  React.useEffect(() => {
    if (!instance) return;
    const els = visibleSections
      .map((s) => document.getElementById(sectionDomId(s.id)))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id.replace("ev2-sec-", ""));
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [instance, visibleSections]);

  const onJump = React.useCallback((id: string) => {
    const el = document.getElementById(sectionDomId(id));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }, []);

  const ctrl: EvalController | null = React.useMemo(() => {
    if (!instance) return null;
    return {
      instance,
      profile,
      ctx,
      readOnly: false,
      setPassfail: (id, v: PassFail) => patch((p) => ({ ...p, passfail: { ...p.passfail, [id]: v } })),
      setRating: (id, v) =>
        patch((p) => {
          const ratings = { ...p.ratings };
          if (v <= 0) delete ratings[id];
          else ratings[id] = v;
          return { ...p, ratings, cantSay: p.cantSay.filter((x) => x !== id) };
        }),
      toggleCantSay: (id) =>
        patch((p) => ({
          ...p,
          cantSay: p.cantSay.includes(id) ? p.cantSay.filter((x) => x !== id) : [...p.cantSay, id],
        })),
      setNote: (id, v) => patch((p) => ({ ...p, notes: { ...p.notes, [id]: v } })),
      setSectionNote: (id, v) => patch((p) => ({ ...p, sectionNotes: { ...p.sectionNotes, [id]: v } })),
      setConfidence: (id, v) =>
        patch((p) => {
          const confidence = { ...(p.confidence ?? {}) };
          if (v === null) delete confidence[id];
          else confidence[id] = v;
          return { ...p, confidence };
        }),
      setPracticalTested: (id, v) =>
        patch((p) => ({ ...p, practicalTested: { ...(p.practicalTested ?? {}), [id]: v } })),
      setGate: (sectionId, v) => patch((p) => ({ ...p, gates: { ...(p.gates ?? {}), [sectionId]: v } })),
      setOverall: (v) => patch((p) => ({ ...p, overall: v })),
      setRecommendation: (v: RecommendationValue) => patch((p) => ({ ...p, recommendation: v })),
      acceptRecommendation: (v: RecommendationValue) =>
        patch((p) => ({ ...p, recommendation: v, recommendationOverride: null })),
      recordOverride: (event: OverrideEvent) =>
        patch((p) => ({
          ...p,
          recommendation: event.to,
          recommendationOverride: event,
          overrideHistory: [...(p.overrideHistory ?? []), event],
        })),
      setAiInsights: (insights: InterviewAiInsights | null) => patch((p) => ({ ...p, aiInsights: insights })),
      setTextbox: (id: TextboxId, v) => patch((p) => ({ ...p, textboxes: { ...p.textboxes, [id]: v } })),
    };
  }, [instance, profile, ctx, patch]);

  const roleLabel = role === "interviewer" ? "Interviewer" : "Management";
  // (overall / interviewScore / progress / donut readouts removed with the header
  // Progress bar + Overall dial — the gut-number block is the score readout now.)

  const tone = STATUS_TONE[selected?.status ?? "new"] ?? STATUS_TONE.new!;

  const printPdf = React.useCallback(() => window.print(), []);

  const shareWhatsApp = React.useCallback(() => {
    if (!instance || !selected) return;
    const comp = computeComposites(instance, profile, ctx);
    const elig = eligibilityVerdict(instance);
    const rec = RECOMMENDATIONS.find((r) => r.value === instance.recommendation)?.label ?? "—";
    const cards = comp.scorecard.filter((c) => c.score !== null);
    const lines = [
      `*${selected.fullName || "Candidate"} — Interview Intelligence*`,
      `Evaluator: ${roleLabel}`,
      `Interview Score: ${comp.interviewScore !== null ? `${comp.interviewScore}/100` : "—"}`,
      `Eligibility: ${
        elig.dealbreaker
          ? `⚠️ Flagged for review (${elig.criticalNoItems.length} critical)`
          : elig.answered === elig.total
            ? "All clear ✅"
            : `${elig.answered}/${elig.total} answered`
      }`,
      `Recommendation: ${rec}`,
      "",
      "*Scorecard*",
      ...cards.map((c) => `• ${c.label}: ${fmt(c.score!)}/10`),
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }, [instance, selected, profile, ctx, roleLabel]);

  return (
    <>
      <style>{CSS}</style>
      <PageShell width="standard" py={false} className="pt-5 pb-20">

        {/* Control + candidate-summary card — NOT sticky, so the Overall Progress
            donut belongs to this card and scrolls away with it (no floating). */}
        <div className="ev2-sticky ev2-fade mb-5 rounded-2xl border border-hairline bg-white/95 p-3.5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
          <div className="flex flex-wrap items-center gap-3.5">
            {!fixedCandidateId && (
              <div className="ev2-select-wrap min-w-[240px] flex-1">
                <label htmlFor="ev2-candidate" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  Candidate
                </label>
                <LookupSelect
                  label="candidate"
                  value={candidateId || null}
                  onChange={(id) => void selectCandidate(id ?? "")}
                  options={candList.map((c) => ({ id: c.id, name: candidateLabel(c) }))}
                  placeholder="— Select candidate —"
                  className="w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                  {...(isSuperAdmin
                    ? {
                        confirmDelete: (opt) => requestDelete(opt.id),
                        onDelete: async (id) => {
                          const res = await deleteCandidateIntake(id);
                          if (res.ok) {
                            setCandList((prev) => prev.filter((c) => c.id !== id));
                            if (cidRef.current === id) void selectCandidate("");
                          }
                          return res;
                        },
                      }
                    : {})}
                />
              </div>
            )}

            {load && (
              <div className="ev2-select-wrap min-w-[170px] shrink-0">
                <label htmlFor="ev2-designation" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  <Briefcase size={11} className="mr-1 inline-block align-[-1px]" />
                  Designation
                </label>
                <select
                  id="ev2-designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 pr-9 text-[13.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                  title="Chooses the weight profile used for every score"
                >
                  <option value="default">Default Profile</option>
                  {load.designations.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {candidateId && (
              <div className="flex shrink-0 items-center gap-3 self-end">
                {/* Autosaves on every change (scheduleSave, 800ms debounce) — the
                    manual Save button was redundant and has been removed (Sir). */}
                <SaveState saving={saving} dirty={dirty} loading={loading} />
              </div>
            )}
          </div>

          {selected && instance && (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-hairline pt-4">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-black text-white"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}
              >
                {initials(selected.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15.5px] font-black leading-tight text-ink-strong" style={{ fontFamily: DISPLAY }}>
                  {selected.fullName || "Unnamed"}
                </p>
                <p className="truncate text-[12.5px] font-medium text-ink-muted">
                  {selected.positionApplied || "Position not set"}
                  {isSalesRole && (
                    <span className="ml-2 inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "color-mix(in srgb, #2563eb 12%, white)", color: "#1d4ed8" }}>
                      Sales role
                    </span>
                  )}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>
              {/* Progress bar + Overall donut removed (Sir) — the gut-number +
                  computed-weighted block below is now the single score readout. */}
            </div>
          )}

          {isSuperAdmin && load && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
              <ShieldCheck size={12} /> Custom weight tuning is temporarily disabled — scoring uses the default section weights (pending the Department → Role → Designation mapping).
            </p>
          )}
        </div>

        {/* BODY STATES */}
        {!candidateId ? (
          <EmptyState />
        ) : loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void selectCandidate(candidateId)} />
        ) : instance && ctrl ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
            {/* Sticky rail (desktop) */}
            <aside className={`ev2-noprint max-lg:hidden ${railCollapsed ? "lg:w-[64px]" : ""}`}>
              <div className="ev2-rail-sticky sticky top-[80px] max-h-[calc(100vh-100px)] overflow-y-auto">
                <SectionRail
                  sections={visibleSections}
                  instance={instance}
                  ctx={ctx}
                  activeId={activeId}
                  onJump={onJump}
                  collapsed={railCollapsed}
                  onToggleCollapse={() => setRailCollapsed((c) => !c)}
                />
              </div>
            </aside>

            {/* Mobile section chip strip */}
            <div className="ev2-noprint lg:hidden -mt-1 overflow-x-auto">
              <div className="flex gap-2 pb-1">
                {visibleSections.map((s) => {
                  const st = sectionStatus(s, instance, ctx);
                  const active = activeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onJump(s.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold transition-colors"
                      style={
                        active
                          ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, color: "#fff" }
                          : { background: "#fff", color: "var(--color-ink-strong)", border: "1px solid var(--color-hairline-strong)" }
                      }
                    >
                      <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-black" style={active ? { background: "rgba(255,255,255,0.25)" } : { background: st.done ? "color-mix(in srgb,#16a34a 16%,white)" : "var(--color-surface-soft)", color: st.done ? "#15803d" : "var(--color-ink-muted)" }}>
                        {st.done ? <Check size={10} strokeWidth={3.5} /> : s.code}
                      </span>
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sections */}
            <div className="min-w-0 space-y-8">
              {visibleSections.map((s, i) => (
                <div key={s.id} id={sectionDomId(s.id)} className="ev2-fade scroll-mt-[150px]" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                  {renderSection(s, ctrl, instance, profile, ctx, candidateId, role)}
                </div>
              ))}

              {/* Share / export actions */}
              <div className="ev2-noprint ev2-fade flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={printPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                >
                  <Printer size={15} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={shareWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
                >
                  <Share2 size={15} /> Share on WhatsApp
                </button>
              </div>

              {/* Side-by-side comparison report */}
              <div className="ev2-fade">
                <EvaluationV2Report
                  interviewer={role === "interviewer" ? instance : load?.other ?? null}
                  management={role === "management" ? instance : load?.other ?? null}
                  profile={profile}
                  ctx={ctx}
                />
              </div>
            </div>
          </div>
        ) : null}
      </PageShell>

      {confirmCand &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev2-del-title"
            onClick={() => closeConfirm(false)}
          >
            <div
              className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3.5">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}
                >
                  <AlertTriangle size={22} strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <h2 id="ev2-del-title" className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
                    Delete this candidate?
                  </h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                    You&apos;re about to permanently delete{" "}
                    <span className="font-bold text-ink-strong">{confirmCand.name}</span>. Their entire record and
                    interview history — intake form, checklist and all evaluation scores — will be erased. This cannot be
                    undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => closeConfirm(false)}
                  className="rounded-lg border border-hairline bg-white px-4 py-2.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-surface-soft"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => closeConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition-colors"
                  style={{ background: RED }}
                >
                  <Trash2 size={14} strokeWidth={2.5} /> Delete Permanently
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Renders one section by its input kind, inside a titled shell. */
function renderSection(
  s: EvalSection,
  ctrl: EvalController,
  instance: EvaluationInstance,
  profile: WeightProfile,
  ctx: ScoreContext,
  candidateId: string,
  evalRole: EvaluatorRole,
): React.ReactNode {
  switch (s.input) {
    case "passfail":
      return (
        <SectionShell code={s.code} title={s.title}>
          <EligibilitySection ctrl={ctrl} />
        </SectionShell>
      );
    case "rating":
      return (
        <SectionShell code={s.code} title={s.title}>
          <RatingSection ctrl={ctrl} section={s} />
        </SectionShell>
      );
    case "gate":
      return (
        <SectionShell code={s.code} title={s.title}>
          <GateSection ctrl={ctrl} section={s} />
        </SectionShell>
      );
    case "sellgate":
      return (
        <SectionShell code={s.code} title={s.title}>
          <SellGateSection ctrl={ctrl} section={s} />
        </SectionShell>
      );
    case "overall":
      return (
        <SectionShell code={s.code} title={s.title}>
          <OverallSection ctrl={ctrl} instance={instance} profile={profile} ctx={ctx} candidateId={candidateId} evalRole={evalRole} />
        </SectionShell>
      );
    default:
      return null;
  }
}

function SaveState({ saving, dirty, loading }: { saving: boolean; dirty: boolean; loading: boolean }) {
  if (loading) return null;
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
      {saving ? (
        <><Loader2 size={13} className="animate-spin" style={{ color: RED }} /> Saving…</>
      ) : dirty ? (
        <><span className="inline-block h-2 w-2 rounded-full" style={{ background: RED }} /> Unsaved</>
      ) : (
        <><Check size={13} strokeWidth={3} style={{ color: "#15803d" }} /> Saved</>
      )}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="ev2-fade mt-2 grid place-items-center rounded-2xl border border-solid border-hairline-strong bg-white px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#E106001a", color: RED_DEEP }}>
        <UserRound size={26} strokeWidth={2.1} />
      </span>
      <h2 className="mt-3 text-ink-strong" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>
        Choose a candidate to begin
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] font-medium text-ink-muted">
        Pick someone above and the full instrument — pre-requisites, competency ratings and the composite
        recommendation — opens up, autosaving as you fill it.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-2 grid place-items-center rounded-2xl border border-hairline bg-white py-16 text-ink-muted">
      <Loader2 className="animate-spin" style={{ color: RED }} />
      <p className="mt-2 text-[13.5px] font-medium">Loading this candidate&apos;s evaluation…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-2 grid place-items-center rounded-2xl border px-6 py-12 text-center" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, white)", background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" }}>
      <span className="grid h-13 w-13 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}>
        <AlertTriangle size={24} />
      </span>
      <h2 className="mt-3 text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
        Couldn&apos;t load the evaluation
      </h2>
      <p className="mt-1 max-w-[44ch] text-[13.5px] font-medium text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-black"
      >
        Try again
      </button>
    </div>
  );
}

const CSS = `
  .ev2-fade { animation: ev2Fade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes ev2Fade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ev2-collapse { animation: ev2Collapse 0.32s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes ev2Collapse { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .ev2-select-wrap { position: relative; }
  .ev2-select-wrap > select { position: relative; }
  .ev2-select-wrap::after { content: ""; position: absolute; right: 14px; bottom: 16px; width: 8px; height: 8px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: rotate(45deg); pointer-events: none; }
  .ev2-rating:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, ${RED} 30%, transparent); }
  .ev2-rec-dot { animation: ev2Pulse 1.1s ease-in-out infinite; }
  @keyframes ev2Pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .ev2-fade, .ev2-collapse, .ev2-rec-dot { animation: none !important; }
    html { scroll-behavior: auto !important; }
  }
  @media print {
    .ev2-noprint, .ev2-sticky { display: none !important; }
  }
`;

export default EvaluationV2Screen;
