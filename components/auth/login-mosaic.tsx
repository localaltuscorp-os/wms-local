import { POSTER_TILES } from "./login-posters";

/**
 * Full-bleed Canva-style poster wall behind the login card. Distributes
 * `POSTER_TILES` into vertical columns that drift slowly in alternating
 * directions (the content is rendered twice per column so the scroll loops
 * seamlessly), then dims the whole thing so the centred dark card pops. Pure
 * CSS animation — transform-only, paused under `prefers-reduced-motion`.
 *
 * Decorative only: `aria-hidden`, `pointer-events: none`, no tab stops.
 */

const COLUMN_COUNT = 6;
// Per-column drift: alternating direction + de-synced durations so the wall
// never visibly "lines up". Deterministic (no random) so SSR is stable.
const DRIFT = [62, 78, 54, 88, 70, 96]; // seconds

export function LoginMosaic() {
  const columns = Array.from({ length: COLUMN_COUNT }, (_, c) =>
    POSTER_TILES.filter((_, i) => i % COLUMN_COUNT === c),
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "#0c0807" }}>
      <style>{`
        @keyframes mosaicUp { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes mosaicDown { from { transform: translateY(-50%); } to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .mosaic-col-inner { animation: none !important; }
        }
      `}</style>

      {/* The wall — slightly oversized + lifted so drifting columns never reveal an edge. */}
      <div
        className="absolute"
        style={{
          inset: "-8% -4%",
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMN_COUNT}, minmax(0, 1fr))`,
          gap: 16,
          transform: "scale(1.06)",
          transformOrigin: "center",
        }}
      >
        {columns.map((tiles, c) => {
          const up = c % 2 === 0;
          return (
            <div key={c} style={{ overflow: "hidden" }}>
              <div
                className="mosaic-col-inner"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  // stagger each column's phase so they don't start aligned
                  marginTop: c % 3 === 1 ? "-90px" : c % 3 === 2 ? "-180px" : 0,
                  animation: `${up ? "mosaicUp" : "mosaicDown"} ${DRIFT[c]}s linear infinite`,
                  willChange: "transform",
                }}
              >
                {/* rendered twice → translateY(-50%) loops seamlessly */}
                {[...tiles, ...tiles].map((t, i) => (
                  <div key={`${t.id}-${i}`}>{t.el}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dim + brand vignette so the card reads clearly over the busy wall. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 62% at 50% 50%, rgba(8,5,4,0.86), rgba(8,5,4,0.62) 55%, rgba(8,5,4,0.42) 100%), linear-gradient(180deg, rgba(8,5,4,0.55), rgba(8,5,4,0.30) 30%, rgba(8,5,4,0.55))",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 78% 92%, rgba(225,6,0,0.20), transparent 60%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}
