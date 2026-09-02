"use client";

import { Check, Minus } from "lucide-react";

/**
 * Controlled checkbox with an indeterminate ("mixed") state, styled to match
 * the app's chip language. Stops click propagation so ticking a row checkbox
 * never triggers the row's own click/navigation.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const mixed = indeterminate && !checked;
  const filled = checked || mixed;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        filled
          ? "bg-altus-red border-altus-red text-white"
          : "bg-surface-card border-hairline-strong text-transparent hover:border-altus-red"
      } ${className}`}
    >
      {mixed ? (
        <Minus size={13} strokeWidth={3} />
      ) : checked ? (
        <Check size={13} strokeWidth={3} />
      ) : null}
    </button>
  );
}
