import { Users2 } from "lucide-react";

/**
 * Shared hero for the People Allocation room, so its two pages carry one
 * identity. Orange, matching the module's hub card.
 */
const ORANGE = "#ea580c";
const ORANGE_DEEP = "#c2410c";

export function AllocationHero({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header
      className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
      style={{
        background: [
          `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ORANGE} 9%, transparent), transparent 55%)`,
          `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${ORANGE} 5%, transparent), transparent 52%)`,
          "rgba(255, 255, 255, 0.72)",
        ].join(", "),
        backdropFilter: "blur(14px) saturate(140%)",
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
      }}
    >
      <span
        className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
        style={{ background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})` }}
      >
        <Users2 size={13} strokeWidth={2.6} /> Hand-holding
      </span>
      <h1
        className="mt-3 text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(28px,3.2vw,42px)",
          letterSpacing: "-0.03em",
          lineHeight: 1.02,
        }}
      >
        {title}
      </h1>
      {/* One line — the subtitle is a single sentence and must not wrap. It may
          scroll on a narrow viewport rather than break onto a second row. */}
      <p className="mt-1.5 overflow-x-auto whitespace-nowrap text-[15px] font-medium text-ink-muted">{blurb}</p>
    </header>
  );
}
