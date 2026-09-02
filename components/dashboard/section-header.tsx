import * as React from "react";

/* ────────────────────────────────────────────────────────────────────────
   DashboardSectionHeader — the one header block every dashboard widget uses.

   WHY IT EXISTS: each of the eight sections had grown its own masthead, half
   of them INSIDE the widget's white card. Sizes ranged from 17px to 30px and
   three different font stacks, so scanning the page gave no reliable sense of
   which titles were peers. This component fixes the typography in one place
   and, by convention, is rendered ABOVE the card it labels — never inside it —
   so the card holds data and the page holds structure.

   `actions` is the right-hand slot: pagers, window toggles, minimize buttons.
   Controls whose state lives inside the widget stay inside the widget; only
   the ones already owned by the section component move up here.
   ──────────────────────────────────────────────────────────────────────── */

export interface DashboardSectionHeaderProps {
  /* NO EYEBROW. Every section carried a small red uppercase tag above its
     title ("PEOPLE · STATUS BREAKDOWN", "TASKS · AGING"). Stacked down the
     page they read as a second, competing set of headings in the one colour
     the design reserves for alerts, and each said little the title below it
     did not already say. Removed at the source so no section can reintroduce
     one by passing a prop. */
  /** Optional glyph to the left of the title block. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** One line of description under the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned controls (pager, toggles). */
  actions?: React.ReactNode;
  /**
   * Gap to the card below. `mb-6` is the standard across the dashboard — it
   * was `mb-3`, which read tight against the taller section cards and differed
   * from the gap BETWEEN sections, so the header looked attached to the wrong
   * thing. Callers can still override per-section.
   */
  className?: string;
  /**
   * Left/right inset, matched to the padding of the CARD this header labels.
   *
   * The header renders above the card, not inside it, so with no inset the
   * title started at the card's outer edge while the card's own content began
   * a further 24-32px in. Two left edges, a few pixels apart, down the whole
   * page — which reads as the header belonging to nothing rather than to the
   * card beneath it.
   *
   * The default matches DASHBOARD_CARD_PADDED (`p-6 md:p-8`), which is what 15
   * of the dashboard's 20 cards use. The handful with different padding pass
   * their own so the two edges still line up.
   */
  inset?: string;
}

export function DashboardSectionHeader({
  icon,
  title,
  subtitle,
  actions,
  className = "mb-6",
  inset = "px-6 md:px-8",
}: DashboardSectionHeaderProps) {
  return (
    // items-center (not items-end): the right-hand control cluster is a single
    // 32px square, and bottom-aligning it against a three-line title block left
    // it sitting low. Centred, it reads level with the title whatever the
    // subtitle wraps to.
    // `pb-2` + a hairline RULE under every header. The header and its card were
    // two floating blocks with nothing tying them together, so on a long scroll
    // it was not always obvious which title owned which card — particularly
    // where two sections stack with no other divider between them, as the two
    // delegation scorecards do. The rule closes the header as a band.
    //
    // slate-100, not slate-200: this is a grouping cue inside a section, and it
    // must stay quieter than the slate-200/80 border of the card below it or
    // the page reads as a stack of equal-weight lines.
    <header
      className={`flex w-full items-center justify-between gap-4 border-b border-slate-100 pb-2 ${inset} ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0">
          {/* text-xl, down from text-2xl. Eight of these run down one page and
              at 24px they competed with the numbers inside the cards — the data
              is the thing to read, the heading only has to label it. */}
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          {/* text-xs + font-medium: a step further from the title, so the pair
              reads as heading-and-caption rather than as two similar lines. */}
          {subtitle && (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
      {/* gap-2.5 — the standard gutter between toolbar controls. Sections used
          to wrap their own actions in a second flex with their own gap, so the
          spacing differed card to card; the slot owns it now and callers pass a
          plain fragment. */}
      {actions && (
        <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
      )}
    </header>
  );
}
