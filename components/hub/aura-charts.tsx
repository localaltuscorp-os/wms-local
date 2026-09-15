import type { Donut as DonutData, MyWorkShape, Slice } from "@/lib/queries/aura-dashboard";

/**
 * The Aura data visuals — donut, work-shape bloom, intensity strip.
 *
 * All three are INLINE SVG drawn on the Aura palette, per the design language:
 * "charts are drawn as inline SVG on the same palette, never in a chart
 * library's default colours". The geometry is ported one-for-one from the
 * reference implementation in `.claude/skills/aura/reference/`.
 *
 * SERVER COMPONENTS — no "use client", no chart library, nothing to hydrate.
 * Every interaction the reference has is pure CSS (`app/aura.css` fades the
 * unhovered donut slices and lifts the hovered one), and the tooltips are
 * native `<title>` elements. That matters here: this is the post-login landing,
 * and a charting library would be the largest thing on it.
 */

/* ─────────────────────────────── donut ──────────────────────────────────── */

/**
 * One donut segment as an SVG path: outer arc clockwise, inner arc back.
 *
 * `w` is the ring thickness, `a0`/`a1` are radians. The `large-arc` flag has to
 * be computed rather than fixed — a single-slice donut sweeps more than π and
 * renders as a thin sliver without it.
 */
function arc(cx: number, cy: number, r: number, w: number, a0: number, a1: number): string {
  const at = (a: number, rad: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const ro = r;
  const ri = r - w;
  const [x1, y1] = at(a0, ro);
  const [x2, y2] = at(a1, ro);
  const [x3, y3] = at(a1, ri);
  const [x4, y4] = at(a0, ri);
  return `M${x1} ${y1}A${ro} ${ro} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${ri} ${ri} 0 ${big} 0 ${x4} ${y4}Z`;
}

/** A full ring, for the one-slice case where an arc would leave a seam. */
function ring(cx: number, cy: number, r: number, w: number): string {
  const ri = r - w;
  return (
    `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z` +
    `M${cx - ri} ${cy}A${ri} ${ri} 0 1 0 ${cx + ri} ${cy}A${ri} ${ri} 0 1 0 ${cx - ri} ${cy}Z`
  );
}

export function AuraDonut({ data, title }: { data: DonutData; title: string }) {
  const total = data.slices.reduce((s, d) => s + d.value, 0);

  return (
    <article className="aura-glass aura-chart">
      <h2 className="aura-h2">{title}</h2>
      <div className="aura-note">{data.note}</div>
      <div className="aura-donut-wrap">
        <div className="aura-donut">
          {total > 0 ? (
            <svg viewBox="0 0 132 132" role="img" aria-label={`${title}: ${data.note}`}>
              {renderSlices(data.slices, total)}
            </svg>
          ) : (
            <svg viewBox="0 0 132 132" aria-hidden>
              <path d={ring(66, 66, 60, 17)} fill="rgba(10,15,34,.08)" fillRule="evenodd" />
            </svg>
          )}
          <div className="aura-donut-mid">
            <b>{data.centre.big}</b>
            <em>{data.centre.small}</em>
          </div>
        </div>
        <div className="aura-legend">
          {data.slices.length > 0 ? (
            data.slices.map((d) => (
              <div key={d.key}>
                <i style={{ background: d.colour }} aria-hidden />
                <span>{d.key}</span>
                <b>{d.label ?? d.value}</b>
              </div>
            ))
          ) : (
            <div>
              <i style={{ background: "rgba(10,15,34,.16)" }} aria-hidden />
              <span>Nothing to show yet</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function renderSlices(slices: Slice[], total: number) {
  // A lone slice is a whole ring: an arc from 0 to 2π-gap leaves a visible
  // notch that reads as missing data rather than as 100%.
  if (slices.length === 1) {
    const only = slices[0]!;
    return (
      <path d={ring(66, 66, 60, 17)} fill={only.colour} fillRule="evenodd">
        <title>{`${only.key} — ${only.label ?? only.value}`}</title>
      </path>
    );
  }
  let a = 0;
  return slices.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const path = arc(66, 66, 60, 17, a, a + sweep - 0.035);
    a += sweep;
    return (
      <path key={d.key} d={path} fill={d.colour}>
        <title>{`${d.key} — ${d.label ?? d.value}`}</title>
      </path>
    );
  });
}

/* ──────────────────────────── work-shape bloom ──────────────────────────── */

/*
 * BLOOM GEOMETRY, and why these numbers and not the reference's.
 *
 * The hub has to hold two lines — "35h" over "this week" — and the reference's
 * 26-unit circle renders at 38px once its viewBox is scaled down to 176, which
 * is narrower than the words. So the hub grew to 36 and the petals start 38 out
 * instead of 30, with their length range trimmed to keep the outer edge where
 * it was.
 *
 * The viewBox is SQUARE and centred exactly on (84, 84). That matters: SVG
 * scales uniformly and centres the leftover, so a non-square viewBox would put
 * the drawing's centre a few pixels off the element's — and the hub label, which
 * is an absolutely-positioned div centred on the ELEMENT, would sit off the
 * circle it belongs in. 120 units of half-width clears both the longest petal
 * (38 + 62 = 100) and the day letters above it (-33 at the highest ascender).
 */
const CX = 84;
const CY = 84;
const HUB_R = 36;
const GAP_IN = 38;
const PETAL_MIN = 18;
const PETAL_RANGE = 44;
const VIEW_BOX = "-36 -36 240 240";

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * YOUR WORK SHAPE — one rounded petal per day, its length proportional to the
 * hours actually worked that day, radiating from a hub that holds the week's
 * total. Heavy days take the red gradient, quiet days blue→teal.
 *
 * This is the design language's own idea, and the reason it is worth the code:
 * "a radial signature built from real behaviour… it says *this is your shape*
 * in a way a bar chart can't". The numbers come from attendance punches, so it
 * is a record of when you were actually at work.
 *
 * The viewBox is padded well past the drawn extents because the counter-rotated
 * day letters sit further out than the petals do and would otherwise clip at
 * the corners — see the geometry note above the constants.
 */
export function AuraBloom({ shape }: { shape: MyWorkShape }) {
  const max = Math.max(...shape.days.map((d) => d.minutes), 1);
  const step = 360 / shape.days.length;

  return (
    <article className="aura-glass aura-chart">
      <h2 className="aura-h2">Your work shape</h2>
      <div className="aura-note">Built from when you actually punched in, Mon–Sat</div>
      <div className="aura-bloom-wrap">
        <div className="aura-bloom">
          <svg
            viewBox={VIEW_BOX}
            width="176"
            height="176"
            role="img"
            aria-label={`Hours worked each day this week. ${shape.days
              .map((d) => `${d.letter}: ${hm(d.minutes)}`)
              .join(", ")}`}
          >
            <defs>
              <linearGradient id="aura-petal-hot" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#ff6a3d" />
                <stop offset="1" stopColor="#d81f12" />
              </linearGradient>
              <linearGradient id="aura-petal-cool" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#7f9bff" />
                <stop offset="1" stopColor="#5ce0cf" />
              </linearGradient>
            </defs>
            {shape.days.map((d, i) => {
              const ratio = d.minutes / max;
              const len = PETAL_MIN + ratio * PETAL_RANGE;
              // The reference offsets this by -90°, which puts the first day at 9
              // o'clock. Monday reads better at the top with the week running
              // clockwise from there, which is what `i * step` gives — the rects
              // are already drawn above the centre, so index 0 needs no rotation.
              const rot = i * step;
              const hot = ratio > 0.85 && d.minutes > 0;
              const labelY = CY - len - GAP_IN - 9;
              return (
                <g key={d.ymd} transform={`rotate(${rot} ${CX} ${CY})`}>
                  <rect
                    x={CX - 11}
                    y={CY - len - GAP_IN}
                    width={22}
                    height={len}
                    rx={11}
                    fill={
                      d.minutes === 0
                        ? "rgba(10,15,34,.10)"
                        : `url(#aura-petal-${hot ? "hot" : "cool"})`
                    }
                    opacity={d.minutes === 0 ? 1 : 0.45 + ratio * 0.5}
                  >
                    <title>{`${d.letter} — ${d.minutes === 0 ? "no punch" : hm(d.minutes)}`}</title>
                  </rect>
                  <text
                    x={CX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#39415f"
                    transform={`rotate(${-rot} ${CX} ${labelY})`}
                  >
                    {d.letter}
                  </text>
                </g>
              );
            })}
            <circle
              cx={CX}
              cy={CY}
              r={HUB_R}
              fill="rgba(255,255,255,.7)"
              stroke="rgba(255,255,255,.9)"
            />
          </svg>
          {/* Whole hours only. The hub sits inside a 26-unit circle — roughly
              38px once the viewBox is scaled to 176 — and a full "35h 10m"
              simply runs out over the petals. The exact figure is a few lines
              below in the description and again in the attendance caption. */}
          <div className="aura-bloom-hub">
            <b>{Math.round(shape.totalMinutes / 60)}h</b>
            <em>this week</em>
          </div>
        </div>

        <div className="aura-bloom-read">
          <div className="aura-tagline">{shape.tagline}</div>
          <p>{shape.description}</p>
          <AuraHourStrip load={shape.hourLoad} />
          <div className="aura-hours-cap">
            <span>7 AM</span>
            <span>1 PM</span>
            <span>8 PM</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * The intensity strip — one cell per hour from 7 AM to 8 PM, opacity by load.
 * A footnote under the bloom: the bloom says which DAYS, this says which HOURS.
 */
export function AuraHourStrip({ load }: { load: number[] }) {
  return (
    <div className="aura-hours" aria-hidden>
      {load.map((v, i) => (
        <i
          key={i}
          style={{
            background: `linear-gradient(180deg, rgba(79,124,247,${(v * 0.35).toFixed(2)}), rgba(216,31,18,${(v * 0.55).toFixed(2)}))`,
          }}
        />
      ))}
    </div>
  );
}
