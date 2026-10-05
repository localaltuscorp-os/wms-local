"use client";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Minimal shape every Goals surface can supply (cascade `RosterMember`, the
 *  weekly board's `people[]`, the review roster — all already have id + name). */
export interface ViewingPerson {
  id: string;
  name: string;
}

/**
 * The one "Viewing" person picker for the whole Goals product — Yearly,
 * Quarterly, Monthly, Weekly and Review & Scores all render THIS.
 *
 * Replaces the glowing avatar pill that was copy-pasted across those surfaces
 * (a blurred red halo `<span>`, a red-tinted gradient body, a 1.5px red border
 * and a coloured drop shadow, wrapped around an invisible full-size Select).
 * That much decoration on a secondary control fought the page for attention and
 * drifted in three directions. This is a plain, compact SaaS dropdown: hairline
 * border, card surface, quiet uppercase label. The Altus red survives only where
 * it carries meaning — the focus ring.
 *
 * It sits LAST in each header's control band, so the order reads
 * `[ FY / Period ] [ Viewing ]`.
 */
export function ViewingSelect({
  people,
  value,
  viewedName,
  onChange,
  myEmployeeId,
  label = "Viewing",
  ariaLabel = "View another person's goals",
  className,
  compact = false,
}: {
  people: ViewingPerson[];
  value: string;
  /** Display name for `value`, already resolved by the caller. */
  viewedName: string;
  onChange: (employeeId: string) => void;
  /** The signed-in person — their row is suffixed "(me)". */
  myEmployeeId: string;
  /** Eyebrow text. Review & Scores says "Reviewing". */
  label?: string;
  ariaLabel?: string;
  className?: string;
  /** Yearly Goals' dense command line uses the same picker at a smaller size. */
  compact?: boolean;
}) {
  // The viewed person is not always ON the roster — `resolveCascadeView` falls
  // back to the signed-in user's own name when their row isn't among the fetched
  // employees. The old pill printed `viewedName` as static text so it always
  // showed SOMETHING; a Select resolves its label from the options instead, and
  // would fall back to the "Select…" placeholder. Seed the missing row so the
  // trigger always names the person actually being viewed.
  const options = people.some((p) => p.id === value)
    ? people
    : [{ id: value, name: viewedName }, ...people];

  return (
    <div className={cn("inline-flex shrink-0 items-center max-md:w-full", compact ? "gap-1.5" : "gap-2", className)}>
      <span className={cn("shrink-0 font-bold uppercase tracking-[0.1em] text-ink-subtle max-lg:hidden", compact ? "text-[10px]" : "text-[11px]")}>
        {label}
      </span>
      <Select
        value={value}
        onValueChange={onChange}
        searchable
        searchPlaceholder="Search people…"
        ariaLabel={ariaLabel}
        unstyled
        className={cn(
          compact ? "h-8 w-[148px] px-2 text-[12px]" : "h-9 w-[188px] px-3 text-[13.5px]",
          "cursor-pointer rounded-pill border border-hairline-strong bg-surface-card font-semibold text-ink-strong transition-colors",
          "hover:border-[color-mix(in_srgb,var(--color-altus-red)_35%,var(--color-hairline-strong))]",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40",
          "max-md:w-full",
        )}
        options={options.map((p) => ({
          value: p.id,
          label: p.id === myEmployeeId ? `${p.name} (me)` : p.name,
        }))}
      />
    </div>
  );
}
