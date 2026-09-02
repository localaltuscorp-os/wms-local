import { Flame } from "lucide-react";

export function CriticalBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill"
      style={{
        background: "var(--color-red-bg)",
        color: "var(--color-red-deep)",
        border: "1px solid color-mix(in srgb, var(--color-red) 30%, transparent)",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      <Flame size={11} strokeWidth={2.4} />
      Critical
    </span>
  );
}
