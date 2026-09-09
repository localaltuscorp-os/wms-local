import { Target } from "lucide-react";

/**
 * Small "Weekly Goal" chip in the Altus accent, used wherever a weekly goal is
 * surfaced inside the Tasks views (list group, kanban card, My Day) so goals
 * are always visually distinct from real tasks. Presentational only.
 */
export function WeeklyGoalBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 ${className}`}
      style={{
        background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
        color: "var(--color-altus-red-deep)",
        border:
          "1px solid color-mix(in srgb, var(--color-altus-red) 32%, transparent)",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
      title="A weekly goal — open the Weekly Goals workspace to edit"
    >
      <Target size={11} strokeWidth={2.4} />
      Weekly Goal
    </span>
  );
}
