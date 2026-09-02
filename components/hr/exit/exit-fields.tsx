"use client";

import * as React from "react";
import { ChevronDown, Check, Mic, Search, Pencil } from "lucide-react";
import { useDictation } from "@/components/hr/candidate/evaluation-v2/use-dictation";
import type { ExitRosterEmployee } from "@/lib/hr/exit/schema";

/**
 * Self-contained floating-label field kit for the Exit forms. Mirrors the
 * Candidate Interview Form's premium `.iwf-*` / `.iwc-*` visual language, but
 * ships its OWN CSS (injected by <ExitStyle/>) so the Exit workspace does not
 * depend on the intake wizard being mounted. Pure CSS motion (no framer-motion),
 * reduced-motion respected, fully keyboard-navigable.
 */

const RED = "var(--color-altus-red)";

// One <style> block, injected once at the workspace root.
export const EXIT_CSS = `
@keyframes exStepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ex-step { animation: exStepIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }

/* ── Floating-label outlined fields ── */
.iwf { position: relative; --iwf-bd: color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline)); }
.iwf-control {
  width: 100%;
  min-height: 58px;
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
.iwf--area .iwf-control { min-height: 108px; padding-top: 26px; resize: vertical; line-height: 1.55; }
.iwf select.iwf-control { -webkit-appearance: none; appearance: none; cursor: pointer; padding-right: 42px; }

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
.iwf-req { color: var(--color-altus-red); margin-left: 2px; }
.iwf-caret { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: var(--color-ink-soft); pointer-events: none; }

/* ── Inline chip radiogroup ── */
.iwc { position: relative; }
.iwc-legend { display: block; font-size: 13px; font-weight: 700; letter-spacing: .01em; color: var(--color-ink-muted); margin-bottom: 9px; }
.iwc-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.iwc-chip {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex; align-items: center;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13.5px; font-weight: 700;
  border: 1.5px solid var(--color-hairline);
  background: #fff; color: var(--color-ink-soft);
  cursor: pointer;
  transition: color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .12s ease;
}
/* Fill sweep — a red disc that springs out from the chip centre on select. */
.iwc-chip::before {
  content: ""; position: absolute; inset: 0; z-index: 0;
  background: var(--color-altus-red);
  transform: scale(0); opacity: 0; transform-origin: center;
  transition: transform .36s cubic-bezier(.34,1.56,.64,1), opacity .18s ease;
}
.iwc-in { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; }
.iwc-chip:hover { border-color: color-mix(in srgb, var(--color-altus-red) 42%, var(--color-hairline)); color: var(--color-ink-strong); }
.iwc-chip.is-on { border-color: var(--color-altus-red); color: #fff; box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--color-altus-red) 85%, transparent); animation: iwcPop .36s cubic-bezier(.34,1.56,.64,1); }
.iwc-chip.is-on::before { transform: scale(1); opacity: 1; }
.iwc-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 32%, transparent); }
.iwc-chip:active { transform: translateY(1px); }
@keyframes iwcPop { 0% { transform: scale(.9); } 55% { transform: scale(1.07); } 100% { transform: scale(1); } }

/* ── Searchable employee combobox ── */
.excb { position: relative; }
.excb .iwf-control { padding-right: 42px; cursor: text; }
.excb-caret { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: var(--color-altus-red); pointer-events: none; }
.excb-list {
  position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 6px);
  max-height: 288px; overflow-y: auto;
  background: #fff; border: 1.5px solid var(--color-hairline-strong); border-radius: 14px;
  box-shadow: 0 24px 48px -20px rgba(24,24,27,0.28); padding: 6px;
  animation: excbIn .16s cubic-bezier(.22,1,.36,1) both;
}
@keyframes excbIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.excb-opt {
  display: flex; flex-direction: column; gap: 1px;
  width: 100%; text-align: left; cursor: pointer;
  padding: 9px 12px; border-radius: 10px; border: 0; background: transparent;
  color: var(--color-ink-strong); transition: background-color .12s ease;
}
.excb-opt:hover, .excb-opt.is-active { background: color-mix(in srgb, var(--color-altus-red) 8%, #fff); }
.excb-opt.is-selected { background: color-mix(in srgb, var(--color-altus-red) 12%, #fff); }
.excb-opt-name { font-size: 14.5px; font-weight: 700; }
.excb-opt-sub { font-size: 12px; font-weight: 500; color: var(--color-ink-muted); }
.excb-empty { padding: 14px 12px; font-size: 13.5px; color: var(--color-ink-muted); text-align: center; }

/* ── Auto-filled (read-only, overridable) field ── */
.iwf--auto.is-locked .iwf-control { background: color-mix(in srgb, var(--color-altus-red) 3.5%, #fff); cursor: default; padding-right: 92px; }
.iwf-auto-edit {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%); z-index: 2;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 999px;
  border: 1.5px solid var(--color-hairline-strong); background: #fff;
  font-size: 11.5px; font-weight: 800; color: var(--color-ink-soft);
  cursor: pointer; transition: color .15s ease, border-color .15s ease;
}
.iwf-auto-edit:hover { border-color: var(--color-altus-red); color: var(--color-altus-red); }
.iwf-auto-edit:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 30%, transparent); }
.iwf-auto-badge {
  display: inline-flex; align-items: center;
  padding: 1px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--color-altus-red) 12%, #fff);
  color: var(--color-altus-red-deep); font-size: 10px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase;
}

/* ── Dictation mic on textareas ── */
.iwf--area.iwf--mic .iwf-control { padding-top: 40px; }
.ex-mic {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: inline-grid; place-items: center; width: 30px; height: 30px;
  border-radius: 9px; border: 1.5px solid var(--color-hairline-strong);
  background: #fff; color: var(--color-ink-soft); cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background-color .15s ease;
}
.ex-mic:hover { border-color: var(--color-altus-red); color: var(--color-altus-red); }
.ex-mic:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 30%, transparent); }
.ex-mic.is-rec { background: var(--color-altus-red); border-color: var(--color-altus-red); color: #fff; animation: exMicPulse 1.5s ease-in-out infinite; }
@keyframes exMicPulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-altus-red) 42%, transparent); }
  50% { box-shadow: 0 0 0 7px transparent; }
}
.ex-ta-hint { display: flex; align-items: center; gap: 7px; margin-top: 6px; font-size: 12.5px; font-weight: 700; color: var(--color-altus-red-deep); }
.ex-ta-hint em { font-style: italic; font-weight: 400; color: var(--color-ink-muted); }
.ex-ta-dot { flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--color-altus-red); animation: exDot 1.1s ease-in-out infinite; }
@keyframes exDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.65); } }

/* ── Rating matrix (1..5 radio grid) ── */
.exm { border: 1.5px solid var(--color-hairline); border-radius: 16px; overflow: hidden; background: #fff; }
.exm-head, .exm-row { display: grid; grid-template-columns: minmax(180px, 1.6fr) repeat(5, minmax(52px, 1fr)); align-items: stretch; }
.exm-head { background: color-mix(in srgb, var(--color-altus-red) 6%, #fff); border-bottom: 1.5px solid var(--color-hairline); }
.exm-head > div { padding: 11px 12px; font-size: 12px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; color: var(--color-altus-red-deep); text-align: center; }
.exm-head > div:first-child { text-align: left; }
.exm-row { border-bottom: 1px solid var(--color-hairline); }
.exm-row:last-child { border-bottom: 0; }
.exm-row:nth-child(odd) { background: color-mix(in srgb, var(--color-altus-red) 2%, #fff); }
.exm-aspect { padding: 13px 14px; font-size: 14px; font-weight: 600; color: var(--color-ink-strong); display: flex; align-items: center; }
.exm-cell { display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--color-hairline); padding: 8px; }
.exm-dot {
  width: 30px; height: 30px; border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--color-altus-red) 26%, var(--color-hairline));
  background: #fff; cursor: pointer;
  display: grid; place-items: center;
  font-size: 12.5px; font-weight: 800; color: var(--color-ink-soft);
  transition: background-color .14s ease, border-color .14s ease, color .14s ease, transform .12s ease, box-shadow .14s ease;
}
.exm-dot:hover { border-color: var(--color-altus-red); color: var(--color-altus-red-deep); }
.exm-dot.is-on { background: var(--color-altus-red); border-color: var(--color-altus-red); color: #fff; box-shadow: 0 8px 16px -9px color-mix(in srgb, var(--color-altus-red) 85%, transparent); transform: scale(1.06); }
.exm-dot:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 32%, transparent); }

/* ── Aligned label → value grid (read-only recaps / letter fields) ── */
.ex-lv { display: grid; grid-template-columns: minmax(96px, max-content) 1fr; gap: 8px 18px; align-items: baseline; margin: 0; }
.ex-lv dt {
  position: relative;
  font-size: 12.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
  color: var(--color-altus-red-deep);
  white-space: nowrap;
}
.ex-lv dt::after { content: ":"; margin-left: 1px; color: var(--color-ink-subtle); }
.ex-lv dd { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--color-ink-strong); word-break: break-word; }
.ex-lv dd.is-empty { color: var(--color-ink-subtle); font-weight: 500; }

/* ── Checkbox line item ── */
.exchk {
  display: flex; align-items: flex-start; gap: 11px;
  width: 100%; text-align: left;
  padding: 11px 13px; border-radius: 12px;
  border: 1.5px solid var(--color-hairline); background: #fff;
  cursor: pointer; color: var(--color-ink-strong);
  transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
}
.exchk:hover { border-color: color-mix(in srgb, var(--color-altus-red) 40%, var(--color-hairline)); }
.exchk:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 26%, transparent); }
.exchk.is-on { border-color: var(--color-altus-red); background: color-mix(in srgb, var(--color-altus-red) 5%, #fff); }
.exchk-box {
  flex: none; width: 22px; height: 22px; margin-top: 1px;
  border-radius: 7px; border: 2px solid color-mix(in srgb, var(--color-altus-red) 30%, var(--color-hairline));
  background: #fff; display: grid; place-items: center; color: #fff;
  transition: background-color .14s ease, border-color .14s ease;
}
.exchk.is-on .exchk-box { background: var(--color-altus-red); border-color: var(--color-altus-red); }
.exchk-label { font-size: 14.5px; font-weight: 600; line-height: 1.4; }

@media (max-width: 720px) {
  .exm-head, .exm-row { grid-template-columns: 1fr repeat(5, 44px); }
  .exm-head > div { font-size: 10px; padding: 8px 4px; }
  .exm-aspect { font-size: 13px; padding: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .ex-step, .iwc-chip.is-on, .ex-mic.is-rec, .ex-ta-dot, .excb-list { animation: none !important; }
  .iwf-label, .iwf-control, .iwc-chip, .iwc-chip::before, .exm-dot, .exchk, .exchk-box, .ex-mic, .iwf-auto-edit, .excb-opt { transition: none !important; }
}
`;

export function ExitStyle() {
  return <style dangerouslySetInnerHTML={{ __html: EXIT_CSS }} />;
}

// ── Floating input / textarea ──

export function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
  required,
  fieldKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "tel" | "email";
  autoFocus?: boolean;
  required?: boolean;
  /** Payload key, exposed as `data-field` so a failed Submit can scroll the
   *  offending input into view. Opt-in — only the fields Submit actually
   *  requires need it, and `useId` makes the DOM id useless for this. */
  fieldKey?: string;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const alwaysFloat = type === "date";
  const float = alwaysFloat || focused || (value ?? "").trim() !== "";
  return (
    <div className={`iwf${float ? " is-float" : ""}`}>
      <input
        id={id}
        type={type}
        value={value}
        data-field={fieldKey}
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        placeholder=" "
        maxLength={500}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      <label htmlFor={id} className="iwf-label">
        {label}
        {required && <span className="iwf-req" aria-hidden>*</span>}
      </label>
    </div>
  );
}

export function FloatingTextarea({
  label,
  value,
  onChange,
  autoFocus,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  rows?: number;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const dict = useDictation({ value, onChange });
  const float = focused || (value ?? "").trim() !== "";
  return (
    <div className="ex-ta">
      <div className={`iwf iwf--area${float ? " is-float" : ""}${dict.supported ? " iwf--mic" : ""}`}>
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={4000}
          data-autofocus={autoFocus || undefined}
          className="iwf-control"
          placeholder=" "
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
        />
        <label htmlFor={id} className="iwf-label">
          {label}
        </label>
        {dict.supported && (
          <button
            type="button"
            onClick={dict.toggle}
            aria-pressed={dict.recording}
            aria-label={dict.recording ? "Stop dictation" : "Dictate with your voice"}
            title={dict.recording ? "Stop dictation" : "Dictate with your voice"}
            className={`ex-mic${dict.recording ? " is-rec" : ""}`}
          >
            <Mic size={15} strokeWidth={2.3} aria-hidden />
          </button>
        )}
      </div>
      {dict.recording && (
        <p className="ex-ta-hint" aria-live="polite">
          <span className="ex-ta-dot" aria-hidden />
          Listening…{dict.interim && <em>“{dict.interim}”</em>}
        </p>
      )}
    </div>
  );
}

// ── Floating select (native <select>, brand-styled) ──

export function FloatingSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "— Select —",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const float = focused || (value ?? "").trim() !== "";
  return (
    <div className={`iwf${float ? " is-float" : ""}`}>
      <select
        id={id}
        value={value}
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <label htmlFor={id} className="iwf-label">
        {label}
      </label>
      <ChevronDown size={18} className="iwf-caret" aria-hidden />
    </div>
  );
}

// ── Aligned label → value grid (read-only recap / letter-style fields) ──

export function LabelValueGrid({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="ex-lv">
      {rows.map((r) => {
        const empty = r.value == null || r.value === "";
        return (
          <React.Fragment key={r.label}>
            <dt>{r.label}</dt>
            <dd className={empty ? "is-empty" : undefined}>{empty ? "—" : r.value}</dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

// ── Chip radiogroup (Yes/No, Excellent/Good/…) ──

export function ChipGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend?: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = options.indexOf(value);

  function focusAndSelect(i: number) {
    const n = options.length;
    if (n === 0) return;
    const idx = ((i % n) + n) % n;
    const opt = options[idx];
    if (opt != null) onChange(opt);
    btnRefs.current[idx]?.focus();
  }
  function onKey(e: React.KeyboardEvent, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="iwc" role="radiogroup" aria-label={legend}>
      {legend && <span className="iwc-legend">{legend}</span>}
      <div className="iwc-opts">
        {options.map((o, i) => {
          const on = value === o;
          const isStop = on || (selectedIdx === -1 && i === 0);
          return (
            <button
              key={o}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={isStop ? 0 : -1}
              onClick={() => onChange(on ? "" : o)}
              onKeyDown={(e) => onKey(e, i)}
              className={`iwc-chip${on ? " is-on" : ""}`}
            >
              <span className="iwc-in">
                {on && <Check size={13} strokeWidth={3} aria-hidden />}
                {o}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 1..5 rating matrix (accessible radio grid) ──

export function RatingMatrix({
  aspects,
  legend,
  values,
  onChange,
}: {
  aspects: { id: string; label: string }[];
  legend: string[];
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
}) {
  const scores = [1, 2, 3, 4, 5];
  const dotRefs = React.useRef<Record<string, (HTMLButtonElement | null)[]>>({});

  function focusAndSet(aspectId: string, score: number) {
    const s = Math.max(1, Math.min(5, score));
    onChange(aspectId, s);
    dotRefs.current[aspectId]?.[s - 1]?.focus();
  }

  return (
    <div className="exm" role="group" aria-label="Rate each aspect from 1 (Poor) to 5 (Excellent)">
      <div className="exm-head" aria-hidden>
        <div>Aspect</div>
        {legend.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      {aspects.map((a) => {
        const cur = values[a.id] ?? 0;
        dotRefs.current[a.id] = dotRefs.current[a.id] ?? [];
        return (
          <div className="exm-row" key={a.id} role="radiogroup" aria-label={a.label}>
            <div className="exm-aspect">{a.label}</div>
            {scores.map((s, i) => {
              const on = cur === s;
              const isStop = on || (cur === 0 && s === 1);
              return (
                <div className="exm-cell" key={s}>
                  <button
                    ref={(el) => {
                      (dotRefs.current[a.id] ??= [])[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${a.label}: ${legend[i] ?? s} (${s} of 5)`}
                    tabIndex={isStop ? 0 : -1}
                    className={`exm-dot${on ? " is-on" : ""}`}
                    onClick={() => onChange(a.id, on ? 0 : s)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        focusAndSet(a.id, (cur || 0) + 1);
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        focusAndSet(a.id, (cur || 1) - 1 || 1);
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        focusAndSet(a.id, 1);
                      } else if (e.key === "End") {
                        e.preventDefault();
                        focusAndSet(a.id, 5);
                      }
                    }}
                  >
                    {s}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Checkbox line item ──

export function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`exchk${checked ? " is-on" : ""}`}
    >
      <span className="exchk-box" aria-hidden>
        {checked && <Check size={14} strokeWidth={3.4} />}
      </span>
      <span className="exchk-label">{label}</span>
    </button>
  );
}

// ── Auto-filled field (read-only by default, one click to override) ──

export function AutoFillField({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  autoFocus?: boolean;
}) {
  const id = React.useId();
  const ref = React.useRef<HTMLInputElement>(null);
  const [editing, setEditing] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const locked = !editing;
  const float = type === "date" || focused || (value ?? "").trim() !== "";

  function enableEdit() {
    setEditing(true);
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className={`iwf iwf--auto${float ? " is-float" : ""}${locked ? " is-locked" : ""}`}>
      <input
        ref={ref}
        id={id}
        type={type}
        value={value}
        readOnly={locked}
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        placeholder=" "
        maxLength={200}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      <label htmlFor={id} className="iwf-label">
        {label}
      </label>
      {locked && (
        <button type="button" className="iwf-auto-edit" onClick={enableEdit} title={`Override ${label}`}>
          <span className="iwf-auto-badge">Auto</span>
          <Pencil size={11} strokeWidth={2.6} aria-hidden />
          Edit
        </button>
      )}
    </div>
  );
}

// ── Searchable employee combobox (type-to-filter, keyboard-navigable) ──

export function EmployeeCombobox({
  label,
  roster,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  roster: ExitRosterEmployee[];
  /** Selected employee id (empty when none). */
  value: string;
  onChange: (id: string) => void;
  autoFocus?: boolean;
}) {
  const listId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const optRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const selected = roster.find((e) => e.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () => (q ? roster.filter((e) => e.name.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q)) : roster),
    [roster, q],
  );

  // The input shows the live query while open, else the selected name.
  const shown = open ? query : selected?.name ?? "";
  const float = open || (shown ?? "").trim() !== "";

  React.useEffect(() => {
    if (open) setActive(Math.max(0, filtered.findIndex((e) => e.id === value)));
  }, [open, filtered, value]);

  // Keep the active option scrolled into view.
  React.useEffect(() => {
    if (open) optRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openMenu = React.useCallback(() => {
    setQuery("");
    setOpen(true);
  }, []);
  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  function pick(emp: ExitRosterEmployee) {
    onChange(emp.id);
    close();
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { openMenu(); return; }
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { openMenu(); return; }
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]!);
      }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); close(); }
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(filtered.length - 1);
    }
  }

  return (
    <div
      className={`iwf excb${float ? " is-float" : ""}`}
      onBlur={(e) => {
        // Close only when focus leaves the whole combobox (input → list button).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        placeholder=" "
        value={shown}
        onFocus={openMenu}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKey}
      />
      <label className="iwf-label">{label}</label>
      {open ? <Search size={17} className="excb-caret" aria-hidden /> : <ChevronDown size={18} className="iwf-caret" aria-hidden />}

      {open && (
        <div ref={listRef} id={listId} role="listbox" aria-label={label} className="excb-list">
          {filtered.length === 0 ? (
            <div className="excb-empty">No employees match “{query.trim()}”.</div>
          ) : (
            filtered.map((emp, i) => {
              const sub = [emp.designation, emp.department].filter(Boolean).join(" · ");
              return (
                <button
                  key={emp.id}
                  ref={(el) => {
                    optRefs.current[i] = el;
                  }}
                  id={`${listId}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={emp.id === value}
                  tabIndex={-1}
                  className={`excb-opt${i === active ? " is-active" : ""}${emp.id === value ? " is-selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(emp)}
                >
                  <span className="excb-opt-name">{emp.name}</span>
                  {sub && <span className="excb-opt-sub">{sub}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export { RED as EXIT_RED };
