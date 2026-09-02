"use client";

import type { ReactNode } from "react";

/**
 * The shared chrome of the employee editor — cards, labelled fields, and the
 * three inputs. Extracted so SINGLE and BULK mode cannot drift apart visually:
 * both modes render the same components, and the only difference a control sees
 * is the `bulk` flag that turns an empty value into a "No Change" placeholder.
 *
 * Styling stays inside the existing admin language (white cards, hairline
 * borders, the red accent, the same radii) — no new design system, no shadows
 * or gradients beyond what the panel already uses.
 */

/**
 * The sentinel a bulk <Select> carries while a field is untouched.
 *
 * A non-empty string on purpose: "" is a legitimate value for the time
 * overrides (it means "clear this back to the company default"), so an empty
 * string cannot also mean "don't touch it". Everything that builds the patch
 * treats null / NO_CHANGE as "omit the key entirely".
 */
export const NO_CHANGE = "__no_change__";

export const inputClass =
  "w-full rounded-md border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-[15px] text-ink-strong outline-none transition-colors focus:border-[var(--color-altus-red)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/25 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-ink-subtle";

export function Card({
  title,
  children,
  tone = "plain",
}: {
  title: string;
  children: ReactNode;
  tone?: "plain" | "muted";
}) {
  return (
    <section
      className="rounded-xl border border-hairline p-4 max-md:p-3.5"
      style={{ background: tone === "muted" ? "#F8FAFC" : "#FFFFFF" }}
    >
      <h3 className="mb-3 text-[11.5px] font-black uppercase tracking-[0.09em] text-ink-subtle">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13.5px] font-semibold text-ink-strong">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-[12px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A time input that can also be "untouched".
 *
 * In bulk mode the value starts null and the control renders as a text box
 * reading "No Change"; clicking it swaps to a real `type="time"` picker. A
 * native time input has no way to show custom placeholder text, which is why
 * the untouched state is a separate text input rather than a styling trick.
 */
export function TimeInput({
  bulk,
  value,
  onChange,
  placeholder,
}: {
  bulk: boolean;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
}) {
  if (bulk && value === null) {
    return (
      <input
        type="text"
        readOnly
        value="No Change"
        aria-label="No change"
        onFocus={() => onChange("")}
        onClick={() => onChange("")}
        className={`${inputClass} cursor-pointer text-ink-subtle`}
      />
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} tabular-nums`}
      />
      {bulk ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Revert to No Change"
          className="shrink-0 rounded-md border border-hairline px-2 py-2 text-[12px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  step = "1",
  min = 0,
  max,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} tabular-nums`}
    />
  );
}

/** Inline error / notice strip, in the admin panel's existing red. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13.5px] text-[#A80400]"
      style={{ lineHeight: 1.5 }}
    >
      {children}
    </div>
  );
}

/** Neutral informational strip (the bulk-mode "only what you change" note). */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[13px] text-[#1D4ED8]"
      style={{ lineHeight: 1.55 }}
    >
      {children}
    </div>
  );
}
