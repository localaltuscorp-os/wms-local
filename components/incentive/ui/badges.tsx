import type { ReactNode } from "react";
import type { IncentiveGrade } from "@/lib/incentive/analytics/grading";
import { GRADE_TONE, toneFill, toneInk, type Tone } from "./tone";

/**
 * One badge shape for the whole module, at the design system's size (11px/700,
 * `rounded-pill`, `px-2 py-0.5`) with the `-deep` stop for ink.
 *
 * The status pill (`incentive-status-pill.tsx`) and the grade badge below are
 * both built on this, so a state can never read one way on the dashboard and
 * another on the requests list.
 */
export function IncentiveBadge({
  tone,
  children,
  title,
  size = "sm",
}: {
  tone: Tone;
  children: ReactNode;
  title?: string;
  /** `lg` is the team summary's scanning size. Default is the inline size. */
  size?: "sm" | "lg";
}) {
  return (
    <span
      title={title}
      className={
        size === "lg"
          ? "inline-flex min-w-[68px] items-center justify-center whitespace-nowrap rounded-pill px-3 py-1.5 text-[14px] font-bold tabular-nums"
          : "inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
      }
      style={{ background: toneFill(tone), color: toneInk(tone) }}
    >
      {children}
    </span>
  );
}

/**
 * A grade, or an em-dash when there is none.
 *
 * Grading itself is untouched — this only draws what `gradeFor` decided
 * (`lib/incentive/analytics/grading.ts`).
 */
export function GradeBadge({ grade }: { grade: IncentiveGrade | null }) {
  if (!grade) return <span className="text-ink-subtle">—</span>;
  const tone = GRADE_TONE[grade];
  return (
    <span
      data-grade={grade}
      className="inline-grid size-6 place-items-center rounded-lg text-[13px] font-bold tabular-nums"
      style={{ background: toneFill(tone), color: toneInk(tone) }}
    >
      {grade}
    </span>
  );
}
