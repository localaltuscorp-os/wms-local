"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * THE MODULE'S SHARED CHROME — a section wrapper and a segmented control.
 *
 * Both exist because the module had grown its own version of each on nearly
 * every screen: five section wrappers at four radii with a 21px display heading
 * and an icon tile apiece, and four segmented controls (year, period, scope,
 * decision) with four different geometries.
 */

/**
 * A flat section. Hairline border, 16px radius, 16px padding — the design
 * system's default card, with an OPTIONAL 16px/800 heading.
 *
 * Deliberately no icon tile and no description paragraph: the page command bar
 * above already names the page, and a second 21px heading under it was the
 * module's most repeated 48px of wasted height.
 */
export function IncentiveSection({
  title,
  hint,
  actions,
  children,
  className,
  bare = false,
}: {
  title?: string;
  /** One short line, inline and to the right of the title. */
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No card — for a child that draws its own surface (e.g. a DataTable). */
  bare?: boolean;
}) {
  return (
    <section
      className={cn(
        bare ? "" : "rounded-2xl border border-hairline bg-surface-card p-4 max-md:p-3",
        className,
      )}
    >
      {title || actions ? (
        <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {title ? (
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
          ) : null}
          {hint ? <p className="text-[12.5px] font-medium text-ink-muted">{hint}</p> : null}
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * The segmented control, at the design system's geometry: `h-9`, `rounded-pill`,
 * a `--color-surface-soft` track, and the accent gradient on the active segment.
 *
 * Reads `--color-altus-red`, so it follows the employee's own accent instead of
 * the literal `#E10600` the module's four hand-rolled versions carried.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  size = "md",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const h = size === "sm" ? "h-8" : "h-9";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-pill border border-hairline-strong",
        h,
      )}
      style={{ background: "var(--color-surface-soft)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-full whitespace-nowrap px-3 text-[12.5px] font-bold transition-colors disabled:cursor-wait",
              active ? "text-white" : "text-ink-subtle hover:text-ink-strong",
            )}
            style={
              active
                ? {
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  }
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The module's neutral secondary button, so Cancel/Import/Export match. */
export const INCENTIVE_BTN_NEUTRAL =
  "inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-50";

/** The module's primary button — the design system's pastel CTA, not a red slab. */
export const INCENTIVE_BTN_PRIMARY =
  "pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50";
