"use client";

/**
 * Cinematic brand backdrop for /login. (rev 3)
 *
 * Two elements loop a slow ballet across the viewport: the Altus
 * brand-mark on the LEFT, the italic "Altus Corp." display wordmark
 * on the RIGHT. Both fade in at centre, slide apart, park at the
 * edges, then drift back and fade out. Designed to read as ambient
 * video — the form card is the hero.
 *
 * Uses `/logo-mark.png` (the dedicated white-text variant of the
 * brand mark) rather than the legacy `/logo.png` which had grey
 * wordmark baked in. Because the new asset is already correctly
 * coloured for a dark canvas, we render it as a single image with
 * no masking overlay — simpler, sharper, no compositing tricks.
 *
 * The right lane stacks "Altus" / "Corp." on two lines so neither
 * word gets clipped at the viewport edge. The left lane parks at
 * 40vw (further than the right's 28vw) to read as the dominant
 * brand presence behind the form card.
 *
 * Respects `prefers-reduced-motion`: the orbit animations are
 * disabled and the elements snap to their parked positions.
 */
export function AnimatedBrandBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* ── Brand-mark lane (orbits to the LEFT) ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="altus-brand-mark"
          style={{ width: "clamp(220px, 24vw, 420px)" }}
        >
          {/* The dedicated white-font variant of the brand mark — already
              tuned for a dark canvas, so we render it raw with no
              overlay/masking trickery. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              userSelect: "none",
              filter:
                "drop-shadow(0 24px 80px rgba(225, 6, 0, 0.30)) drop-shadow(0 0 40px rgba(0, 0, 0, 0.35))",
            }}
          />
        </div>
      </div>

      {/* ── Italic-wordmark lane (orbits to the RIGHT) ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="altus-brand-wordmark">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(72px, 11vw, 200px)",
              lineHeight: 0.92,
              letterSpacing: "-0.035em",
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.96)",
              textShadow:
                "0 24px 80px rgba(0, 0, 0, 0.55), 0 2px 0 rgba(255, 255, 255, 0.06)",
              whiteSpace: "nowrap",
            }}
          >
            {/* Stacked so the wordmark never spills past the viewport
                edge — "Altus" on top, "Corp." below. */}
            <div>Altus</div>
            <div
              style={{
                background:
                  "linear-gradient(110deg, #F4554D, #E10600 50%, #A80400)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Corp.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        /*
         * Loop choreography (22s):
         *   0%   — invisible at centre
         *   8%   — faded in at centre, overlapping
         *   28%  — fully split, parked at outer edges
         *   70%  — still parked (a long, calm rest — the "settled" feel)
         *   88%  — drifted back to centre
         *   100% — faded out, ready to restart
         *
         * Brand-mark parks at the midpoint between the viewport's left
         * edge and the form card's left edge. Card max-width is 660px
         * centred, so the empty left strip spans 0 → (W-660)/2 and its
         * midpoint sits at (W-660)/4. The logo starts at viewport
         * centre (W/2), so the translate needed to land its centre
         * exactly at that midpoint is:
         *   (W-660)/4 − W/2  =  −(W + 660)/4  =  −25vw − 165px
         * Using calc() makes the math viewport-agnostic — the logo
         * lands in the correct spot on a 1280, 1440, 1920, or 2560
         * screen with no per-breakpoint tuning.
         */
        @keyframes altus-mark-orbit {
          0%   { transform: translateX(0)                       scale(0.94); opacity: 0; }
          8%   { transform: translateX(0)                       scale(0.96); opacity: 0.55; }
          28%  { transform: translateX(calc(-25vw - 165px))     scale(1);    opacity: 0.95; }
          70%  { transform: translateX(calc(-25vw - 165px))     scale(1);    opacity: 0.95; }
          88%  { transform: translateX(0)                       scale(0.96); opacity: 0.55; }
          100% { transform: translateX(0)                       scale(0.94); opacity: 0; }
        }
        /* Symmetric to the brand-mark — parks at the midpoint between
           the card's RIGHT edge and the viewport's right edge:
             (3W + 660)/4 − W/2  =  (W + 660)/4  =  +25vw + 165px
           Same calc() pattern as the left lane, just positive. */
        @keyframes altus-wordmark-orbit {
          0%   { transform: translateX(0)                       scale(0.94); opacity: 0; }
          8%   { transform: translateX(0)                       scale(0.96); opacity: 0.40; }
          28%  { transform: translateX(calc(25vw + 165px))      scale(1);    opacity: 0.70; }
          70%  { transform: translateX(calc(25vw + 165px))      scale(1);    opacity: 0.70; }
          88%  { transform: translateX(0)                       scale(0.96); opacity: 0.40; }
          100% { transform: translateX(0)                       scale(0.94); opacity: 0; }
        }
        /* Gentle vertical bob layered on the inner element so even
           during the long parked phase nothing feels frozen. */
        @keyframes altus-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }

        .altus-brand-mark {
          animation: altus-mark-orbit 22s cubic-bezier(0.45, 0, 0.25, 1) infinite;
          will-change: transform, opacity;
        }
        .altus-brand-wordmark {
          animation: altus-wordmark-orbit 22s cubic-bezier(0.45, 0, 0.25, 1) infinite;
          will-change: transform, opacity;
        }
        .altus-brand-mark > :global(img) {
          animation: altus-bob 6s ease-in-out infinite;
        }
        .altus-brand-wordmark > :global(div) {
          animation: altus-bob 6s ease-in-out infinite 0.8s;
        }

        @media (prefers-reduced-motion: reduce) {
          .altus-brand-mark,
          .altus-brand-wordmark,
          .altus-brand-mark > :global(img),
          .altus-brand-wordmark > :global(div) {
            animation: none;
          }
          .altus-brand-mark {
            transform: translateX(calc(-25vw - 165px));
            opacity: 0.95;
          }
          .altus-brand-wordmark {
            transform: translateX(calc(25vw + 165px));
            opacity: 0.7;
          }
        }

        /* Tighter parking + smaller scale on phones. */
        @media (max-width: 768px) {
          .altus-brand-mark {
            animation-name: altus-mark-orbit-mobile;
          }
          .altus-brand-wordmark {
            animation-name: altus-wordmark-orbit-mobile;
          }
        }
        @keyframes altus-mark-orbit-mobile {
          0%   { transform: translateX(0)     scale(0.92); opacity: 0; }
          8%   { transform: translateX(0)     scale(0.94); opacity: 0.5; }
          28%  { transform: translateX(-30vw) scale(1);    opacity: 0.85; }
          70%  { transform: translateX(-30vw) scale(1);    opacity: 0.85; }
          88%  { transform: translateX(0)     scale(0.94); opacity: 0.5; }
          100% { transform: translateX(0)     scale(0.92); opacity: 0; }
        }
        @keyframes altus-wordmark-orbit-mobile {
          0%   { transform: translateX(0)     scale(0.92); opacity: 0; }
          8%   { transform: translateX(0)     scale(0.94); opacity: 0.30; }
          28%  { transform: translateX(22vw)  scale(1);    opacity: 0.55; }
          70%  { transform: translateX(22vw)  scale(1);    opacity: 0.55; }
          88%  { transform: translateX(0)     scale(0.94); opacity: 0.30; }
          100% { transform: translateX(0)     scale(0.92); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
