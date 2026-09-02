"use client";

import * as React from "react";
import { Check, X, Minus, EyeOff, Gauge, FlaskConical } from "lucide-react";
import { StarRating } from "@/components/hr/candidate/star-rating";
import type { PassFail } from "@/lib/hr/candidate/evaluation-v2";

const RED = "var(--color-altus-red)";

/**
 * A keyboard-accessible wrapper around the shared StarRating. The stars keep
 * their click-for-half behaviour; the wrapper adds a focusable slider surface so
 * arrows / Home / End move the value (0..10 in 0.5 steps). When `muted` (Can't
 * Say) the stars render read-only and dimmed and are excluded from the average.
 */
export function RatingControl({
  label,
  value,
  onChange,
  muted = false,
  size = 30,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  muted?: boolean;
  size?: number;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (muted) return;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(10, value + 0.5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, value - 0.5);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 10;
        break;
      case "PageUp":
        next = Math.min(10, value + 1);
        break;
      case "PageDown":
        next = Math.max(0, value - 1);
        break;
      default:
        return;
    }
    if (next !== null) {
      e.preventDefault();
      onChange(next);
    }
  }

  return (
    <div
      role="slider"
      tabIndex={muted ? -1 : 0}
      aria-label={`${label} — rate 0 to 10`}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={value}
      aria-valuetext={value > 0 ? `${value} out of 10` : "not rated"}
      aria-disabled={muted || undefined}
      onKeyDown={onKeyDown}
      className="ev2-rating inline-flex rounded-lg outline-none"
      style={{ opacity: muted ? 0.35 : 1, filter: muted ? "grayscale(1)" : "none", transition: "opacity 0.2s, filter 0.2s" }}
    >
      <StarRating value={value} onChange={onChange} readOnly={muted} size={size} />
    </div>
  );
}

/** The "Can't Say" toggle — mutes a row's stars and drops it from the average. */
export function CantSayToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] transition-colors"
      style={
        on
          ? { background: "var(--color-ink-strong)", color: "#fff" }
          : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)", border: "1px solid var(--color-hairline)" }
      }
      title={on ? "Counting as Can't Say — click to rate instead" : "Can't judge this one — exclude from the average"}
    >
      <EyeOff size={12} strokeWidth={2.4} /> Can&apos;t say
    </button>
  );
}

/**
 * A compact, secondary 0..10 Confidence stepper for Base Expectations. Keyboard
 * accessible (arrows / Home / End); a subtle pill that never competes with the
 * primary star rating. `value == null` means "not captured".
 */
export function ConfidenceControl({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const v = value ?? 0;
  function step(delta: number) {
    const next = Math.max(0, Math.min(10, v + delta));
    onChange(next);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        step(1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        onChange(0);
        break;
      case "End":
        e.preventDefault();
        onChange(10);
        break;
      default:
        break;
    }
  }
  const set = value != null;
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} — confidence 0 to 10`}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={v}
      aria-valuetext={set ? `${v} out of 10` : "not captured"}
      onKeyDown={onKeyDown}
      className="ev2-rating inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-[11.5px] font-bold outline-none transition-colors"
      style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)", color: "var(--color-ink-muted)" }}
      title="Optional — how confident are you in this rating?"
    >
      <Gauge size={12} strokeWidth={2.4} style={{ color: RED }} />
      <span className="uppercase tracking-[0.06em] text-ink-soft">Conf</span>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => step(-1)}
        aria-hidden
        className="grid h-4 w-4 place-items-center rounded-full text-[13px] leading-none transition-colors hover:bg-hairline"
      >
        −
      </button>
      <span className="min-w-[28px] text-center tabular-nums" style={{ color: set ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}>
        {set ? v : "—"}
      </span>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => step(1)}
        aria-hidden
        className="grid h-4 w-4 place-items-center rounded-full text-[13px] leading-none transition-colors hover:bg-hairline"
      >
        +
      </button>
    </div>
  );
}

/**
 * A compact "Practically tested?" Yes / No toggle for the Technical section.
 * `value == null` renders both un-pressed.
 */
export function PracticalTestedToggle({
  value,
  onChange,
  label,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={`${label} — practically tested?`}
      className="inline-flex items-center gap-1.5 rounded-pill px-2 py-1"
      style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
      title="Did you practically test this skill, or is it self-reported?"
    >
      <FlaskConical size={12} strokeWidth={2.4} style={{ color: RED }} />
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-soft">Tested</span>
      <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: "var(--color-hairline-strong)" }}>
        <button
          type="button"
          aria-pressed={value === true}
          onClick={() => onChange(true)}
          className="px-2 py-0.5 text-[11px] font-bold transition-colors"
          style={value === true ? { background: "#16a34a", color: "#fff" } : { background: "#fff", color: "var(--color-ink-muted)" }}
        >
          Yes
        </button>
        <button
          type="button"
          aria-pressed={value === false}
          onClick={() => onChange(false)}
          className="border-l px-2 py-0.5 text-[11px] font-bold transition-colors"
          style={
            value === false
              ? { background: "var(--color-ink-soft)", color: "#fff", borderColor: "var(--color-hairline)" }
              : { background: "#fff", color: "var(--color-ink-muted)", borderColor: "var(--color-hairline)" }
          }
        >
          No
        </button>
      </div>
    </div>
  );
}

/**
 * A generic N-option segmented control rendered as an accessible radiogroup —
 * arrows move between options, Space/Enter select. Used by the Customer-Facing
 * multi-value gate.
 */
export function SegmentedControl({
  value,
  onChange,
  options,
  label,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIdx = (idx + dir + options.length) % options.length;
    const opt = options[nextIdx];
    if (opt) {
      onChange(opt.value);
      refs.current[nextIdx]?.focus();
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--color-hairline-strong)" }}
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="px-3.5 py-2 text-[13px] font-bold transition-colors max-sm:px-2.5"
            style={
              active
                ? { background: RED, color: "#fff", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.25)" : "none" }
                : { background: "#fff", color: "var(--color-ink-muted)", borderLeft: i > 0 ? "1px solid var(--color-hairline)" : "none" }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const PF_OPTS: { value: PassFail; label: string; icon: React.ReactNode; on: React.CSSProperties }[] = [
  { value: "yes", label: "Yes", icon: <Check size={14} strokeWidth={3} />, on: { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } },
  { value: "no", label: "No", icon: <X size={14} strokeWidth={3} />, on: { background: RED, color: "#fff", borderColor: RED } },
  { value: "na", label: "N-A", icon: <Minus size={14} strokeWidth={3} />, on: { background: "var(--color-ink-soft)", color: "#fff", borderColor: "var(--color-ink-soft)" } },
];

/**
 * A 3-state segmented control (Yes / No / N-A) rendered as an accessible
 * radiogroup — arrows move between options, Space/Enter select.
 */
export function SegmentedPassFail({
  value,
  onChange,
  label,
}: {
  value: PassFail | undefined;
  onChange: (v: PassFail) => void;
  label: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function selectValue(v: PassFail) {
    const idx = PF_OPTS.findIndex((o) => o.value === v);
    onChange(v);
    if (idx >= 0) refs.current[idx]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    // Y / N / A pick Yes / No / N-A directly (Sir).
    const k = e.key.toLowerCase();
    if (k === "y" || k === "n" || k === "a") {
      e.preventDefault();
      selectValue(k === "y" ? "yes" : k === "n" ? "no" : "na");
      return;
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIdx = (idx + dir + PF_OPTS.length) % PF_OPTS.length;
    const opt = PF_OPTS[nextIdx];
    if (opt) {
      onChange(opt.value);
      refs.current[nextIdx]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--color-hairline-strong)" }}
    >
      {PF_OPTS.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-bold transition-colors max-sm:px-2.5"
            style={
              active
                ? { ...opt.on, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.25)" : "none" }
                : {
                    background: "#fff",
                    color: "var(--color-ink-muted)",
                    borderLeft: i > 0 ? "1px solid var(--color-hairline)" : "none",
                  }
            }
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
