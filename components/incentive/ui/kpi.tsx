import type { ReactNode } from "react";
import { toneBase, toneFill, toneInk, type Tone } from "./tone";

/**
 * THE INCENTIVE KPI — one card, used by every incentive surface.
 *
 * It replaces six near-identical implementations (the page header strip, the
 * Targets summary, the Billing metrics, the payout totals, the ledger split
 * cards and the status window cards), which had drifted to four paddings, three
 * numeral sizes and a different shadow each.
 *
 * Compact by construction: the label and the figure share the card's full
 * width, the caption is one line, and the optional bar is 4px. That is what
 * lets four of these sit in the band a single old card used to occupy.
 */
export function IncentiveKpi({
  label,
  value,
  caption,
  tone = "slate",
  icon,
  progress,
  onClick,
  selected = false,
}: {
  label: string;
  /** Already formatted — this component never formats money. */
  value: string;
  caption?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  /** 0–1 fill for the thin bar; omit to hide it. */
  progress?: number | null;
  /** Makes the card a button — used by the dashboard's status filters. */
  onClick?: () => void;
  selected?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`rounded-2xl border bg-surface-card px-3.5 py-2.5 text-left transition-colors ${
        onClick ? "cursor-pointer hover:bg-surface-soft" : ""
      }`}
      style={{
        borderColor: selected ? toneBase(tone) : "var(--color-hairline)",
        borderWidth: selected ? 1.5 : 1,
      }}
    >
      <span className="flex items-center gap-1.5">
        {icon ? (
          <span
            aria-hidden
            className="inline-grid size-5 shrink-0 place-items-center rounded-md"
            style={{ background: toneFill(tone, 12), color: toneInk(tone) }}
          >
            {icon}
          </span>
        ) : (
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: toneBase(tone) }} />
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</span>
      </span>
      <span
        className="mt-1.5 block tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(18px, 1.35vw, 22px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {caption ? (
        <span className="mt-1 block text-[12px] font-medium text-ink-subtle">{caption}</span>
      ) : null}
      {progress != null ? (
        <span
          aria-hidden
          className="mt-2 block h-1 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(2, Math.min(1, progress) * 100)}%`, background: toneBase(tone) }}
          />
        </span>
      ) : null}
    </Tag>
  );
}

/** The KPI band. `cols` is the widest arrangement; it steps down on its own. */
export function IncentiveKpiRow({
  children,
  cols = 4,
  className = "",
}: {
  children: ReactNode;
  cols?: 3 | 4 | 6;
  className?: string;
}) {
  const wide = cols === 6 ? "xl:grid-cols-6" : cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${wide} ${className}`}>{children}</div>
  );
}
