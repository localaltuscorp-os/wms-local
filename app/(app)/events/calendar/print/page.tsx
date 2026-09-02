import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { requireEventsAccess } from "@/lib/monthly-events/access";
import { formatDate } from "@/lib/format";
import {
  getMonthEvents,
  listCategories,
} from "@/lib/queries/monthly-events";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  SLOTS_PER_DAY,
  minToLabel,
} from "@/lib/monthly-events/types";
import type { CalendarEvent, EventCategory } from "@/lib/monthly-events/types";
import { PrintTrigger } from "./print-trigger";

/**
 * Print-optimised month grid (design §9). A static, non-interactive mirror of
 * the calendar hero — stacked weekly time-grid bands (rows = 30-min slots
 * 07:00–21:00, cols = Mon–Sun) with coloured event blocks, all-day
 * banners and a category legend. The @media print block (inline <style>, scoped
 * to `.me-print`, NOT app/globals.css) sets A4 landscape, `print-color-adjust:
 * exact` so category colours survive, and `break-inside:avoid` per week band.
 *
 * Self-contained on purpose — it does NOT import the interactive dnd-kit grid
 * (that's the calendar agent's surface and has no print variant).
 */
export const dynamic = "force-dynamic";

// Print geometry — px per 30-min slot. 28 slots × PX ≈ one A4-landscape band.
const SLOT_PX = 17;
const BAND_H = SLOTS_PER_DAY * SLOT_PX;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Black or white text for a background hex, by relative luminance. */
function readableText(hex: string): string {
  const c = hex.replace(/[^0-9a-fA-F]/g, "");
  if (c.length < 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? "#1a1a1a" : "#ffffff";
}

/** Current month "YYYY-MM" in IST. */
function currentMonthIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 7);
}

interface PositionedEvent {
  ev: CalendarEvent;
  color: string;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Lane-pack a day's timed events so overlaps render side-by-side. */
function layoutDay(events: CalendarEvent[], color: (e: CalendarEvent) => string): PositionedEvent[] {
  const timed = events
    .filter((e) => !e.allDay && e.startMin != null)
    .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0) || (b.endMin ?? 0) - (a.endMin ?? 0));

  const laneEnd: number[] = []; // end-min per lane
  const placed: { ev: CalendarEvent; lane: number; s: number; e: number }[] = [];
  for (const ev of timed) {
    const s = Math.max(DAY_START_MIN, ev.startMin!);
    const e = Math.min(DAY_END_MIN, Math.max(s + SLOT_MIN, ev.endMin ?? s + SLOT_MIN));
    let lane = laneEnd.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(e);
    } else {
      laneEnd[lane] = e;
    }
    placed.push({ ev, lane, s, e });
  }
  const lanes = Math.max(1, laneEnd.length);
  return placed.map(({ ev, lane, s, e }) => ({
    ev,
    color: color(ev),
    top: ((s - DAY_START_MIN) / SLOT_MIN) * SLOT_PX,
    height: Math.max(SLOT_PX - 1, ((e - s) / SLOT_MIN) * SLOT_PX - 1),
    lane,
    lanes,
  }));
}

export default async function CalendarPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireEventsAccess();

  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonthIST();
  const [yr, mo] = month.split("-").map(Number);
  const anchor = new Date(yr!, mo! - 1, 1);

  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const from = format(gridStart, "yyyy-MM-dd");
  const to = format(gridEnd, "yyyy-MM-dd");

  const [categories, events] = await Promise.all([
    listCategories(),
    getMonthEvents(from, to),
  ]);

  const catById = new Map<string, EventCategory>(categories.map((c) => [c.id, c]));
  const eventColor = (e: CalendarEvent): string => {
    if (e.colorOverride) return e.colorOverride;
    const cat = e.categoryId ? catById.get(e.categoryId) : undefined;
    return cat?.color ?? "#64748B";
  };

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.eventDate) ?? [];
    list.push(e);
    eventsByDate.set(e.eventDate, list);
  }

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Legend counts (this month).
  const countByCat = new Map<string, number>();
  for (const e of events) {
    if (e.categoryId && e.eventDate.startsWith(month)) {
      countByCat.set(e.categoryId, (countByCat.get(e.categoryId) ?? 0) + 1);
    }
  }

  // Hour gridlines (solid) every 60 min; half-hour dotted lines between.
  const hourLines = Array.from({ length: SLOTS_PER_DAY + 1 }, (_, i) => i).filter(
    (i) => (DAY_START_MIN + i * SLOT_MIN) % 60 === 0,
  );

  return (
    <div className="me-print">
      <style>{`
        .me-print {
          --hair: #e2e8f0;
          --hair-strong: #cbd5e1;
          --ink: #0f172a;
          --ink-muted: #475569;
          background: #ffffff;
          color: var(--ink);
          padding: 20px 24px 40px;
          font-family: var(--font-sans, system-ui, sans-serif);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .me-print .me-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
        .me-print .me-title { font-family: var(--font-display), system-ui, sans-serif; font-weight: 900; font-size: 26px; letter-spacing: -0.02em; line-height: 1.05; color: var(--ink); }
        .me-print .me-sub { font-size: 12px; color: var(--ink-muted); font-weight: 600; margin-top: 2px; }
        .me-print .me-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 16px; padding: 10px 12px; border: 1px solid var(--hair); border-radius: 10px; }
        .me-print .me-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--ink-muted); }
        .me-print .me-swatch { width: 12px; height: 12px; border-radius: 3px; flex: none; }
        .me-print .me-band { border: 1px solid var(--hair-strong); border-radius: 10px; overflow: hidden; margin-bottom: 14px; }
        .me-print .me-band-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted); background: #f8fafc; padding: 5px 10px; border-bottom: 1px solid var(--hair); }
        .me-print .me-week-head { display: grid; grid-template-columns: 46px repeat(7, 1fr); border-bottom: 1px solid var(--hair); }
        .me-print .me-daycol-head { padding: 4px 6px; text-align: center; border-left: 1px solid var(--hair); font-size: 10.5px; }
        .me-print .me-daycol-head.wknd { background: #f8fafc; }
        .me-print .me-daycol-head.oob { color: #94a3b8; }
        .me-print .me-daycol-head.hol { background: #fef3c7; }
        .me-print .me-dow { font-weight: 700; color: var(--ink-muted); }
        .me-print .me-dnum { font-weight: 800; font-size: 13px; color: var(--ink); }
        .me-print .me-holname { font-size: 8.5px; font-weight: 700; color: #b45309; line-height: 1.1; margin-top: 1px; }
        .me-print .me-week-body { display: grid; grid-template-columns: 46px repeat(7, 1fr); position: relative; }
        .me-print .me-time-axis { position: relative; height: ${BAND_H}px; }
        .me-print .me-time-lbl { position: absolute; right: 5px; font-size: 8.5px; font-weight: 600; color: #94a3b8; transform: translateY(-4px); }
        .me-print .me-daycol { position: relative; height: ${BAND_H}px; border-left: 1px solid var(--hair); }
        .me-print .me-daycol.wknd { background: #fafbfc; }
        .me-print .me-gl { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dotted #eef2f6; }
        .me-print .me-gl.hour { border-top: 1px solid var(--hair); }
        .me-print .me-allday { border-bottom: 1px solid var(--hair); }
        .me-print .me-ev { position: absolute; border-radius: 4px; padding: 1px 3px; font-size: 8.5px; font-weight: 700; line-height: 1.12; overflow: hidden; box-sizing: border-box; }
        .me-print .me-ev.tent { border: 1px dashed rgba(0,0,0,0.55); background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.42) 0 3px, transparent 3px 7px); }
        .me-print .me-ev .me-ev-time { font-weight: 600; opacity: 0.85; font-size: 8px; }
        .me-print .me-tentchip { display: inline-block; font-size: 6.5px; font-weight: 800; padding: 0 2px; border-radius: 2px; background: rgba(0,0,0,0.28); margin-left: 2px; vertical-align: middle; }
        .me-print .me-lock { font-size: 8px; }
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .me-print { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .me-print .me-no-print { display: none !important; }
          .me-print .me-band { break-inside: avoid; page-break-inside: avoid; }
          .me-print .me-legend { break-inside: avoid; }
        }
      `}</style>

      <div className="me-toolbar">
        <div>
          <div className="me-title">Monthly Events Master</div>
          <div className="me-sub">
            {format(anchor, "MMMM yyyy")} · Altus Corp · generated {formatDate(new Date())}, {format(new Date(), "h:mm a")}
          </div>
        </div>
        <div className="me-no-print">
          <PrintTrigger />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="me-legend">
          {categories.map((c) => {
            const n = countByCat.get(c.id) ?? 0;
            return (
              <span key={c.id} className="me-legend-item">
                <span className="me-swatch" style={{ background: c.color }} />
                {c.name}
                {n > 0 && <span style={{ opacity: 0.6 }}>· {n}</span>}
              </span>
            );
          })}
        </div>
      )}

      {weeks.map((week, wi) => (
        <div key={wi} className="me-band">
          <div className="me-band-label">Week of {formatDate(week[0]!)}</div>

          <div className="me-week-head">
            <div className="me-daycol-head" />
            {week.map((d, di) => {
              const inMonth = isSameMonth(d, anchor);
              const cls = [
                "me-daycol-head",
                isWeekend(d) ? "wknd" : "",
                !inMonth ? "oob" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={di} className={cls}>
                  <div className="me-dow">{WEEKDAYS[di]}</div>
                  <div className="me-dnum">{format(d, "d")}</div>
                </div>
              );
            })}
          </div>

          <div className="me-week-body">
            <div className="me-time-axis">
              {hourLines.map((i) => (
                <div key={i} className="me-time-lbl" style={{ top: `${i * SLOT_PX}px` }}>
                  {minToLabel(DAY_START_MIN + i * SLOT_MIN)}
                </div>
              ))}
            </div>

            {week.map((d, di) => {
              const iso = format(d, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(iso) ?? [];
              const positioned = layoutDay(dayEvents, eventColor);
              const allDay = dayEvents.filter((e) => e.allDay);
              return (
                <div key={di} className={`me-daycol${isWeekend(d) ? " wknd" : ""}`}>
                  {/* gridlines */}
                  {Array.from({ length: SLOTS_PER_DAY + 1 }, (_, i) => {
                    const isHour = (DAY_START_MIN + i * SLOT_MIN) % 60 === 0;
                    return (
                      <div
                        key={i}
                        className={`me-gl${isHour ? " hour" : ""}`}
                        style={{ top: `${i * SLOT_PX}px` }}
                      />
                    );
                  })}

                  {/* all-day banners stacked at the very top */}
                  {allDay.map((e, ai) => {
                    const color = eventColor(e);
                    return (
                      <div
                        key={e.id}
                        className="me-ev me-allday"
                        style={{
                          top: ai * (SLOT_PX - 3),
                          height: SLOT_PX - 3,
                          left: 1,
                          right: 1,
                          background: color,
                          color: readableText(color),
                        }}
                      >
                        {e.isLocked && <span className="me-lock">🔒 </span>}
                        {e.title}
                      </div>
                    );
                  })}

                  {/* timed events, lane-split for overlaps */}
                  {positioned.map((p) => {
                    const widthPct = 100 / p.lanes;
                    const tent = p.ev.status === "tentative";
                    const txt = readableText(p.color);
                    return (
                      <div
                        key={p.ev.id}
                        className={`me-ev${tent ? " tent" : ""}`}
                        style={{
                          top: p.top,
                          height: p.height,
                          left: `calc(${p.lane * widthPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                          background: p.color,
                          color: txt,
                        }}
                        title={p.ev.title}
                      >
                        <span className="me-ev-time">
                          {p.ev.startMin != null ? minToLabel(p.ev.startMin) : ""}
                        </span>{" "}
                        {p.ev.isLocked && <span className="me-lock">🔒</span>}
                        {p.ev.title}
                        {tent && <span className="me-tentchip">TENT</span>}
                        {p.ev.location && <span style={{ opacity: 0.85 }}> · 📍{p.ev.location}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
