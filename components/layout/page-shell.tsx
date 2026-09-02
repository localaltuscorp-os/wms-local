import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * PageShell — the one adaptive page container for the whole app.
 *
 * Replaces the hand-rolled `<main className="mx-auto max-w-[…px] px-8
 * max-lg:px-6 max-md:px-4 pt-8 pb-16">` that was copy-pasted across ~27 pages
 * in ~10 different max-widths. Two things make it robust where the old
 * incantation broke — under browser zoom (80–200%), Windows display scaling
 * (125/150%), and snapped / split-screen windows:
 *
 *   • Fluid gutter — horizontal padding is `var(--page-gutter)` =
 *     clamp(1rem, 4vw, 2rem). As the effective CSS width shrinks (all three
 *     scenarios do exactly that) the gutter shrinks too, handing the space
 *     back to content instead of a fixed px-8 eating it.
 *   • Named content widths — `--content-narrow|standard|wide|full` replace the
 *     ad-hoc pixel values, so every page reads from one source of truth.
 *
 * PORTAL-SAFE by construction: this is a max-width + padding box with NO
 * `zoom` / `transform` on any ancestor. The old "fit to screen" attempt used
 * an ancestor `zoom`, which double-applied to Radix/floating-ui portals and
 * flung every dropdown off-screen. PageShell never does that.
 *
 * Header/footer stay OUTSIDE PageShell (they own full-bleed chrome); PageShell
 * wraps only the page's content region, usually as the `<main>`.
 */

export type PageWidth = "narrow" | "standard" | "wide" | "full";

const WIDTH_VAR: Record<PageWidth, string> = {
  narrow: "var(--content-narrow)",
  standard: "var(--content-standard)",
  wide: "var(--content-wide)",
  full: "var(--content-full)",
};

export interface PageShellProps {
  children: ReactNode;
  /** Max content width. Default `wide` (1400px) — most dashboards. */
  width?: PageWidth;
  /** Element to render. Default `main`; use `div` when already inside a main. */
  as?: ElementType;
  /**
   * Standard vertical rhythm (pt-8 pb-16, tightened on mobile). Default true.
   * Set false when the page owns its own vertical padding.
   */
  py?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function PageShell({
  children,
  width = "wide",
  as,
  py = true,
  className = "",
  style,
}: PageShellProps) {
  const Tag: ElementType = as ?? "main";
  return (
    <Tag
      className={`mx-auto w-full ${py ? "pt-8 pb-16 max-md:pt-6 max-md:pb-12" : ""} ${className}`}
      style={{
        maxWidth: WIDTH_VAR[width],
        paddingInline: "var(--page-gutter)",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
