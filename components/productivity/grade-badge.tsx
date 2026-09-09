import type { Grade } from "@/lib/productivity/calc";
import { GRADE_ORDER, GRADE_OUTLINE, gradeColor, gradeOnColor } from "@/lib/productivity/theme";

/**
 * THE grade mark. Every letter grade on every surface in Team Productivity —
 * KPI cards, the team table, the Full Report, the distribution legend — is this
 * component, so a grade cannot pick up a different tone by being rendered
 * somewhere else.
 *
 * It is a BADGE, not a panel. The module's rule is that colour is an accent and
 * never a surface, so the grade wears its hex as a small solid chip sized to the
 * letter and nothing larger — a card, a row or a section never takes the grade
 * colour as its background.
 *
 * CONTRAST: the chip is always the exact palette hex; the LETTER on top is
 * near-black on all five light grades and white only on F (see `gradeOnColor`).
 * Darkening the chip instead would have meant a grade rendering in a different
 * tone here than in the chart, which is exactly the drift this component exists
 * to prevent. A thin black outline rings every chip, so the pastel purple and
 * the sky blue keep a hard edge against a white card.
 *
 * `null` means UNGRADED — nothing was set to grade against — and draws a neutral
 * dash. It must never fall back to F: that marks someone down for missing setup
 * rather than missing work.
 */

type BadgeSize = "xs" | "sm" | "md" | "lg";

/** Chip geometry per size. `font` is the letter, `min` holds a column of badges
 *  to one width, and `ring` is the black outline — kept hairline-thin at every
 *  size, with only enough extra on `lg` that a 92px chip does not look unedged. */
const SIZING: Record<
  BadgeSize,
  { font: number; min: number; padX: number; padY: number; radius: number; ring: number }
> = {
  xs: { font: 11.5, min: 24, padX: 5, padY: 1, radius: 6, ring: 1 },
  sm: { font: 13, min: 30, padX: 7, padY: 2, radius: 7, ring: 1 },
  md: { font: 17, min: 40, padX: 9, padY: 3, radius: 9, ring: 1.25 },
  lg: { font: 40, min: 88, padX: 18, padY: 6, radius: 18, ring: 2 },
};

export function GradeBadge({
  grade,
  size = "sm",
  className = "",
}: {
  grade: Grade | null;
  size?: BadgeSize;
  className?: string;
}) {
  const s = SIZING[size];
  const common = {
    minWidth: s.min,
    padding: `${s.padY}px ${s.padX}px`,
    borderRadius: s.radius,
    fontSize: s.font,
    fontFamily: "var(--font-display), system-ui, sans-serif",
    letterSpacing: size === "lg" ? "-0.02em" : "0.01em",
    lineHeight: 1.15,
  } as const;

  if (!grade) {
    return (
      <span
        className={`inline-flex items-center justify-center font-black text-ink-subtle ${className}`}
        style={{
          ...common,
          background: "var(--color-surface-soft)",
          boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        }}
        title="Not graded — nothing was set to grade against"
      >
        —
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center font-black ${className}`}
      style={{
        ...common,
        background: gradeColor(grade),
        color: gradeOnColor(grade),
        // An INSET ring rather than a border: it draws inside the chip's own box,
        // so adding the outline cannot nudge the geometry of a table cell or a
        // row of badges that was laid out without it.
        boxShadow: `inset 0 0 0 ${s.ring}px ${GRADE_OUTLINE}`,
      }}
    >
      {grade}
    </span>
  );
}

/**
 * The legend that makes the palette readable — used beside the grade
 * distribution chart and anywhere a reader meets the colours cold.
 *
 * `counts` is optional: with it the legend doubles as the chart's data table
 * (which is what keeps the distribution accessible to anyone who cannot separate
 * the slices by colour), without it it is a plain key.
 */
export function GradeLegend({
  counts,
  grades = GRADE_ORDER,
  className = "",
}: {
  counts?: Partial<Record<Grade, number>>;
  grades?: readonly Grade[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 ${className}`}>
      {grades.map((g) => (
        <li key={g} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-sm"
            // Same black hairline the chips wear — without it the pastel purple
            // and sky blue swatches all but vanish at 10px on a white card.
            style={{ background: gradeColor(g), boxShadow: `inset 0 0 0 1px ${GRADE_OUTLINE}` }}
          />
          <span className="text-[12px] font-black text-ink-muted">
            {g}
            {counts ? (
              <span className="ml-1 tabular-nums font-black text-ink-strong">{counts[g] ?? 0}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
