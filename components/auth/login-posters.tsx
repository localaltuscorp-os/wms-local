import Image from "next/image";
import type { ReactNode } from "react";

/**
 * The login mosaic's tile library — a Canva-style wall of distinct "posters",
 * all on-brand for Altus Corp / WMS. A mix of (a) the real Productivity-Shastra
 * marketing images and (b) hand-built SVG/CSS tiles that evoke the app itself:
 * Kanban boards, task lists, KPI cards, charts, attendance grids, and bold
 * Shastra slogans. Pure markup (no external image generation); the real photos
 * go through next/image so the heavy posters ship as light optimized tiles.
 *
 * `POSTER_TILES` is consumed by `login-mosaic.tsx`, which distributes them into
 * drifting columns. Each entry carries a base `h` (px) so the columns build a
 * varied masonry rhythm.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";
const RED_LIGHT = "#F4554D";
const INK = "#17120F";
const PAPER = "#F6F3EF";
const GREEN = "#16A34A";
const AMBER = "#F59E0B";
const BLUE = "#3B82F6";

const DISPLAY = "var(--font-display), Georgia, serif";
const SANS = "var(--font-sans), system-ui, sans-serif";
const MONO = "var(--font-mono-display), ui-monospace, monospace";

function Tile({
  h,
  bg,
  children,
  pad = 18,
}: {
  h: number;
  bg: string;
  children: ReactNode;
  pad?: number;
}) {
  return (
    <div
      style={{
        height: h,
        background: bg,
        borderRadius: 14,
        padding: pad,
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 10px 30px -14px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  );
}

/** The real Altus logo mark (transparent PNG), sized to taste. */
function Triangle({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  const w = Math.round(size * 0.88);
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      aria-hidden
      width={w}
      height={size}
      style={{
        objectFit: "contain",
        filter: glow ? "drop-shadow(0 4px 14px rgba(225,6,0,0.45))" : undefined,
      }}
    />
  );
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.04em",
        background: `color-mix(in srgb, ${tone} 16%, transparent)`,
        color: tone,
        fontFamily: SANS,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tone }} />
      {children}
    </span>
  );
}

// ── Slogan / type posters ────────────────────────────────────────────────

function SloganShastra() {
  return (
    <Tile h={300} bg={`linear-gradient(160deg, #1d1411, ${INK})`}>
      <Triangle size={46} />
      <div style={{ marginTop: 18, fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 30, lineHeight: 1.02, letterSpacing: "-0.02em" }}>
        PRODUCTIVITY
        <br />
        <span style={{ color: RED_LIGHT }}>SHASTRA</span>
      </div>
      <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)" }}>
        SYSTEM · DRIVEN · OPS
      </div>
    </Tile>
  );
}

function SloganDouble() {
  return (
    <Tile h={360} bg={`linear-gradient(150deg, ${RED}, ${RED_DEEP})`}>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 27, lineHeight: 1.06, letterSpacing: "-0.01em" }}>
        DOUBLE YOUR<br />BUSINESS.
      </div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontWeight: 800, color: "rgba(255,255,255,0.8)", fontSize: 16, lineHeight: 1.15 }}>
        Without doubling your involvement.
      </div>
      <div style={{ position: "absolute", right: -20, bottom: -24, opacity: 0.18 }}>
        <Triangle size={150} glow={false} />
      </div>
      <div style={{ position: "absolute", left: 18, bottom: 16, fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.7)" }}>
        THE COHORT OF 25
      </div>
    </Tile>
  );
}

function SloganFreedom() {
  return (
    <Tile h={230} bg="linear-gradient(160deg,#201614,#0f0b0a)">
      <div style={{ fontFamily: DISPLAY, fontStyle: "italic", color: "#fff", fontSize: 30, lineHeight: 1.05 }}>
        The Freedom<br />Engine
      </div>
      <div style={{ marginTop: 12, height: 3, width: 54, background: RED, borderRadius: 2 }} />
      <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.45 }}>
        A business that runs without you doing the work.
      </div>
    </Tile>
  );
}

function SloganDelegate() {
  return (
    <Tile h={210} bg={PAPER}>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: INK, fontSize: 30, lineHeight: 1.0, letterSpacing: "-0.02em" }}>
        DELEGATE.
        <br />
        <span style={{ color: RED }}>DON&apos;T DO.</span>
      </div>
      <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 12, color: "#6b5e57", fontWeight: 600 }}>
        Transfer ownership, not just tasks.
      </div>
    </Tile>
  );
}

function SloganOwnDay() {
  return (
    <Tile h={250} bg="linear-gradient(150deg,#2a0e0c,#120a09)">
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.24em", color: RED_LIGHT }}>EVERY · MORNING</div>
      <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 33, lineHeight: 0.98, letterSpacing: "-0.02em" }}>
        OWN<br />YOUR<br />DAY.
      </div>
    </Tile>
  );
}

function SloganHours() {
  return (
    <Tile h={250} bg={PAPER}>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: INK, fontSize: 23, lineHeight: 1.05 }}>
        SAVE <span style={{ color: RED }}>2–3 HRS</span> DAILY
      </div>
      <div style={{ marginTop: 14, display: "grid", gap: 9 }}>
        {["Top 3 priorities", "No reverse delegation", "Daily compliance"].map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, background: RED, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#473d38", fontWeight: 600 }}>{t}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function StatGrowth() {
  return (
    <Tile h={200} bg={`linear-gradient(150deg, ${RED_LIGHT}, ${RED_DEEP})`}>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 72, lineHeight: 0.9, letterSpacing: "-0.04em" }}>2×</div>
      <div style={{ marginTop: 6, fontFamily: SANS, fontWeight: 800, color: "rgba(255,255,255,0.9)", fontSize: 14 }}>growth in 90 days</div>
    </Tile>
  );
}

// ── App-UI mockup tiles ──────────────────────────────────────────────────

function KanbanMock() {
  const cols: [string, string, number][] = [
    ["TO DO", "#64748b", 3],
    ["DOING", AMBER, 2],
    ["DONE", GREEN, 2],
  ];
  return (
    <Tile h={250} bg="#15110f" pad={14}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>KANBAN</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {cols.map(([label, tone, n]) => (
          <div key={label} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontFamily: SANS, fontSize: 8.5, fontWeight: 800, color: tone, letterSpacing: "0.06em" }}>{label}</div>
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} style={{ height: 30, borderRadius: 6, background: "rgba(255,255,255,0.06)", borderLeft: `3px solid ${tone}`, padding: "5px 6px" }}>
                <div style={{ height: 4, width: "78%", borderRadius: 3, background: "rgba(255,255,255,0.22)" }} />
                <div style={{ height: 4, width: "50%", borderRadius: 3, background: "rgba(255,255,255,0.12)", marginTop: 4 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Tile>
  );
}

function TaskListMock() {
  const rows: [string, string, string][] = [
    ["AS", GREEN, "Done"],
    ["MV", AMBER, "Pending"],
    ["HV", RED, "Critical"],
    ["DK", BLUE, "Review"],
  ];
  return (
    <Tile h={235} bg={PAPER} pad={14}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 900, color: INK, marginBottom: 10, letterSpacing: "0.02em" }}>TASKS · TODAY</div>
      <div style={{ display: "grid", gap: 9 }}>
        {rows.map(([ini, tone, label], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, background: INK, color: "#fff", fontFamily: SANS, fontSize: 9.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{ini}</span>
            <span style={{ flex: 1, display: "grid", gap: 4 }}>
              <span style={{ height: 5, width: "70%", borderRadius: 3, background: "#d8cfc8" }} />
              <span style={{ height: 4, width: "44%", borderRadius: 3, background: "#e7e0da" }} />
            </span>
            <Pill tone={tone}>{label}</Pill>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function KpiCluster() {
  const kpis: [string, string, string][] = [
    ["286", "PENDING", AMBER],
    ["77", "DONE", GREEN],
    ["60", "CRITICAL", RED],
    ["15", "URGENT", "#f97316"],
  ];
  return (
    <Tile h={210} bg="#14100e" pad={14}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {kpis.map(([n, l, tone]) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 9, padding: "10px 11px", borderTop: `3px solid ${tone}` }}>
            <div style={{ fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 26, lineHeight: 1, letterSpacing: "-0.03em" }}>{n}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.14em", color: tone, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </Tile>
  );
}

function DonutTile() {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Tile h={210} bg={PAPER} pad={16}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 900, color: INK, marginBottom: 8 }}>ON TRACK</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width={92} height={92} viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={r} fill="none" stroke="#e7ded7" strokeWidth="13" />
          <circle cx="46" cy="46" r={r} fill="none" stroke={RED} strokeWidth="13" strokeLinecap="round" strokeDasharray={`${c * 0.72} ${c}`} transform="rotate(-90 46 46)" />
          <text x="46" y="51" textAnchor="middle" fontFamily={SANS} fontWeight="900" fontSize="19" fill={INK}>72%</text>
        </svg>
        <div style={{ display: "grid", gap: 8 }}>
          <Pill tone={RED}>On track</Pill>
          <Pill tone={AMBER}>At risk</Pill>
          <Pill tone={GREEN}>Approved</Pill>
        </div>
      </div>
    </Tile>
  );
}

function BarsTile() {
  const bars = [40, 62, 48, 80, 58, 92, 70];
  return (
    <Tile h={200} bg="linear-gradient(160deg,#1c1310,#0f0b0a)" pad={14}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>WEEKLY VELOCITY</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 110 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: `${b}%`, borderRadius: "4px 4px 0 0", background: i === 5 ? RED : "rgba(244,85,77,0.45)" }} />
        ))}
      </div>
    </Tile>
  );
}

function AttendanceTile() {
  return (
    <Tile h={235} bg={PAPER} pad={14}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 900, color: INK, marginBottom: 10 }}>ATTENDANCE</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {Array.from({ length: 28 }).map((_, i) => {
          const on = i % 6 !== 4 && i % 7 !== 6;
          return <span key={i} style={{ aspectRatio: "1", borderRadius: 4, background: on ? "color-mix(in srgb, #16A34A 80%, white)" : "#ecdfe0" }} />;
        })}
      </div>
      <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 11.5, color: "#4a403b", fontWeight: 700 }}>
        Checked in <span style={{ color: GREEN }}>10:34 am</span>
      </div>
    </Tile>
  );
}

function PayslipTile() {
  return (
    <Tile h={205} bg="linear-gradient(160deg,#1a1310,#100b09)" pad={16}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}>PAYSLIP · JUN</div>
      <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Net payable</div>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: "#fff", fontSize: 34, letterSpacing: "-0.02em" }}>₹1,24,800</div>
      <div style={{ marginTop: 12, height: 1, background: "rgba(255,255,255,0.1)" }} />
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>
        <span>Payable days 26</span>
        <Pill tone={GREEN}>Disbursed</Pill>
      </div>
    </Tile>
  );
}

function WordmarkTile() {
  return (
    <Tile h={150} bg={PAPER}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: "100%" }}>
        <Triangle size={38} glow={false} />
        <div style={{ fontFamily: MONO, fontWeight: 800, color: INK, fontSize: 17, letterSpacing: "0.16em" }}>ALTUS<br />CORP</div>
      </div>
    </Tile>
  );
}

function BrandMarkTile() {
  return (
    <Tile h={190} bg="radial-gradient(120% 90% at 50% 20%, #2a0f0c, #0d0807)">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Triangle size={92} />
      </div>
    </Tile>
  );
}

function QuoteTile() {
  return (
    <Tile h={215} bg={`linear-gradient(155deg, ${RED_DEEP}, #2a0907)`} pad={18}>
      <div style={{ fontFamily: DISPLAY, fontStyle: "italic", color: "#fff", fontSize: 21, lineHeight: 1.3 }}>
        “Scale ethically &amp; sustainably — in a time-bound manner.”
      </div>
      <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)" }}>CA MANAN VASA</div>
    </Tile>
  );
}

function SyllabusTile() {
  return (
    <Tile h={245} bg={PAPER} pad={15}>
      <div style={{ fontFamily: SANS, fontWeight: 900, color: RED, fontSize: 13, letterSpacing: "0.02em" }}>DETAILED SYLLABUS</div>
      <div style={{ marginTop: 8, fontFamily: SANS, fontWeight: 900, color: INK, fontSize: 15, lineHeight: 1.15 }}>Effective Delegation Shastra</div>
      <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
        {["Capture all work", "Define ownership", "Daily compliance", "No responsibility leakage"].map((t) => (
          <div key={t} style={{ display: "flex", gap: 7, alignItems: "center", fontFamily: SANS, fontSize: 11.5, color: "#5a4f49", fontWeight: 600 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: RED }} />
            {t}
          </div>
        ))}
      </div>
    </Tile>
  );
}

// ── Real marketing posters (next/image-optimized) ────────────────────────

function BrandImage({ n, h }: { n: number; h: number }) {
  return (
    <div style={{ height: h, borderRadius: 14, overflow: "hidden", position: "relative", boxShadow: "0 10px 30px -14px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <Image
        src={`/login/brand-${n}.png`}
        alt=""
        aria-hidden
        fill
        sizes="(max-width: 768px) 45vw, 18vw"
        style={{ objectFit: "cover", objectPosition: "top center" }}
      />
    </div>
  );
}

export interface PosterTile {
  id: string;
  el: ReactNode;
}

/** The full deck, deliberately ordered so neighbours differ in tone + type. */
export const POSTER_TILES: PosterTile[] = [
  { id: "shastra", el: <SloganShastra /> },
  { id: "kanban", el: <KanbanMock /> },
  { id: "img2", el: <BrandImage n={2} h={330} /> },
  { id: "double", el: <SloganDouble /> },
  { id: "tasks", el: <TaskListMock /> },
  { id: "img4", el: <BrandImage n={4} h={300} /> },
  { id: "kpi", el: <KpiCluster /> },
  { id: "freedom", el: <SloganFreedom /> },
  { id: "donut", el: <DonutTile /> },
  { id: "img6", el: <BrandImage n={6} h={340} /> },
  { id: "delegate", el: <SloganDelegate /> },
  { id: "bars", el: <BarsTile /> },
  { id: "attendance", el: <AttendanceTile /> },
  { id: "img3", el: <BrandImage n={3} h={330} /> },
  { id: "ownday", el: <SloganOwnDay /> },
  { id: "payslip", el: <PayslipTile /> },
  { id: "brandmark", el: <BrandMarkTile /> },
  { id: "img1", el: <BrandImage n={1} h={200} /> },
  { id: "hours", el: <SloganHours /> },
  { id: "quote", el: <QuoteTile /> },
  { id: "growth", el: <StatGrowth /> },
  { id: "syllabus", el: <SyllabusTile /> },
  { id: "img5", el: <BrandImage n={5} h={320} /> },
  { id: "wordmark", el: <WordmarkTile /> },
];
