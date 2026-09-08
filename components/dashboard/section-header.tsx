import * as React from "react";
import { HoverTip } from "@/components/ui/hover-tip";

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
  /**
   * The badge to the left of the title block.
   *
   * Optional to PASS, but the 36px column it sits in is reserved either way —
   * see the render. A header that ships without one keeps its title on the
   * column with the rest of the page instead of sliding 48px left.
   */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /**
   * The section's description. NOT rendered as a visible line any more — it is
   * the hover tooltip on the title, plus an `sr-only` copy so the information
   * stays in the accessibility tree for anyone who never hovers.
   *
   * ⚠️ NO COLOUR CLASSES IN HERE. Three sections carried a `text-gray-900`
   * count, from when this was grey caption text and the number needed darkening
   * against it. That colour is now at best redundant (the tooltip already sets
   * the ink) and at worst invisible, depending on the surface it lands on. Use
   * `font-semibold` / `tabular-nums` to pick a value out and let the colour
   * inherit.
   *
   * ⚠️ Several sections put LIVE STATE in here rather than a description —
   * "63 tasks in the current filter", "12 people · 57 pending tasks aging",
   * "Showing 5 of 12 people". Those numbers now cost a hover to read. If a
   * count needs to stay glanceable, it belongs in the title or the card, not
   * here.
   */
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
      {/* items-CENTER, not items-start. The icon was top-aligned to sit level
          with the first line of a two-line title-and-subtitle block; with the
          subtitle gone that block is one line shorter than the 36px badge, so
          top-aligning left the badge hanging below the title. */}
      <div className="flex min-w-0 items-center gap-3">
        {/* THE ICON COLUMN IS ALWAYS RESERVED, icon or no icon.
            
            This used to be `{icon && <span…>}`, so a section that shipped
            without a badge lost the column entirely and its title started 48px
            (36px badge + the gap-3) to the LEFT of every other title on the
            page. That is not a hypothetical: the Task Summary header was
            exactly that section, and being the FIRST heading down the page it
            made every section under it read as indented rather than itself as
            outdented. Fixing it by adding a badge fixed that one header; the
            next header to forget one would do it again. An empty span of the
            same width costs nothing and makes the column structural. */}
        <span className="size-9 shrink-0" aria-hidden={!icon}>
          {icon}
        </span>
        <div className="min-w-0">
          {/* text-xl, down from text-2xl. Eight of these run down one page and
              at 24px they competed with the numbers inside the cards — the data
              is the thing to read, the heading only has to label it. */}
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {/* THE DESCRIPTION IS A HOVER TOOLTIP, not a caption line.
                
                Eleven sections each carried a second, smaller line of grey text
                under the title, and stacked down one page they doubled the
                vertical cost of every heading while saying something most
                readers only need once. On hover, at the moment someone actually
                asks "what is this section?", it is still one gesture away.

                HoverTip rather than the native `title` attribute: it is the
                portal-based bubble the plan board already uses, so it wraps,
                reads at a normal size, and is never clipped by a scrolling
                parent — and it fires on FOCUS as well as hover, so the keyboard
                reaches it too. */}
            <HoverTip text={subtitle} className={subtitle ? "cursor-help" : undefined}>
              {title}
            </HoverTip>
          </h2>
          {/* The same text, always in the accessibility tree. A tooltip that
              only exists while a pointer is over it would otherwise delete the
              description outright for anyone not using one. */}
          {subtitle && <p className="sr-only">{subtitle}</p>}
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
