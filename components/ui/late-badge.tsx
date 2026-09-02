/**
 * Small amber "Late" chip shown next to a Done status when the task was
 * completed after its due date. Presentational only — callers decide when to
 * render it (see lib/task-late.ts → isDoneLate).
 */
export function LateBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${className}`}
      style={{
        background: "color-mix(in srgb, var(--color-amber) 18%, transparent)",
        color: "var(--color-amber-deep)",
        border: "1px solid color-mix(in srgb, var(--color-amber) 38%, transparent)",
        lineHeight: 1.2,
      }}
      title="Completed after its due date"
    >
      Late
    </span>
  );
}
