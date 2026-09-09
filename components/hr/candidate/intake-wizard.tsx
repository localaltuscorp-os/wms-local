"use client";

import * as React from "react";
import { useAutosave } from "@/components/hr/forms/use-autosave";
import { SaveIndicator } from "@/components/hr/forms/save-indicator";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { sectionsForMode, hasAnyContent, intakeProgress, sectionRequiredKeys, type IntakeSection, type IntakeMode } from "@/lib/hr/candidate/intake-schema";
import { saveCandidateDraft, submitCandidateDraft } from "@/app/(app)/hr/candidate-actions";

/**
 * The three writes the wizard performs, typed off the HR actions so the injected
 * candidate variants (owner-scoped, id-less) stay contract-compatible. Injected
 * so the candidate self-fill surface can swap in its owner-scoped variants —
 * default = the HR-gated actions.
 */
export interface IntakeActions {
  save: typeof saveCandidateDraft;
  submit: typeof submitCandidateDraft;
}

const HR_ACTIONS: IntakeActions = {
  save: saveCandidateDraft,
  submit: submitCandidateDraft,
};
import { fireToast } from "@/lib/toast";
import { IntakeRail } from "./intake-rail";
import { IntakeSectionStep } from "./intake-section-step";
import { IntakeReviewStep } from "./intake-review-step";

const RED = "var(--color-altus-red)";

/** Backup pointer to the in-flight draft, so a refresh can resume even if the
 *  URL somehow lost its ?draft=<id>. Cleared once the form is submitted. */
const DRAFT_LS_KEY = "altus:intake:draft";

/** Pin a freshly-created draft to the URL (so a refresh resumes it) + stash a
 *  localStorage backup pointer. Robust to being called before hydration. */
function pinDraftToUrl(id: string) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("draft") !== id) {
      url.searchParams.set("draft", id);
      url.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    /* replaceState can throw in sandboxed frames — the localStorage backup covers us. */
  }
  try {
    window.localStorage.setItem(DRAFT_LS_KEY, id);
  } catch {
    /* private-mode / storage-disabled — non-fatal. */
  }
}

export interface IntakeInitial {
  draftId?: string;
  values?: Record<string, string>;
  instances?: Record<string, string[]>;
  startAtReview?: boolean;
}

// All animation + the "large field" scoping as a STATIC stylesheet (no
// framer-motion — its barrel cold-compiles ~49s and hangs; no styled-jsx either).
// .iw-fields enlarges the reused FieldInput inputs without touching the shared
// component, and without stretching the pill toggle buttons.
const IW_CSS = `
@keyframes iwStepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.iw-step { animation: iwStepIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes iwRowIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.iw-row { animation: iwRowIn 0.25s ease-out both; }

/* ── Floating-label outlined fields (Candidate Interview Form only) ── */
.iwf { position: relative; --iwf-bd: color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline)); }
.iwf-control {
  width: 100%;
  min-height: 60px;
  border: 2px solid var(--iwf-bd);
  border-radius: 14px;
  background: #fff;
  padding: 16px 15px;
  font-size: 15.5px;
  line-height: 1.35;
  color: var(--color-ink-strong);
  outline: none;
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}
.iwf-control::placeholder { color: transparent; }
.iwf.is-float .iwf-control::placeholder { color: var(--color-ink-subtle); opacity: 1; }
.iwf-control:hover { border-color: color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline)); }
.iwf-control:focus {
  border-color: var(--color-altus-red);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 13%, transparent);
}
.iwf--area .iwf-control { min-height: 132px; padding-top: 26px; resize: vertical; line-height: 1.55; }
.iwf select.iwf-control { -webkit-appearance: none; appearance: none; cursor: pointer; padding-right: 42px; }
/* Searchable combobox trigger inside the floating box - value left, chevron right. */
.iwf .iwf-lookup { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; text-align: left; }
.iwf .iwf-lookup[aria-expanded="true"] { border-color: var(--color-altus-red); box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 13%, transparent); }
.iwf.is-readonly .iwf-control { background: var(--color-surface-soft, #f5f5f7); color: var(--color-ink-strong); cursor: default; }
.iwf-has-mic .iwf-control { padding-right: 40px; }
.iwf-mic {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 30px; height: 30px; display: grid; place-items: center;
  border: none; background: transparent; border-radius: 8px; cursor: pointer;
  color: var(--color-ink-muted); transition: color .15s, background .15s; z-index: 2;
}
.iwf-mic:hover { color: var(--color-ink-strong); background: var(--color-surface-soft); }
.iwf-mic--area { top: 12px; transform: none; }
.iwf-mic.is-rec { color: #fff; background: var(--color-altus-red); animation: iwf-mic-pulse 1.2s ease-in-out infinite; }
@keyframes iwf-mic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

.iwf-label {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  transform-origin: left center;
  padding: 0 6px;
  max-width: calc(100% - 26px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--color-ink-muted);
  font-size: 15.5px;
  font-weight: 500;
  pointer-events: none;
  background: transparent;
  transition: transform .2s cubic-bezier(.22,1,.36,1), color .18s ease, font-size .18s ease;
}
.iwf--area .iwf-label { top: 0; transform: translateY(25px); }
.iwf.is-float .iwf-label {
  top: 0;
  transform: translateY(-10px) scale(.82);
  color: var(--color-altus-red-deep);
  font-weight: 700;
  background: #fff;
}
.iwf.is-error .iwf-control { border-color: var(--color-altus-red); background: color-mix(in srgb, var(--color-altus-red) 4%, #fff); }
.iwf.is-error.is-float .iwf-label { color: var(--color-altus-red); }
.iwf-req { color: var(--color-altus-red); margin-left: 2px; }
.iwf-caret { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: var(--color-ink-soft); pointer-events: none; }

/* ── Inline chip radiogroup (Yes/No & small MCQs) ── */
.iwc { position: relative; border: 2px solid color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline)); border-radius: 14px; background: #fff; padding: 11px 14px 12px; transition: border-color .18s ease; }
.iwc:focus-within { border-color: color-mix(in srgb, var(--color-altus-red) 40%, var(--color-hairline)); }
.iwc.is-error { border-color: var(--color-altus-red); background: color-mix(in srgb, var(--color-altus-red) 4%, #fff); }
.iwc-legend { display: block; font-size: 12.5px; font-weight: 700; letter-spacing: .01em; color: var(--color-ink-muted); margin-bottom: 9px; }
.iwc.is-error .iwc-legend { color: var(--color-altus-red); }
.iwc-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.iwc-nowrap .iwc-opts { flex-wrap: nowrap; }
.iwc-nowrap .iwc-chip { white-space: nowrap; }
.iwc-chip {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px;
  padding: 8px 13px;
  font-size: 13.5px; font-weight: 700;
  border: 1.5px solid var(--color-hairline);
  background: #fff; color: var(--color-ink-soft);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .12s ease;
}
.iwc-chip:hover { border-color: color-mix(in srgb, var(--color-altus-red) 42%, var(--color-hairline)); color: var(--color-ink-strong); }
.iwc-chip.is-on { background: var(--color-altus-red); border-color: var(--color-altus-red); color: #fff; box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--color-altus-red) 85%, transparent); }
.iwc-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 32%, transparent); }
.iwc-chip:active { transform: translateY(1px); }

@keyframes iwRecPulse { 0% { box-shadow: 0 0 0 0 rgba(225,6,0,0.55); } 70% { box-shadow: 0 0 0 8px rgba(225,6,0,0); } 100% { box-shadow: 0 0 0 0 rgba(225,6,0,0); } }
.iw-rec-dot { animation: iwRecPulse 1.4s ease-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .iw-step, .iw-row, .iw-rec-dot { animation: none !important; }
  .iwf-label, .iwf-control, .iwc-chip, .iwc { transition: none !important; }
}
`;

type Vals = Record<string, string>;
type StepStatus = "active" | "done" | "error" | "idle";

export function IntakeWizard({
  onClose,
  onSaved,
  positions = [],
  departments = [],
  canManagePositions = false,
  initial,
  mode = "hr",
  actions = HR_ACTIONS,
}: {
  onClose: () => void;
  onSaved?: (id: string) => void;
  positions?: string[];
  departments?: string[];
  canManagePositions?: boolean;
  initial?: IntakeInitial;
  /** "candidate" hides recruiter-only fields + uses owner-scoped [actions]. */
  mode?: IntakeMode;
  actions?: IntakeActions;
}) {
  const sections = sectionsForMode(mode);
  const reviewStep = sections.length;

  const [step, setStep] = React.useState(initial?.startAtReview ? sections.length : 0);
  const [values, setValues] = React.useState<Vals>(() => initial?.values ?? {});
  // Repeater instances: sectionId -> array of stable uids (seeded for new forms,
  // restored for resumed drafts).
  const [instances, setInstances] = React.useState<Record<string, string[]>>(() => {
    if (initial?.instances && Object.keys(initial.instances).length) return initial.instances;
    const init: Record<string, string[]> = {};
    for (const s of sections) if (s.repeat) init[s.id] = Array.from({ length: Math.max(s.repeat.seed, s.repeat.min) }, (_, i) => `i${i}`);
    return init;
  });
  const [saving, setSaving] = React.useState(false);
  const [attempted, setAttempted] = React.useState<Set<string>>(new Set());
  // High base so freshly-added repeater uids never collide with a resumed draft's.
  const uidRef = React.useRef(100000);

  // ── Instant DB autosave (replaces the old global localStorage draft) ──
  const [recordId, setRecordId] = React.useState<string | null>(initial?.draftId ?? null);
  const recordIdRef = React.useRef<string | null>(initial?.draftId ?? null);
  const stateRef = React.useRef({ values, instances });
  stateRef.current = { values, instances };

  /**
   * ONE autosave, shared with every other HR form. Replaces a bespoke 1200ms
   * interval that polled a hand-maintained dirty flag and, on a failed write,
   * merely set that flag back and hoped the next tick did better — with nothing
   * on screen to say a save had failed.
   */
  const autosave = useAutosave({
    data: { values, instances },
    // Nothing typed yet is not a draft. Without this every visit to /hr/intake
    // would file an empty candidate.
    skip: (d) => !hasAnyContent(d.values),
    save: async (d) => {
      const res = await actions.save({
        id: recordIdRef.current ?? undefined,
        values: d.values,
        instances: d.instances,
      });
      if (!res.ok) return { ok: false, error: res.error };
      if (!recordIdRef.current) {
        recordIdRef.current = res.id;
        setRecordId(res.id);
        pinDraftToUrl(res.id);
      }
      return { ok: true };
    },
  });
  const flush = autosave.flush;

  // A resumed draft already has an id — keep the localStorage backup pointer in
  // sync so a later refresh still resolves even if the URL is stripped.
  React.useEffect(() => {
    if (initial?.draftId) pinDraftToUrl(initial.draftId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const set = React.useCallback((key: string, v: string) => {
    setValues((p) => ({ ...p, [key]: v }));
  }, []);

  // ── completion / progress ──
  // Every field is mandatory (see intake-schema.isRequiredField); a section's
  // required keys are derived live so showIf-hidden fields never count and each
  // repeater instance must be complete.
  /**
   * Required value-keys still empty in a section.
   *
   * THE SAVE BUG LIVED HERE (fixed 2026-08-20). This used to append
   * `__photo__` / `__sign__` markers whenever the Declaration uploads were
   * empty. Because `handleSubmit` refuses to run while ANY section reports a
   * missing key, a form with every field filled still bounced back to
   * Declaration with "Some required fields are still missing" and `submit()`
   * was never reached — the form simply could not be saved without uploading
   * two images. Both uploads are gone (Sir), so the markers go with them.
   */
  function missingKeys(s: IntakeSection): string[] {
    return sectionRequiredKeys(s, values, instances).filter((k) => (values[k] ?? "").trim() === "");
  }
  /**
   * A section reads "done" (green tick) ONLY when it actually has required work
   * AND none of it is missing — so a fresh, untouched section (repeaters with
   * empty instances, etc.) never shows complete. Declaration keeps its
   * `s.declaration ||` guard: it still has required fields of its own (date,
   * the confirmation button, and the recruiter name in HR mode).
   */
  function sectionComplete(s: IntakeSection): boolean {
    const hasRequirements = s.declaration || sectionRequiredKeys(s, values, instances).length > 0;
    return hasRequirements && missingKeys(s).length === 0;
  }
  const pct = intakeProgress(values, instances);

  function go(to: number) {
    setStep(Math.max(0, Math.min(reviewStep, to)));
    requestAnimationFrame(() => {
      // Land at the TOP of the new section, not wherever the autofocus target
      // happens to sit (Sir: opening a section dropped me into the middle).
      // Scroll to the step top first, then focus WITHOUT stealing the scroll.
      const stepEl = document.querySelector<HTMLElement>(".iw-step");
      stepEl?.scrollIntoView({ block: "start", behavior: "auto" });
      stepEl?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    });
  }
  function focusFirstInvalid() {
    document.querySelector<HTMLElement>('.iw-step [data-invalid="true"] input, .iw-step [data-invalid="true"] textarea, .iw-step [data-invalid="true"] select, .iw-step [data-invalid="true"] button')?.focus();
  }
  // Hard-block: Next only advances when the current section's required fields are filled.
  function handleNext() {
    const s = sections[step];
    if (!s) return go(step + 1);
    if (missingKeys(s).length > 0) {
      setAttempted((p) => new Set(p).add(s.id));
      fireToast({ message: "Please complete the required fields in this section.", type: "error" });
      requestAnimationFrame(focusFirstInvalid);
      return;
    }
    go(step + 1);
  }
  // Hard-block: Submit only fires when EVERY section is complete; else jump to the first gap.
  function handleSubmit() {
    const firstBad = sections.findIndex((s) => missingKeys(s).length > 0);
    if (firstBad >= 0) {
      setAttempted(new Set(sections.map((s) => s.id)));
      fireToast({ message: "Some required fields are still missing - jumping you there.", type: "error" });
      go(firstBad);
      requestAnimationFrame(focusFirstInvalid);
      return;
    }
    submit();
  }

  // ── repeater ops ──
  function addInstance(s: IntakeSection) {
    setInstances((p) => {
      const cur = p[s.id] ?? [];
      if (s.repeat && cur.length >= s.repeat.max) return p;
      return { ...p, [s.id]: [...cur, `u${uidRef.current++}`] };
    });
  }
  function removeInstance(sid: string, uid: string) {
    setInstances((p) => ({ ...p, [sid]: (p[sid] ?? []).filter((x) => x !== uid) }));
  }

  async function submit() {
    setSaving(true);
    try {
      // Land the latest answers through the SAME writer the autosave uses, then
      // submit that row. Saving separately here would make Submit a second,
      // competing writer of the same record — the class of race that produced
      // duplicate rows before the index gained its unique arbiter.
      const landed = await autosave.flush();
      const id = recordIdRef.current;
      if (!landed || !id) {
        fireToast({ message: "Could not save the candidate — try again.", type: "error" });
        return;
      }
      const done = await actions.submit(id);
      if (!done.ok) { fireToast({ message: done.error, type: "error" }); return; }
      // Form is complete — drop the backup pointer so a later "start new" is clean.
      try { window.localStorage.removeItem(DRAFT_LS_KEY); } catch { /* non-fatal */ }
      fireToast({ message: "Candidate saved." });
      onSaved?.(id);
    } finally {
      setSaving(false);
    }
  }

  const active = step < reviewStep ? sections[step] : null;

  // Rail steps: the 7 sections + the Review step, each with a computed status.
  const steps: { label: string; status: StepStatus }[] = [
    ...sections.map((s, i): { label: string; status: StepStatus } => ({
      label: s.title,
      status: i === step ? "active" : sectionComplete(s) ? "done" : attempted.has(s.id) ? "error" : "idle",
    })),
    { label: "Review & Submit", status: step === reviewStep ? "active" : "idle" },
  ];

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#faf9fb]">
      <style dangerouslySetInnerHTML={{ __html: IW_CSS }} />

      {/* header + progress */}
      <div className="flex items-center gap-4 border-b border-hairline bg-white px-6 py-3.5 max-md:px-4">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3.5 py-2 text-[13px] font-semibold text-ink-strong transition-colors hover:border-ink-soft max-md:px-2.5" aria-label="Back">
          <ArrowLeft size={16} strokeWidth={2.4} /> <span className="max-md:hidden">Back</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="Altus" className="h-5 w-auto" style={{ display: "block" }} />
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
              Candidate Interview Form
            </h2>
          </div>
          <div className="mt-2 h-1.5 w-full max-w-[460px] overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
            <div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${RED}, var(--color-altus-red-deep))`, width: `${pct}%`, transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)" }} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-[12.5px] font-bold text-ink-muted tabular-nums">{pct}% complete</span>
          {recordId && <span className="text-[11px] font-semibold" style={{ color: "#16a34a" }}>Auto-saved ✓</span>}
        </div>
      </div>

      {/* body: rail (desktop column + mobile strip) + step area */}
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <IntakeRail steps={steps} activeIndex={step} onSelect={go} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-10 py-10 max-md:px-4 max-md:py-6">
            {active && (
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold"
                style={{
                  color: "var(--color-altus-red-deep)",
                  background: "color-mix(in srgb, var(--color-altus-red) 8%, white)",
                  border: "1px solid color-mix(in srgb, var(--color-altus-red) 22%, white)",
                }}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-black text-white"
                  style={{ background: "var(--color-altus-red)" }}
                >
                  !
                </span>
                Every field is required.
              </div>
            )}
            <div key={step} className="iw-step">
              {active ? (
                <IntakeSectionStep
                  section={active}
                  values={values}
                  set={set}
                  instances={instances[active.id] ?? []}
                  onAdd={() => addInstance(active)}
                  onRemove={(uid) => removeInstance(active.id, uid)}
                  invalid={attempted.has(active.id) ? new Set(missingKeys(active)) : new Set<string>()}
                  positions={positions}
                  departments={departments}
                  canManagePositions={canManagePositions}
                />
              ) : (
                <IntakeReviewStep sections={sections} values={values} instances={instances} onEdit={go} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline bg-white px-6 py-3.5 max-md:px-4">
        <button onClick={() => go(step - 1)} disabled={step === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-ink-soft disabled:opacity-40">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-3 max-md:hidden">
          <span className="text-[12.5px] font-medium text-ink-subtle">Step {Math.min(step + 1, reviewStep + 1)} of {reviewStep + 1}</span>
          <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
        </div>
        {step < reviewStep ? (
          <button onClick={handleNext} className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black">
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? "Saving…" : "Save candidate"}
          </button>
        )}
      </div>
    </div>
  );
}
