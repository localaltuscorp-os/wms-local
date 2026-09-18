"use client";

import * as React from "react";
import {
  Loader2,
  Check,
  UserRound,
  UserPlus,
  X,
  AlertTriangle,
  Briefcase,
  ShieldCheck,
  Printer,
  Share2,
  Trash2,
  Link2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import { PageShell } from "@/components/layout/page-shell";
import { LookupSelect } from "@/components/ui/lookup-select";
import { deleteCandidateIntake, createQuickCandidate } from "@/app/(app)/hr/candidate-actions";
import {
  findCandidateMatch,
  mergeCandidateIntake,
  type IntakeMatch,
} from "@/app/(app)/hr/candidate-merge-actions";
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
  canMerge,
  fixedCandidateId,
}: {
  candidates: Candidate[];
  role: EvaluatorRole;
  isSuperAdmin: boolean;
  /** May fold a started interview form into this evaluation. False for narrow
   *  intake grantees, who can still SEE the banner and open the form — merging
   *  is a write to two candidate records and is `requireHrStaff` on the server. */
  canMerge: boolean;
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
  // "Add candidate" — pre-create a candidate by name (+ optional phone) so an
  // evaluation can start before they have filled the full interview form.
  const [addOpen, setAddOpen] = React.useState(false);
  // Two fields, joined into the one `full_name` column on submit — see the
  // dialog's own note on why they are split.
  const [addFirst, setAddFirst] = React.useState("");
  const [addLast, setAddLast] = React.useState("");
  const [addPhone, setAddPhone] = React.useState("");
  const [addBusy, setAddBusy] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  /* ── "The number I attached has started filling the form" ────────────────
     `mergeMatch` is what `findCandidateMatch` last said about the SELECTED
     candidate. It is fetched per selection rather than pre-loaded for the whole
     roster: the answer changes mid-session (the candidate submits while this
     screen is open), and a page prop could not be re-asked. */
  const [mergeMatch, setMergeMatch] = React.useState<{
    aHasForm: boolean;
    aMobile: string | null;
    matches: IntakeMatch[];
  } | null>(null);
  /** The row pending confirmation in the merge dialog. */
  const [mergeTarget, setMergeTarget] = React.useState<IntakeMatch | null>(null);
  const [mergeBusy, setMergeBusy] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);
  /** The MANUAL path — for when the phone does not match, which is the whole
   *  reason it exists. */
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkQuery, setLinkQuery] = React.useState("");

  /** First + last, joined the way a single "Full name" box would have produced
   *  it — `full_name` is one column, and the letters, the candidate list and the
   *  merge dialog all print it verbatim. */
  const addFullName = [addFirst, addLast].map((s) => s.trim()).filter(Boolean).join(" ");

  async function submitNewCandidate() {
    setAddBusy(true);
    setAddError(null);
    const res = await createQuickCandidate({ name: addFullName, phone: addPhone });
    setAddBusy(false);
    if (!res.ok) {
      setAddError(res.error);
      return;
    }
    // Add to the local list (if it isn't already there) and select it. On a
    // `reused` result the row already exists — with the name it already had,
    // which is the point of reusing it — so the local entry must not overwrite
    // that with what was just typed.
    setCandList((prev) => {
      if (prev.some((c) => c.id === res.id)) return prev;
      return [...prev, { id: res.id, fullName: addFullName }];
    });
    setAddOpen(false);
    setAddFirst("");
    setAddLast("");
    setAddPhone("");
    void selectCandidate(res.id);
  }

  // Used after a merge: the retired row has to disappear from the SERVER-rendered
  // candidate list too, or the props-sync effect puts it back.
  const router = useRouter();
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
      fireToast({ message: "Couldn't save the evaluation - check your connection.", type: "error" });
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
    setMergeMatch(null);
    try {
      // IN PARALLEL, so the match costs no perceived latency. A failure here is
      // swallowed to null: the banner is an offer, and losing it must never stop
      // the evaluation itself from opening.
      const [res, match] = await Promise.all([
        getEvaluationV2(id, role),
        findCandidateMatch(id).catch(() => null),
      ]);
      if (cidRef.current !== id) return;
      if (!res.ok) { setError(res.error); return; }
      setLoad(res.load);
      setInstance(res.load.instance); instRef.current = res.load.instance;
      setDesignation(res.load.suggestedDesignation || "default");
      setMergeMatch(match?.ok ? { aHasForm: match.aHasForm, aMobile: match.aMobile, matches: match.matches } : null);
    } catch {
      if (cidRef.current === id) setError("Couldn't load this candidate's evaluation.");
    } finally {
      if (cidRef.current === id) setLoading(false);
    }
  }

  /**
   * FOLD THE STARTED FORM INTO THIS EVALUATION.
   *
   * The order of the first two steps is load-bearing. A pending debounced
   * autosave MUST be flushed before the merge, or it would fire afterwards
   * against the retired placeholder and silently diverge it from the survivor —
   * the exact failure this feature exists to prevent.
   *
   * Afterwards the screen switches to the survivor: the placeholder is retired,
   * so staying on it would show a record no picker lists any more. That reload
   * is also what makes the moved assessment visible on the record that now owns
   * it.
   */
  async function doMerge(target: IntakeMatch) {
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      await saveNow();

      const res = await mergeCandidateIntake({ retiredId: candidateId, survivorId: target.id });
      if (!res.ok) { setMergeError(res.error); return; }

      const retiredId = candidateId;
      setMergeTarget(null);
      setMergeMatch(null);
      await selectCandidate(res.survivorId);
      // Drop the retired row locally, then refresh so the server's list — which
      // now excludes it — agrees. Without both, the props-sync effect restores it.
      setCandList((prev) => prev.filter((c) => c.id !== retiredId));
      router.refresh();
      fireToast({
        message:
          `Merged into ${res.survivorName || "the candidate"}. Their evaluation is on that record now.` +
          (res.skipped.length ? ` Kept the existing ${res.skipped.join(", ")}.` : ""),
        type: "success",
      });
    } catch {
      setMergeError("Couldn't merge these records.");
    } finally {
      setMergeBusy(false);
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
    const rec = RECOMMENDATIONS.find((r) => r.value === instance.recommendation)?.label ?? "-";
    const cards = comp.scorecard.filter((c) => c.score !== null);
    const lines = [
      `*${selected.fullName || "Candidate"} - Interview Intelligence*`,
      `Evaluator: ${roleLabel}`,
      `Interview Score: ${comp.interviewScore !== null ? `${comp.interviewScore}/100` : "-"}`,
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
                  placeholder="- Select candidate -"
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

            {!fixedCandidateId && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 self-end rounded-xl border border-dashed border-hairline-strong bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
              >
                <UserPlus size={15} strokeWidth={2.4} aria-hidden /> New candidate
              </button>
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

          {/* ── "THE NUMBER I ATTACHED HAS STARTED FILLING THE FORM" ──────────
              This is the whole point of attaching a number to a quick
              candidate: HR can see that the person they evaluated has begun
              their own interview form, and fold the two records into one —
              the candidate's details and the interviewer's assessment on a
              single row, which is what the owner asked to be able to read.

              Offered, never automatic. The person who filled the form writes
              the correct name; a placeholder holds whatever was typed in a
              hurry. Merging keeps THEIR row. */}
          {canMerge && selected && mergeMatch && mergeMatch.matches.length > 0 && (
            <div
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3"
              style={{
                background: "color-mix(in srgb, #2563eb 5%, white)",
                borderColor: "color-mix(in srgb, #2563eb 22%, transparent)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink-strong">
                  {mergeMatch.aMobile
                    ? `${mergeMatch.aMobile} has started the interview form`
                    : "This number has started the interview form"}
                  {" — "}
                  {mergeMatch.matches[0]!.fullName || "Unnamed"}
                  {mergeMatch.matches[0]!.pct > 0 && (
                    <span className="font-medium text-ink-muted">
                      {" "}
                      ({mergeMatch.matches[0]!.pct}% filled
                      {mergeMatch.matches[0]!.submitted ? ", submitted" : ", in progress"})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11.5px] font-medium text-ink-muted">
                  Merging moves this evaluation onto their record and keeps their name.
                  Nothing is deleted.
                </p>
              </div>
              <a
                href={`/hr/intake?draft=${mergeMatch.matches[0]!.id}`}
                className="shrink-0 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[12px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
              >
                View form
              </a>
              <button
                type="button"
                onClick={() => { setMergeError(null); setMergeTarget(mergeMatch.matches[0]!); }}
                className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold text-white transition-transform hover:-translate-y-px"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
              >
                Merge their details
              </button>
              {mergeMatch.matches.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setLinkQuery(""); setLinkOpen(true); }}
                  className="shrink-0 text-[11.5px] font-bold text-altus-red underline-offset-2 hover:underline"
                >
                  {mergeMatch.matches.length - 1} more match
                  {mergeMatch.matches.length - 1 === 1 ? "" : "es"} — choose
                </button>
              )}
            </div>
          )}

          {/* The MANUAL path, for when the number does not match — a different
              number on the form, or one typed differently enough to miss. */}
          {canMerge && selected && instance && (
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => { setLinkQuery(""); setLinkOpen(true); }}
                className="text-[11.5px] font-semibold text-ink-muted underline-offset-2 hover:text-altus-red hover:underline"
              >
                Can&apos;t find it? Link an interview form manually
              </button>
            </div>
          )}

          {isSuperAdmin && load && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
              <ShieldCheck size={12} /> Custom weight tuning is temporarily disabled - scoring uses the default section weights (pending the Department → Role → Designation mapping).
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
                    interview history - intake form, checklist and all evaluation scores - will be erased. This cannot be
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

      {addOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev2-add-title"
            onClick={() => setAddOpen(false)}
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
                  <UserPlus size={22} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="ev2-add-title" className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
                    New candidate
                  </h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                    Start an evaluation before they fill the interview form. If they later
                    fill it under the same phone number, the two records fold together.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  aria-label="Close"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>

              <div className="space-y-3">
                {/* FIRST + LAST, not one "Full name" box.
                    Two reasons this matters rather than being cosmetic: the
                    placeholder has to be RECOGNISABLE as the same person once
                    their own form arrives (a merged record keeps the
                    candidate's name, so a half-typed one is thrown away), and
                    `candidate_intake.full_name` is a single column the letters
                    and the candidate list both read — so the two parts are
                    joined on the way in, and the stored value is exactly what
                    a single box would have produced. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ev2-add-first" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                      First name
                    </label>
                    <input
                      id="ev2-add-first"
                      value={addFirst}
                      onChange={(e) => setAddFirst(e.target.value)}
                      autoFocus
                      autoComplete="off"
                      placeholder="e.g. Priya"
                      className="w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
                    />
                  </div>
                  <div>
                    <label htmlFor="ev2-add-last" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                      Last name
                    </label>
                    <input
                      id="ev2-add-last"
                      value={addLast}
                      onChange={(e) => setAddLast(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitNewCandidate();
                      }}
                      autoComplete="off"
                      // OPTIONAL, deliberately. Not everyone has two names, and
                      // a required box would either block them or teach people
                      // to type a placeholder into it.
                      placeholder="e.g. Sharma"
                      className="w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ev2-add-phone" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                    Phone number <span className="normal-case font-medium text-ink-subtle">(optional — used to link their form later)</span>
                  </label>
                  <input
                    id="ev2-add-phone"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitNewCandidate();
                    }}
                    placeholder="e.g. 98XXXXXXXX"
                    className="w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
                  />
                </div>
                {addError && (
                  <p className="text-[12.5px] font-semibold text-altus-red">{addError}</p>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg border border-hairline bg-white px-4 py-2.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-surface-soft"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitNewCandidate()}
                  disabled={addBusy || !addFullName}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {addBusy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} strokeWidth={2.5} />}
                  Add candidate
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── MERGE CONFIRMATION ─────────────────────────────────────────────
          Explicit about which row survives and that nothing is destroyed,
          because "merge" reads as destructive to anyone who has been burnt by
          one. The two records are NOT symmetric and the copy says so. */}
      {mergeTarget &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev2-merge-title"
            onClick={() => { if (!mergeBusy) { setMergeTarget(null); setMergeError(null); } }}
          >
            <div
              className="w-full max-w-[470px] rounded-2xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3.5">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}
                >
                  <Link2 size={22} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="ev2-merge-title" className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
                    Merge this into {mergeTarget.fullName || "the candidate"}
                  </h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                    The evaluation you have filled in moves onto{" "}
                    <strong className="text-ink-strong">{mergeTarget.fullName || "their record"}</strong>
                    , and the name becomes theirs — they typed it themselves.
                    {" "}
                    <strong className="text-ink-strong">
                      {selected?.fullName || "This record"}
                    </strong>{" "}
                    then disappears from every candidate list.
                  </p>
                  <p className="mt-2 text-[12.5px] font-semibold leading-relaxed text-ink-soft">
                    Nothing is deleted. Their form answers stay theirs, and this can be undone.
                  </p>
                  {mergeMatch?.aHasForm && (
                    <p
                      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] font-medium"
                      style={{ background: "color-mix(in srgb, #d97706 9%, white)", color: "#92400e" }}
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        This record has form answers of its own. They stay on it and will no
                        longer be shown — the candidate&apos;s own form is the one that is kept.
                      </span>
                    </p>
                  )}
                  {mergeError && (
                    <p className="mt-3 text-[12.5px] font-semibold text-altus-red">{mergeError}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={mergeBusy}
                  onClick={() => { setMergeTarget(null); setMergeError(null); }}
                  className="rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-ink-subtle disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={mergeBusy}
                  onClick={() => void doMerge(mergeTarget)}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:-translate-y-px disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  {mergeBusy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                  {mergeBusy ? "Merging…" : "Merge"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── MANUAL LINK PICKER ───────────────────────────────────────────────
          The path for a number that does not match. Options come from `candList`
          — already loaded — so this costs no round trip, and the list is the
          same one the picker above shows. */}
      {linkOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] grid place-items-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev2-link-title"
            onClick={() => setLinkOpen(false)}
          >
            <div
              className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3">
                <h2 id="ev2-link-title" className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
                  Link an interview form
                </h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                  Pick the candidate who filled the form. Their record is the one that is
                  kept, and this evaluation moves onto it.
                </p>
              </div>
              <input
                autoFocus
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search by name or number…"
                className="mb-3 w-full rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
              />
              <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-hairline">
                {(() => {
                  const q = linkQuery.trim().toLowerCase();
                  const options = candList.filter((c) => {
                    if (c.id === candidateId) return false;
                    if (!q) return true;
                    return (
                      (c.fullName ?? "").toLowerCase().includes(q) ||
                      (c.positionApplied ?? "").toLowerCase().includes(q)
                    );
                  });
                  if (options.length === 0) {
                    return (
                      <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
                        No other candidates match. If they have not filled any part of the
                        form yet, there is nothing to link to.
                      </p>
                    );
                  }
                  return options.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setLinkOpen(false);
                        setMergeError(null);
                        setMergeTarget({
                          id: c.id,
                          fullName: c.fullName,
                          positionApplied: c.positionApplied ?? null,
                          mobile: null,
                          submitted: false,
                          pct: 0,
                          updatedAt: new Date(),
                        });
                      }}
                      className="block w-full border-b border-hairline px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--color-altus-red)_5%,white)]"
                    >
                      <span className="block text-[13.5px] font-bold text-ink-strong">
                        {c.fullName || "Unnamed"}
                      </span>
                      {c.positionApplied && (
                        <span className="block text-[11.5px] font-medium text-ink-muted">
                          {c.positionApplied}
                        </span>
                      )}
                    </button>
                  ));
                })()}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLinkOpen(false)}
                  className="rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-ink-subtle"
                >
                  Cancel
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
        Pick someone above and the full instrument - pre-requisites, competency ratings and the composite
        recommendation - opens up, autosaving as you fill it.
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
  /* :has(> select) so this caret is painted ONLY for a native <select>.
     The Candidate field is a LookupSelect, which renders its own chevron -
     unscoped, this rule stacked a second arrow on top of it. */
  .ev2-select-wrap:has(> select)::after { content: ""; position: absolute; right: 14px; bottom: 16px; width: 8px; height: 8px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: rotate(45deg); pointer-events: none; }
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
