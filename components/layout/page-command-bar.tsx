import type { ReactNode } from "react";

/**
 * PageCommandBar — the Yearly Goals header, extracted so every page can wear it.
 *
 * The Goals level pages (`/goals/yearly` and friends) settled on one header
 * shape: a single low card holding the title on the left and whatever compact
 * controls the page needs on the right. It is the reference for the rest of the
 * app, so it lives here rather than being re-typed per page and drifting.
 *
 * What it deliberately does NOT have, because the reference does not:
 *
 *   · No red uppercase eyebrow pill ("GOALS · RECYCLE BIN", "ADMIN · ACCOUNTS").
 *     A gradient badge shouting the breadcrumb was the loudest thing on every
 *     page while saying the least — the sidebar already says which room you are
 *     in, and the title says which page.
 *   · No paragraph under the title. Where a page genuinely needs a word of
 *     orientation it goes in `hint`, which sits INLINE to the right of the
 *     title as secondary helper text — readable by someone new, invisible to
 *     everyone else, and costing no vertical space.
 *
 * Values (radius, border, shadow, the clamped display type, the 56px band) are
 * copied from components/goals/board/goals-level-board.tsx so the two are the
 * same object rather than two things that merely look alike.
 *
 * No hooks and no "use client" — it renders inside server components directly.
 */
export function PageCommandBar({
  title,
  hint,
  actions,
  toolbar,
  className = "",
}: {
  title: string;
  /** Compact helper text, inline to the RIGHT of the title. Keep it to a line. */
  hint?: ReactNode;
  /** Right-aligned controls on the HEADER row: pickers, steppers, primary buttons. */
  actions?: ReactNode;
  /**
   * Optional ACTION ROW — a second, tighter row inside the same card for
   * search boxes, filter selects and view toggles.
   *
   * It belongs in here rather than floating below the card because a filter
   * strip is chrome for the table, not content: left loose on the page it read
   * as a third band of header and added ~40px of whitespace above every table.
   * Divided from the header row by a hairline so the two still read as
   * separate jobs.
   */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`wg-rise relative mb-4 overflow-hidden rounded-[20px] ${className}`}
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.22)",
      }}
    >
      <div className="relative flex min-h-[56px] flex-wrap items-center gap-3 px-5 py-2.5 max-md:gap-2.5 max-md:px-4">
        {/* Title + hint share one baseline row. `items-baseline` is what makes
            the hint read as a trailing clause of the title rather than a second
            heading parked beside it. */}
        <div className="flex min-w-[200px] flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              color: "var(--color-ink-strong)",
              fontSize: "clamp(22px, 2vw, 32px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {title}
          </h1>
          {hint && (
            <p className="text-[12.5px] font-medium leading-snug text-ink-muted">
              {hint}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-row items-center gap-2.5 max-sm:w-full max-sm:justify-between">
            {actions}
          </div>
        )}
      </div>

      {toolbar && (
        <div
          className="flex flex-wrap items-center gap-2 px-5 py-2 max-md:px-4"
          style={{ borderTop: "1px solid var(--color-hairline)" }}
        >
          {toolbar}
        </div>
      )}
    </section>
  );
}

/**
 * The page frame the reference uses: full width, no PageShell vertical padding
 * of its own, and a tighter top/bottom rhythm than the app default (pt-8 pb-16).
 * Exported as a class string rather than a component so a page can drop it onto
 * whatever PageShell it already renders.
 */
export const COMMAND_PAGE_CLASS =
  "relative flex flex-1 flex-col pt-6 pb-8 max-md:pt-5 max-md:pb-6";
