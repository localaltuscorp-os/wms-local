import { tierFor } from "@/lib/ambassadors/score";

/**
 * Partner Score ring — a compact SVG dial (0–100) tinted by tier band.
 * GPU/SVG only, no motion dependency; reduced-motion safe by construction.
 */
export function ScoreBadge({ score, size = 56 }: { score: number | null; size?: number }) {
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  const tier = tierFor(value);
  const stroke = size < 50 ? 5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const color =
    tier === "elite" ? "#B88A00" : tier === "gold" ? "#D98A1F" : "#7C7C8A";

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <span
        className="absolute font-bold tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui", fontSize: size < 50 ? 15 : 18 }}
      >
        {score == null ? "—" : value}
      </span>
    </div>
  );
}
