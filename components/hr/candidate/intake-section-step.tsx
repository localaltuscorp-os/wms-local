"use client";

import * as React from "react";
import { Plus, X, Search, Loader2, Mic } from "lucide-react";
import { visibleFields, type FormFieldDef } from "@/lib/forms/field-types";
import { vkey, ageFromDob, expFromRange, monthlyFromCtc, type IntakeSection } from "@/lib/hr/candidate/intake-schema";
import { splitAddress } from "@/lib/hr/candidate/aadhaar-kyc";
import { fireToast } from "@/lib/toast";
import { IntakePositionSelect } from "@/components/hr/candidate/intake-position-select";
import { IntakeField, IntakeReadonlyField } from "@/components/hr/candidate/intake-field";

/**
 * Resolve a `compute` field's value from its sibling inputs. `prefix` is the
 * value-key prefix — `${sectionId}` for flat sections, `${sectionId}.${uid}` for
 * one repeater instance — so the same computes work in both places.
 */
function computeValue(id: NonNullable<FormFieldDef["compute"]>, prefix: string, values: Record<string, string>): string {
  switch (id) {
    case "ageFromDob":
      return ageFromDob(values[`${prefix}.dob`] ?? "");
    case "expFromRange":
      return expFromRange(values[`${prefix}.from`] ?? "", values[`${prefix}.to`] ?? "");
    case "monthlyFromCtc":
      return monthlyFromCtc(values[`${prefix}.fixedSalary`] ?? "", values[`${prefix}.bonus`] ?? "");
    default:
      return "";
  }
}

const DISPLAY_FONT = "var(--font-display), system-ui, sans-serif";

export function IntakeSectionStep({
  section,
  values,
  set,
  instances,
  onAdd,
  onRemove,
  invalid,
  positions,
  departments,
  canManagePositions,
}: {
  section: IntakeSection;
  values: Record<string, string>;
  set: (k: string, v: string) => void;
  instances: string[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
  invalid: Set<string>;
  positions: string[];
  departments: string[];
  canManagePositions: boolean;
}) {
  const RequiredMsg = () => (
    <p className="mt-1.5 text-[12px] font-semibold text-altus-red">This field is required.</p>
  );

  // Non-repeat fields honour showIf (e.g. Home Loan vs Monthly Rent). Build a
  // per-section {fieldKey: value} view for the visibility check.
  const sectionView: Record<string, string> = {};
  for (const f of section.fields) sectionView[f.key] = values[vkey(section.id, f.key)] ?? "";
  const nonRepeatVisible = visibleFields(section.fields, sectionView);

  /** Render the control for one non-repeat field (handles the special types). */
  function renderControl(f: FormFieldDef, k: string, autoFocus: boolean, err: boolean) {
    if (f.compute) {
      return (
        <ComputeField
          label={f.label}
          computed={computeValue(f.compute, section.id, values)}
          value={values[k] ?? ""}
          onCompute={(v) => set(k, v)}
        />
      );
    }
    if (f.optionsFrom === "positions") {
      return <IntakePositionSelect value={values[k] ?? ""} onChange={(v) => set(k, v)} seed={positions} canManage={canManagePositions} autoFocus={autoFocus} error={err} />;
    }
    if (f.optionsFrom === "departments") {
      return <IntakeField field={f} options={departments} value={values[k] ?? ""} onChange={(_, v) => set(k, v)} autoFocus={autoFocus} error={err} />;
    }
    if (f.aadhaarLookup) {
      return (
        <AadhaarField
          field={f}
          value={values[k] ?? ""}
          autoFocus={autoFocus}
          error={err}
          onChange={(v) => set(k, v)}
          onFill={(filled) => {
            if (filled.name) set(vkey(section.id, "fullName"), filled.name);
            if (filled.dob) set(vkey(section.id, "dob"), filled.dob);
            if (filled.gender) set(vkey(section.id, "gender"), filled.gender);
            if (filled.mobile) set(vkey(section.id, "mobile"), filled.mobile);
            // Aadhaar returns one flat address line — split it into the structured
            // address fields (the full string always lands in Line 1 as a fallback).
            if (filled.location) {
              const a = splitAddress(filled.location);
              if (a.addressLine1) set(vkey(section.id, "addressLine1"), a.addressLine1);
              if (a.addressLine2) set(vkey(section.id, "addressLine2"), a.addressLine2);
              if (a.city) set(vkey(section.id, "city"), a.city);
              if (a.state) set(vkey(section.id, "state"), a.state);
              if (a.pincode) set(vkey(section.id, "pincode"), a.pincode);
            }
          }}
        />
      );
    }
    return <IntakeField field={f} value={values[k] ?? ""} onChange={(_, v) => set(k, v)} autoFocus={autoFocus} error={err} />;
  }

  return (
    <div>
      <h3
        className="text-ink-strong"
        style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.1 }}
      >
        {section.title}
      </h3>
      {section.subtitle && <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{section.subtitle}</p>}

      {/* Declaration statement.
          The Passport-size Photograph and Candidate's Signature upload tiles
          (and the selfie capture beside them) were REMOVED on 2026-08-20 (Sir):
          nothing is uploaded on this form any more. They were also the cause of
          the "form won't save" bug — both counted as required, so a fully
          completed form could never be submitted. See missingKeys() in
          intake-wizard.tsx. */}
      {section.declaration && <DeclarationStatement />}

      {/* Notes + Dictate section (final step) */}
      {section.notes ? (
        <NotesSection
          value={values[vkey(section.id, "notes")] ?? ""}
          onChange={(v) => set(vkey(section.id, "notes"), v)}
          error={invalid.has(vkey(section.id, "notes"))}
        />
      ) : /* Repeater sections */
      section.repeat ? (
        <div className="mt-8 space-y-5">
          {instances.map((uid, idx) => (
            <div
              key={uid}
              className="iw-row overflow-hidden rounded-2xl border border-hairline bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:p-5"
            >
              <div className="mb-5 flex items-center justify-between border-b border-hairline pb-3">
                <span className="inline-flex items-center gap-2.5">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black text-white"
                    style={{ background: "var(--color-altus-red)" }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[14px] font-bold uppercase tracking-wide text-ink-soft">
                    {section.repeat!.itemLabel} {idx + 1}
                  </span>
                </span>
                {instances.length > section.repeat!.min && (
                  <button
                    onClick={() => onRemove(uid)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-altus-red/10 hover:text-altus-red"
                    aria-label="Remove"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-12">
                {(() => {
                  // Per-instance {fieldKey: value} view so showIf gates correctly
                  // within this row (e.g. computed fields depend on siblings).
                  const view: Record<string, string> = {};
                  for (const f of section.fields) view[f.key] = values[`${section.id}.${uid}.${f.key}`] ?? "";
                  return visibleFields(section.fields, view).map((f) => {
                    const k = `${section.id}.${uid}.${f.key}`;
                    const err = invalid.has(k);
                    const span = fieldSpan(f);
                    return (
                      <div key={f.key} data-invalid={err ? "true" : undefined} className={span}>
                        {f.compute ? (
                          <ComputeField
                            label={f.label}
                            computed={computeValue(f.compute, `${section.id}.${uid}`, values)}
                            value={values[k] ?? ""}
                            onCompute={(v) => set(k, v)}
                          />
                        ) : (
                          <IntakeField
                            field={f}
                            value={values[k] ?? ""}
                            onChange={(_, v) => set(k, v)}
                            error={err}
                          />
                        )}
                        {err && <RequiredMsg />}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ))}
          {section.repeat.max > instances.length && (
            <button
              onClick={onAdd}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-solid border-hairline-strong py-4 text-[14px] font-bold text-ink-muted transition-colors hover:border-altus-red hover:text-altus-red"
            >
              <Plus size={17} /> Add Another {section.repeat.itemLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-12">
          {(() => {
            const out: React.ReactNode[] = [];
            let lastGroup: string | undefined;
            nonRepeatVisible.forEach((f, i) => {
              // Full-width sub-heading before the first field of a new group run.
              if (f.groupLabel && f.groupLabel !== lastGroup) {
                out.push(
                  <div key={`grp-${f.groupLabel}`} className="md:col-span-12">
                    <h4 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">{f.groupLabel}</h4>
                    <div className="mt-2 h-px w-full bg-hairline" />
                  </div>,
                );
              }
              lastGroup = f.groupLabel;
              const k = vkey(section.id, f.key);
              const err = invalid.has(k);
              out.push(
                <div key={f.key} data-invalid={err ? "true" : undefined} className={fieldSpan(f)}>
                  {renderControl(f, k, i === 0, err)}
                  {err && <RequiredMsg />}
                </div>,
              );
            });
            return out;
          })()}
        </div>
      )}
    </div>
  );
}

/** 12-column grid width. Explicit `span` wins; else a sensible default so fields
 *  pack onto one line (three span-4 fields fill a row). Literal classes so
 *  Tailwind's scanner keeps them. */
const SPAN12: Record<number, string> = {
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  12: "md:col-span-12",
};
function fieldSpan(f: FormFieldDef): string {
  if (f.span && SPAN12[f.span]) return SPAN12[f.span]!;
  // Even, aligned layout (Sir): full-width for long inputs, otherwise a clean
  // two-per-row grid. (Was a ragged mix of span-4/8 that left uneven trailing rows.)
  if (f.type === "textarea") return "md:col-span-12";
  if (f.aadhaarLookup) return "md:col-span-12";
  if (f.type === "buttons" && (f.options?.length ?? 0) > 3) return "md:col-span-12";
  return "md:col-span-6";
}

/**
 * Read-only field for any `compute` value (auto-Age, Total Experience, Monthly
 * Salary). Renders the derived value and writes it back into the wizard state so
 * it persists / counts toward progress — same self-syncing pattern as the old
 * AgeField, now generic over the compute id.
 */
function ComputeField({ label, computed, value, onCompute }: { label: string; computed: string; value: string; onCompute: (v: string) => void }) {
  React.useEffect(() => {
    if (computed !== value) onCompute(computed);
  }, [computed, value, onCompute]);
  return <IntakeReadonlyField label={label} value={computed} />;
}

/** Short declaration statement shown above the confirmation chip in the sign-off step. */
function DeclarationStatement() {
  return (
    <div className="mt-6 rounded-2xl border border-hairline bg-[color-mix(in_srgb,var(--color-altus-red)_3%,white)] p-5 text-[13.5px] leading-relaxed text-ink-muted">
      <span className="font-bold text-ink-strong">Declaration.</span>{" "}
      I hereby declare that the information furnished in this form is true, complete and
      correct to the best of my knowledge and belief. I understand that any information
      found false or incorrect may result in the rejection of my candidature or, if
      already engaged, termination of my services at any stage.
    </div>
  );
}

/** Fields the Aadhaar lookup can auto-fill back into the Personal section. */
type AadhaarFill = {
  name?: string;
  dob?: string;
  gender?: string;
  mobile?: string;
  location?: string;
};

/** Aadhaar number input + a "Fetch" button that auto-fills verified demographics. */
function AadhaarField({
  field,
  value,
  onChange,
  onFill,
  autoFocus,
  error,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (v: string) => void;
  onFill: (fields: AadhaarFill) => void;
  autoFocus?: boolean;
  error?: boolean;
}) {
  const id = React.useId();
  const [busy, setBusy] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const float = focused || (value ?? "").trim() !== "";

  async function fetchDetails() {
    const a = value.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(a)) {
      fireToast({ message: "Enter a valid 12-digit Aadhaar number.", type: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/hr/aadhaar-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aadhaar: a }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configured?: boolean;
        found?: boolean;
        message?: string;
        fields?: AadhaarFill;
      };
      if (!data.ok) { fireToast({ message: data.error ?? "Lookup failed.", type: "error" }); return; }
      if (!data.configured || !data.found) { fireToast({ message: data.message ?? "Enter the details manually." }); return; }
      onFill(data.fields ?? {});
      const count = Object.values(data.fields ?? {}).filter((v) => (v ?? "").trim() !== "").length;
      fireToast({ message: count > 0 ? `Auto-filled ${count} field${count === 1 ? "" : "s"} from Aadhaar.` : "No details found for this Aadhaar." });
    } catch {
      fireToast({ message: "Aadhaar lookup failed — enter details manually.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-stretch gap-2.5">
      <div className={`iwf min-w-0 flex-1${float ? " is-float" : ""}${error ? " is-error" : ""}`}>
        <input
          id={id}
          name={id}
          autoComplete="off"
          inputMode="numeric"
          value={value}
          data-autofocus={autoFocus || undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? " "}
          maxLength={14}
          className="iwf-control"
        />
        <label htmlFor={id} className="iwf-label">
          {field.label}
          <span className="iwf-req" aria-hidden>*</span>
        </label>
      </div>
      <button
        type="button"
        onClick={fetchDetails}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 self-stretch rounded-[14px] border-2 border-hairline-strong bg-white px-4 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} strokeWidth={2.4} />} Fetch
      </button>
    </div>
  );
}

/* Minimal Web Speech API surface — the DOM lib doesn't ship these types. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Free-form interview Notes with a browser speech-to-text "Dictate" button.
 * Recognized speech is live-appended to the notes field; interim words preview
 * below the box. Falls back to a disabled, tooltip-explained button when the
 * Web Speech API is unavailable. Value flows through the wizard's normal
 * autosave/draft pipeline (no separate storage).
 */
function NotesSection({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  const [recording, setRecording] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  // Latest value in a ref so the recognition callback always appends to fresh text.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // The whole wizard mounts client-only (dynamic ssr:false), so window is present
  // at init — resolve Web Speech API support once, lazily, with no extra render.
  const [supported] = React.useState(() => getSpeechRecognitionCtor() != null);

  const stop = React.useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    recRef.current = null;
    setRecording(false);
    setInterim("");
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      fireToast({ message: "Dictation isn't supported in this browser — use Chrome or Edge.", type: "error" });
      return;
    }
    // The Web Speech API only runs on a SECURE origin. localhost counts; the LAN
    // IP (http://192.168.x.x) does NOT — the browser silently refuses the mic.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      fireToast({
        message: "Open the app at http://localhost:3000 to dictate — the microphone is blocked on the network IP (insecure page).",
        type: "error",
      });
      return;
    }
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      fireToast({ message: "Couldn't start dictation.", type: "error" });
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-IN";
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText.trim()) {
        const base = valueRef.current;
        const sep = base && !/\s$/.test(base) ? " " : "";
        const next = `${base}${sep}${finalText.trim()}`;
        valueRef.current = next;
        onChange(next);
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      const code = e?.error ?? "";
      if (code !== "no-speech" && code !== "aborted") {
        fireToast({
          message:
            code === "not-allowed" || code === "service-not-allowed"
              ? "Microphone is blocked. Click the mic/lock icon in the address bar → allow the microphone for this site → try again."
              : code === "audio-capture"
                ? "No microphone detected. Enable a mic and try again."
                : code === "network"
                  ? "Dictation needs an internet connection (it uses the browser's online speech service)."
                  : "Dictation couldn't run. Please try again.",
          type: "error",
        });
      }
      stop();
    };
    rec.onend = () => { setRecording(false); setInterim(""); recRef.current = null; };
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      fireToast({ message: "Couldn't access the microphone.", type: "error" });
      recRef.current = null;
    }
  }, [onChange, stop]);

  // Stop any live recognition when the section unmounts (leaving the step).
  React.useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor="intake-notes" className="text-[15px] font-bold text-ink-strong">
          Anything you wish to tell us about yourself
        </label>
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={!supported}
          aria-pressed={recording}
          title={supported ? (recording ? "Stop dictation" : "Dictate with your voice") : "Speech recognition isn't supported in this browser."}
          className="inline-flex shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={
            recording
              ? { background: "var(--color-altus-red)", color: "#fff" }
              : { background: "#fff", color: "var(--color-ink-strong)", border: "1px solid var(--color-hairline-strong)" }
          }
        >
          {recording ? (
            <>
              <span className="iw-rec-dot grid h-4 w-4 place-items-center rounded-full bg-white/95">
                <span className="block h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--color-altus-red)" }} />
              </span>
              Stop
            </>
          ) : (
            <>
              <Mic size={16} strokeWidth={2.3} /> Dictate
            </>
          )}
        </button>
      </div>

      <div data-invalid={error ? "true" : undefined} className={error ? "rounded-xl ring-1 ring-altus-red/40 -m-1 p-1" : ""}>
        <textarea
          id="intake-notes"
          data-autofocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type interview notes here, or press Dictate to capture them by voice…"
          maxLength={8000}
          rows={12}
          className="w-full rounded-[14px] border-2 px-4 py-3.5 text-[15px] leading-relaxed text-ink-strong outline-none transition-[border-color,box-shadow] focus:border-altus-red focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-altus-red)_13%,transparent)]"
          style={{ minHeight: 260, resize: "vertical", borderColor: error ? "var(--color-altus-red)" : "color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline))" }}
        />
      </div>

      {recording && (
        <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-altus-red">
          <span className="iw-rec-dot inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-altus-red)" }} />
          Listening…{interim && <span className="font-normal italic text-ink-muted">“{interim}”</span>}
        </p>
      )}

      {error && <p className="mt-1.5 text-[12px] font-semibold text-altus-red">This field is required.</p>}

      {!supported && (
        <p className="mt-2 text-[12.5px] text-ink-subtle">
          Voice dictation isn't available in this browser — you can still type your notes. For dictation, try Chrome or Edge.
        </p>
      )}
    </div>
  );
}
