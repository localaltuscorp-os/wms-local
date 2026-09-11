import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared presentational primitives for the Time Intelligence reports — the glass
 * hero band, the analytics stat card, a richer list card, an empty state and a
 * table shell. Server-safe (no "use client"): pure markup on brand tokens.
 */

/** The frosted headline band every report page opens with. */
export function ReportHero({
  eyebrow,
  title,
  subtitle,
  Icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <section className="admin-section-band wg-rise mb-6 px-8 py-7 max-md:px-5 max-md:py-5">
      <div className="relative flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <span className="admin-section-icon size-12 shrink-0 max-md:hidden">
            <Icon size={24} strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0">
            <div
              className="uppercase font-bold text-ink-subtle"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 11,
                letterSpacing: "0.18em",
              }}
            >
              {eyebrow}
            </div>
            <h1
              className="mt-1 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(26px, 3.6vw, 36px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 14 }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-col items-end gap-3 max-md:items-start max-md:w-full">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

const CARD_SHADOW = "0 1px 3px rgba(15, 23, 42, 0.04)";

/** A single analytics tile: icon + label + big number + optional sub-line. */
export function StatCard({
  label,
  value,
  sub,
  Icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline p-5"
      style={{
        boxShadow: CARD_SHADOW,
        ...(accent
          ? { background: "color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-card))" }
          : {}),
      }}
    >
      <div className="flex items-center gap-2 text-ink-subtle">
        <Icon size={16} strokeWidth={2.3} style={{ color: "var(--color-altus-red)" }} aria-hidden />
        <span
          className="uppercase font-bold"
          style={{ fontSize: 11, letterSpacing: "0.1em" }}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-3 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 2.6vw, 30px)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 font-semibold text-ink-muted" style={{ fontSize: 12.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** A larger card with a heading + arbitrary body (lists, single highlight). */
export function RichCard({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline p-5 flex flex-col"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center gap-2 text-ink-subtle">
        <Icon size={16} strokeWidth={2.3} style={{ color: "var(--color-altus-red)" }} aria-hidden />
        <span className="uppercase font-bold" style={{ fontSize: 11, letterSpacing: "0.1em" }}>
          {label}
        </span>
      </div>
      <div className="mt-3 flex-1">{children}</div>
    </div>
  );
}

/** Empty-state panel — used when a report has no rows. */
export function EmptyState({
  title = "No time recorded yet",
  hint = "Once work sessions are logged on tasks, they'll roll up here.",
  Icon,
}: {
  title?: string;
  hint?: string;
  Icon?: LucideIcon;
}) {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline p-12 text-center"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {Icon && (
        <div className="mb-3 flex justify-center text-ink-subtle">
          <Icon size={30} strokeWidth={1.8} aria-hidden />
        </div>
      )}
      <p className="font-bold text-ink-strong" style={{ fontSize: 17 }}>
        {title}
      </p>
      <p className="mt-1.5 font-semibold text-ink-muted" style={{ fontSize: 14 }}>
        {hint}
      </p>
    </div>
  );
}

/**
 * A rounded, hairline-bordered card wrapping a report table — and the table's
 * own SCROLL REGION, vertical as well as horizontal.
 *
 * Every Time Intelligence tab renders through here: Employees, Goals, Tasks,
 * and Manager (which reuses TaskReportTable), so the behaviour is defined once
 * rather than four times.
 *
 * WHY THE CARD SCROLLS RATHER THAN THE PAGE. These tables are unbounded — a
 * report over a wide date range returns every person, every task. The card grew
 * to whatever height that came to and the PAGE scrolled instead, which takes
 * the column headers off the top of the screen: by row 30 you are reading a
 * grid of numbers with nothing left to say which column is Approval and which
 * is Rejection. It also scrolls the tab row away, so switching reports means
 * scrolling back up first.
 *
 * Three things make the inner scroll behave:
 *   · a HEIGHT CAP that tracks the viewport, with a 320px floor so a short
 *     window still shows a usable number of rows rather than a sliver;
 *   · a STICKY HEADER, so the column names stay put while the rows move;
 *   · `overscroll-contain`, so hitting the end of the table stops there instead
 *     of handing the momentum to the page and jumping the whole report.
 *
 * `slim-scroll` (app/globals.css) is the app's own bar, darkened a step here —
 * see the note at the class list.
 */
export function TableShell({
  children,
  /** Override the height cap for a table that wants a different bound. */
  maxHeight = "max(320px, calc(100dvh - 260px))",
}: {
  children: ReactNode;
  maxHeight?: string;
}) {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline overflow-hidden"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div
        className={
          "slim-scroll overflow-auto overscroll-contain " +
          // A DATA TABLE'S BAR HAS TO BE SEEN. `slim-scroll` alone is 6px with
          // an #e2e8f0 thumb — tuned for short side-lists, and on a white card
          // the size of this one it is close to invisible, so nothing tells you
          // there are 40 more rows below the fold. 8px and a slate-300 thumb
          // (slate-400 on hover) reads as a scrollbar at a glance without
          // becoming the loudest thing on the card.
          "[scrollbar-color:#cbd5e1_transparent] " +
          "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 " +
          "[&::-webkit-scrollbar-thumb]:bg-slate-300 " +
          "hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 " +
          // Sticky header. `position:sticky` goes on the `th`, not the
          // `<thead>` — a thead in a border-collapse table cannot be stuck as a
          // block. The collapsed bottom border does not paint on a stuck cell,
          // so it is redrawn as an inset shadow, and the cells need an opaque
          // background or the rows scroll visibly underneath them.
          "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 " +
          "[&_thead_th]:bg-surface-card " +
          "[&_thead_th]:shadow-[inset_0_-1px_0_var(--color-hairline)]"
        }
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}
