import * as React from "react";

type Size = "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { px: number; fontSize: number }> = {
  sm: { px: 32, fontSize: 12 },
  md: { px: 40, fontSize: 14 },
  lg: { px: 56, fontSize: 18 },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Dark-circle avatar with bold white initials — the dashboard's
 * canonical "employee chip." Used everywhere a person is listed:
 * Status table, Aging Heatmap, Top Performers leaderboard, task rows.
 *
 * Slate-gradient fill so it stays brand-neutral and reads on any
 * surface. Pass `tone` to override with a channel color when ranking
 * matters (e.g. gold / silver / bronze on the podium).
 */
export function EmployeeAvatar({
  name,
  size = "md",
  background,
  className = "",
}: {
  name: string;
  size?: Size;
  /** Optional CSS background — defaults to a slate gradient. */
  background?: string;
  className?: string;
}) {
  const { px, fontSize } = SIZE_MAP[size];
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full text-white shrink-0 ${className}`}
      style={{
        width: px,
        height: px,
        background:
          background ?? "linear-gradient(135deg, #475569, #1f2937)",
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontWeight: 800,
        fontSize,
        letterSpacing: "-0.01em",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
      }}
    >
      {initials(name)}
    </span>
  );
}
