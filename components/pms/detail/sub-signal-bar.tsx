/**
 * A single labelled mini-bar for a pillar sub-signal (e.g. weekly / incentive,
 * attended / given / selfLearn / share, dcc / checklist). Server-renderable —
 * no client interactivity. `rate` is 0..1 or null (null = no data → muted track).
 */
export function SubSignalBar({
  label,
  rate,
  accent,
  accentDeep,
}: {
  label: string;
  rate: number | null;
  accent: string;
  accentDeep: string;
}) {
  const pct = rate == null ? null : Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[13px] font-semibold text-ink-muted">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-soft">
        <div
          className="absolute inset-y-0 left-0 rounded-pill"
          style={{
            width: `${pct ?? 0}%`,
            background:
              pct == null ? "var(--color-hairline-strong)" : `linear-gradient(90deg, ${accent}, ${accentDeep})`,
          }}
        />
      </div>
      <span
        className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums"
        style={{ color: pct == null ? "var(--color-ink-subtle)" : accentDeep }}
      >
        {pct == null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}
