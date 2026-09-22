import type { CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Flag } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HolidayPrintButton } from "./print-button";
import { PageShell } from "@/components/layout/page-shell";
import {
  holidayMonthAbbr,
  holidayMonthName,
  HOLIDAY_MONTH_ALL,
  HOLIDAY_YEARS,
  holidayDisplayName,
  MANAGEMENT_DISCRETION_TITLE,
  MANAGEMENT_DISCRETION_NOTE,
  MANAGEMENT_DISCRETION_CLAUSES,
  MANAGEMENT_DISCRETION_CLOSING,
} from "@/lib/hr/holidays-2026";
import {
  carouselNeighbours,
  groupByMonth,
  holidaysInMonth,
  mergeCalendar,
  monthsWithHolidays,
  printYearFor,
  quartersOfYear,
  resolveCarouselMonth,
  upcomingFrom,
  holidaysInWorkingYear,
  resolveWorkingYear,
  workingYearSpan,
  workingYearsWithHolidays,
  type CalendarHoliday,
  type MonthKey,
} from "@/lib/hr/holiday-calendar";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { HolidayCarousel } from "./holiday-carousel";
import { localDateString } from "@/lib/format";
import { canManageHolidays } from "@/lib/hr/holiday-admins";
import { listAdHocHolidaysBetween } from "./actions";
import { AdHocHolidayPanel } from "./adhoc-panel";

export const dynamic = "force-dynamic";

/**
 * Holiday List — a premium, print-friendly presentation of the Altus Corp
 * holiday calendar. Server component, HR-gated.
 *
 * ON SCREEN it is a carousel of what is still AHEAD: past holidays are gone,
 * and prev / next jump straight to the previous / next month that has a
 * holiday (lib/hr/holiday-calendar). IN PRINT it is the whole current calendar
 * year, Jan–Dec, past days included — Print Calendar is the document HR hands
 * out, not a snapshot of whichever month happened to be on screen.
 *
 * All motion is pure CSS via a static <style> string (NO framer-motion, NO
 * styled-jsx interpolation) to stay load-neutral and avoid the webpack compile
 * hang. Brand tokens only.
 */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; fy?: string }>;
}) {
  const me = await requireWorkspace("hr");

  /* THE SELECTION LIVES IN THE URL (`?year=&month=`, `month=0` = All upcoming)
     and is validated rather than trusted: a stale bookmark to a month that has
     passed, or has no holidays, snaps forward to the next month that does. */
  const sp = await searchParams;
  const today = localDateString("Asia/Kolkata");
  const printYear = printYearFor(today);
  const lastYear = HOLIDAY_YEARS[HOLIDAY_YEARS.length - 1]!;
  const years = HOLIDAY_YEARS.filter((y) => y >= printYear);

  /* AD-HOC DAYS come from the `holidays` TABLE - the same rows attendance
     grades against - so what is listed here and what an employee sees on their
     attendance cannot disagree. One read covers the print year (past days
     included) and every published year after it. Read for everyone; only the
     two named people get the panel that writes them. */
  const adHoc = await listAdHocHolidaysBetween(`${printYear}-01-01`, `${lastYear}-12-31`);
  const mayEditHolidays = canManageHolidays(me.email);

  const calendar = mergeCalendar(years, adHoc);
  const upcoming = upcomingFrom(calendar, today);
  const months = monthsWithHolidays(upcoming);

  const yearParam = Number(sp.year);
  const monthParam = Number(sp.month);
  const showingAll = sp.month !== undefined && monthParam === HOLIDAY_MONTH_ALL;
  const requested: MonthKey | null =
    Number.isInteger(yearParam) && Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
      ? { year: yearParam, month: monthParam }
      : null;

  const current = showingAll ? null : resolveCarouselMonth(requested, months);
  const { prev, next } = current ? carouselNeighbours(months, current) : { prev: null, next: null };
  const monthHolidays = current ? holidaysInMonth(upcoming, current) : [];
  /* ALL UPCOMING IS SPLIT BY WORKING YEAR (April → March), one tab each. It
     used to run December straight into January with nothing in between, and
     January 2027 read as this year's. `?fy=` picks the tab; an empty or unknown
     one falls back to the first working year that has holidays left. */
  const workingYears = workingYearsWithHolidays(upcoming);
  const fyParam = Number(sp.fy);
  const activeFy = showingAll
    ? resolveWorkingYear(Number.isInteger(fyParam) ? fyParam : null, workingYears)
    : null;
  const allGroups =
    showingAll && activeFy !== null ? groupByMonth(holidaysInWorkingYear(upcoming, activeFy)) : [];
  const printQuarters = quartersOfYear(calendar, printYear);
  const printZoom = printZoomFor(printQuarters.map((q) => q.holidays.length));

  // The ad-hoc panel follows the year on screen, so its date picker offers the
  // year being looked at.
  const panelYear = current?.year ?? months[0]?.year ?? printYear;
  const panelRows = adHoc.filter((r) => r.holidayDate.startsWith(`${panelYear}-`));

  return (
    <div className="hol-root min-h-full" style={{ "--hol-print-zoom": printZoom } as CSSProperties}>
      <style>{HOL_CSS + CAROUSEL_CSS}</style>

      <HrTitleBar
        className="hol-chrome"
        right={<HolidayPrintButton />}

      />

      <PageShell width="wide" py={false} className="pt-6 pb-24 max-md:pt-4">
        <HolidayCarousel
          current={current}
          prev={prev}
          next={next}
          showingAll={showingAll}
          firstMonth={months[0] ?? null}
          count={current ? monthHolidays.length : undefined}
        />

        {mayEditHolidays && (
          <div className="no-print">
            <AdHocHolidayPanel year={panelYear} rows={panelRows} />
          </div>
        )}

        {/* ── On screen: upcoming only ─────────────────────────────────
            Three states, one card. The CARD markup is identical in the month
            view and the All upcoming view - what the carousel changes is which
            cards appear, nothing about the card itself. */}
        <div className="hol-screen">
          {months.length === 0 ? (
            <section className="hol-cal" aria-label="Upcoming holidays">
              <div className="hol-empty">
                <p className="hol-empty-title">No upcoming holidays</p>
                <p className="hol-empty-body">
                  Every holiday on the published calendar has passed. The next year&apos;s list is
                  added here once it is published.
                </p>
              </div>
            </section>
          ) : showingAll ? (
            <section className="hol-cal" aria-label="All upcoming holidays">
              <nav className="hol-fy-tabs no-print" aria-label="Working year">
                {workingYears.map((fy) => (
                  <Link
                    key={fy}
                    href={`/hr/holidays?month=0&fy=${fy}` as Route}
                    className={`hol-fy-tab${fy === activeFy ? " is-active" : ""}`}
                    aria-current={fy === activeFy ? "page" : undefined}
                  >
                    <span className="hol-fy-year">{fy}</span>
                    <span className="hol-fy-span">{workingYearSpan(fy)}</span>
                  </Link>
                ))}
              </nav>
              {allGroups.map((g, gi) => (
                <div
                  key={`${g.key.year}-${g.key.month}`}
                  className="hol-quarter hol-in"
                  style={{ animationDelay: `${Math.min(0.06 * (gi + 1), 0.48)}s` }}
                >
                  <div className="hol-q-head">
                    <span className="hol-q-label">{holidayMonthName(g.key.month)}</span>
                    <span className="hol-q-span">{g.key.year}</span>
                    <span className="hol-q-rule" aria-hidden />
                    <span className="hol-q-count">{g.holidays.length}</span>
                  </div>
                  <ul className="hol-list" role="list">
                    {g.holidays.map((h) => (
                      <HolidayCard key={h.iso} h={h} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : current ? (
            <section
              className="hol-cal"
              aria-label={`Upcoming holidays in ${holidayMonthName(current.month)} ${current.year}`}
            >
              {/* No month heading here: the carousel above names the month and
                  carries the count, and printing it twice read as a mistake. */}
              <div key={`${current.year}-${current.month}`} className="hol-quarter hol-in">
                <ul className="hol-list" role="list">
                  {monthHolidays.map((h) => (
                    <HolidayCard key={h.iso} h={h} />
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>

        {/* ── In print: the whole calendar year ────────────────────────
            Hidden on screen. Past holidays and ad-hoc days are included, in
            Jan–Mar / Apr–Jun / … quarters. */}
        <section className="hol-cal hol-print-year" aria-label={`Holiday calendar for ${printYear}`}>
          <h2 className="hol-print-title">Holiday Calendar {printYear}</h2>
          {printQuarters.map((q) => (
            <div key={q.key} className="hol-quarter">
              <div className="hol-q-head">
                <span className="hol-q-label">{q.label}</span>
                <span className="hol-q-span">{q.span}</span>
                <span className="hol-q-rule" aria-hidden />
                <span className="hol-q-count">{q.holidays.length}</span>
              </div>
              <ul className="hol-list" role="list">
                {q.holidays.map((h) => (
                  <HolidayCard key={h.iso} h={h} />
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ── Management discretion note ───────────────────────────── */}
        <section className="hol-note hol-in" aria-labelledby="hol-note-title">
          <div className="hol-note-bar" aria-hidden />
          <div className="hol-note-body">
            <h2 id="hol-note-title" className="hol-note-title">{MANAGEMENT_DISCRETION_TITLE}</h2>
            <p className="hol-note-lead">{MANAGEMENT_DISCRETION_NOTE}</p>

            <p className="hol-accordingly">Accordingly:</p>
            <ul className="hol-clauses" role="list">
              {MANAGEMENT_DISCRETION_CLAUSES.map((c, i) => (
                <li key={i} className="hol-clause">
                  <span className="hol-clause-mark" aria-hidden />
                  <span>{c}</span>
                </li>
              ))}
            </ul>

            <p className="hol-closing">{MANAGEMENT_DISCRETION_CLOSING}</p>
          </div>
        </section>
      </PageShell>
    </div>
  );
}

/**
 * How far to shrink the printed year so it and the discretion note always fit
 * ONE A4 sheet. Heights are CSS px at the print layout's full size, measured
 * from the print rules in HOL_CSS: a row of three cards is 46px with its gap,
 * the title plus four quarter headings take 148px, and the note (with its top
 * margin) 360px, against 1036px of sheet inside the 11mm/12mm padding. A normal
 * year (about 8 rows) needs less than that and prints at full size; only a year
 * with more holidays is scaled down, never up. Update the numbers if the print
 * CSS changes.
 */
function printZoomFor(countsPerQuarter: number[]): number {
  const ROW = 46, CHROME = 148, NOTE = 360, SHEET = 1036;
  const rows = countsPerQuarter.reduce((n, c) => n + Math.ceil(c / 3), 0);
  const need = CHROME + rows * ROW + NOTE;
  return need <= SHEET ? 1 : Math.floor((SHEET / need) * 1000) / 1000;
}

/** One holiday card — the same markup in every view, screen and print. */
function HolidayCard({ h }: { h: CalendarHoliday }) {
  return (
    <li className={`hol-row${h.national ? " is-national" : ""}`}>
      <div className="hol-badge" aria-hidden>
        <span className="hol-badge-mon">{holidayMonthAbbr(h.month)}</span>
        <span className="hol-badge-day">{h.dayNum}</span>
      </div>
      <div className="hol-row-body">
        {/* The badge to the left already carries month + day and the heading
            carries the year, so the full date here was pure repetition - and
            the longest thing in the card. Weekday only, with the National
            marker sharing its line. */}
        <span className="hol-name">{holidayDisplayName(h.name)}</span>
        <span className="hol-meta">
          <span className="hol-weekday">{h.day}</span>
          {h.national && (
            <span className="hol-flag">
              <Flag size={12} strokeWidth={2.6} />
              National
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

const CAROUSEL_CSS = `
  /* ── Carousel (replaces the Year + Month dropdowns) ─────────────────── */
  .hol-carousel{
    display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
    gap:12px; width:100%; margin:0 0 18px;
  }
  .hol-car-toggle{
    display:inline-flex; padding:3px; border-radius:10px;
    background: var(--color-surface-card, #fff);
    border:1px solid var(--color-hairline-strong, rgba(15,23,42,.14));
  }
  .hol-car-pill{
    display:inline-flex; align-items:center; height:32px; padding:0 14px; border-radius:8px;
    font-size:13px; font-weight:700; text-decoration:none;
    color: var(--color-ink-muted, #475569);
    transition: background .15s ease, color .15s ease;
  }
  .hol-car-pill:hover{ color: var(--color-ink-strong, #0f172a); }
  .hol-car-pill.is-on{
    color:#fff;
    background: linear-gradient(135deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400));
  }
  .hol-car-stepper{ display:inline-flex; align-items:center; gap:10px; }
  .hol-car-btn{
    display:inline-grid; place-items:center; width:40px; height:40px; border-radius:10px;
    border:1px solid var(--color-hairline-strong, rgba(15,23,42,.14));
    background: var(--color-surface-card, #fff);
    color: var(--color-ink-strong, #0f172a);
    transition: border-color .15s ease, color .15s ease;
  }
  .hol-car-btn:hover{
    border-color: color-mix(in srgb, var(--color-altus-red, #E10600) 45%, transparent);
    color: var(--color-altus-red-deep, #A80400);
  }
  .hol-car-btn:focus-visible, .hol-car-pill:focus-visible{
    outline:2px solid var(--color-altus-red, #E10600); outline-offset:2px;
  }
  .hol-car-btn.is-disabled, .hol-car-btn.is-disabled:hover{
    opacity:.4; cursor:default;
    border-color: var(--color-hairline-strong, rgba(15,23,42,.14));
    color: var(--color-ink-strong, #0f172a);
  }
  .hol-car-label{ display:flex; align-items:baseline; justify-content:center; gap:8px; min-width:168px; }
  .hol-car-month{
    font-family: var(--font-display, Georgia, serif); font-weight:800; font-size:20px;
    letter-spacing:-.01em; color: var(--color-ink-strong, #0f172a);
  }
  .hol-car-year{
    font-size:12px; font-weight:700; letter-spacing:.06em;
    color: var(--color-ink-muted, #475569);
  }
  .hol-car-count{
    font-size:12px; font-weight:800; min-width:24px; padding:2px 8px; border-radius:8px;
    text-align:center;
    color: var(--color-altus-red-deep, #A80400);
    background: color-mix(in srgb, var(--color-altus-red, #E10600) 10%, #fff);
  }
  @media (max-width: 560px){
    .hol-carousel{ flex-direction:column; align-items:stretch; }
    .hol-car-stepper{ justify-content:space-between; }
    .hol-car-label{ min-width:0; }
  }

  /* ── The print-only full year ───────────────────────────────────────── */
  .hol-print-year{ display:none; }
  .hol-print-title{
    font-family: var(--font-display, Georgia, serif); font-weight:800; font-size:22px;
    letter-spacing:-.01em; margin:0; color: var(--color-ink-strong, #0f172a);
  }
  @media print{
    .hol-screen{ display:none !important; }
    .hol-print-year{ display:flex !important; }
  }
`;

const HOL_CSS = `
  .hol-root{
    background:
      radial-gradient(900px 520px at 12% -8%, rgba(225,6,0,0.06), transparent 62%),
      radial-gradient(760px 480px at 100% 0%, rgba(168,4,0,0.05), transparent 60%),
      var(--color-surface-soft, #f8fafc);
    color: var(--color-ink-strong, #0f172a);
  }
  /* Chrome */
  .hol-chrome{
    border-bottom:1px solid var(--color-hairline, rgba(15,23,42,.06));
    background: rgba(255,255,255,.86);
    backdrop-filter: blur(10px);
  }
  .hol-back{
    background: linear-gradient(120deg, #18181b 0%, var(--color-altus-red-deep, #A80400) 100%);
    box-shadow: 0 12px 26px -12px rgba(168,4,0,0.55);
  }
  .hol-print{
    color: var(--color-altus-red-deep, #A80400);
    background:#fff;
    border:1px solid var(--color-hairline-strong, rgba(15,23,42,.10));
    cursor:pointer;
    transition: border-color .15s ease, transform .15s ease;
  }
  .hol-print:hover{ border-color: color-mix(in srgb, var(--color-altus-red, #E10600) 45%, transparent); }
  .hol-print:focus-visible{ outline:2px solid var(--color-altus-red, #E10600); outline-offset:2px; }

  /* Hero */
  .hol-eyebrow{
    display:inline-flex; align-items:center; gap:7px;
    font-size:12px; font-weight:800; letter-spacing:.09em; text-transform:uppercase;
    color: var(--color-altus-red-deep, #A80400);
    background: color-mix(in srgb, var(--color-altus-red, #E10600) 9%, #fff);
    border:1px solid color-mix(in srgb, var(--color-altus-red, #E10600) 22%, transparent);
    padding:6px 14px; border-radius:8px;
  }
  .hol-title{
    font-family: var(--font-display, Georgia, serif);
    font-weight:800; letter-spacing:-.02em; line-height:1.06;
    font-size: clamp(30px, 5.2vw, 46px);
    margin: 0;
    background: linear-gradient(120deg, #18181b 0%, var(--color-altus-red-deep, #A80400) 78%);
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .hol-intro{
    /* Auto-centered block: the frozen title bar centers its heading block,
       so this centers under it too instead of hugging the left edge. */
    margin: 16px auto 0; max-width: 660px;
    font-size: 15.5px; line-height:1.7; color: var(--color-ink-muted, #475569);
  }

  /* Calendar */
  /* ── Ad-hoc holiday panel (Ruchita + Rutvisha only) ─────────────────── */
  .hol-adhoc{
    width:100%; margin:0 0 18px;
    border:1px solid var(--color-hairline-strong, rgba(15,23,42,.14));
    border-radius:16px; padding:16px 18px;
    background: var(--color-surface-card, #fff);
  }
  .hol-adhoc-head{ display:flex; align-items:center; gap:8px; color: var(--color-altus-red-deep, #A80400); }
  .hol-adhoc-title{ margin:0; font-size:14.5px; font-weight:800; color: var(--color-ink-strong, #0f172a); }
  .hol-adhoc-lead{
    margin:6px 0 12px; font-size:13px; line-height:1.55;
    color: var(--color-ink-muted, #475569); max-width:70ch;
  }
  .hol-adhoc-form{ display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; }
  .hol-adhoc-name{ flex:1; min-width:200px; }
  .hol-adhoc-name .hol-select{ width:100%; }
  .hol-adhoc-add{
    height:40px; display:inline-flex; align-items:center; gap:7px;
    padding:0 16px; border-radius:10px; border:0; cursor:pointer;
    font-size:13.5px; font-weight:800; color:#fff;
    background: linear-gradient(135deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400));
  }
  .hol-adhoc-add:disabled{ opacity:.6; cursor:default; }
  .hol-adhoc-list{ list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; }
  .hol-adhoc-row{
    display:flex; align-items:center; gap:12px; padding:8px 10px; border-radius:10px;
    background: var(--color-surface-soft, #f8fafc);
    font-size:13px; color: var(--color-ink-strong, #0f172a);
  }
  .hol-adhoc-date{ font-weight:800; font-variant-numeric:tabular-nums; }
  .hol-adhoc-label{ flex:1; min-width:0; }
  .hol-adhoc-del{
    border:0; background:transparent; cursor:pointer; padding:4px; border-radius:7px;
    color: var(--color-ink-subtle, #64748b);
  }
  .hol-adhoc-del:hover{ color: var(--color-altus-red, #E10600); }
  .hol-adhoc-del:disabled{ opacity:.45; cursor:default; }
  /* "optional" beside the Note field's label — the only field that is. */
  .hol-adhoc-opt{ font-weight:600; text-transform:none; letter-spacing:0;
    color: var(--color-ink-subtle, #94a3b8); }
  /* HR's reason, under the holiday name on the list row. */
  .hol-adhoc-note{
    display:block; margin-top:2px; font-size:12px; font-weight:500;
    color: var(--color-ink-subtle, #64748b);
    overflow-wrap:anywhere;
  }
  /* A row being edited: the three fields wrap on a narrow screen rather than
     squeezing the date input to nothing. */
  .hol-adhoc-row-edit{ flex-wrap:wrap; gap:8px; }
  .hol-adhoc-row-edit .hol-select{ flex:1; min-width:150px; }
  .hol-adhoc-row-edit .hol-adhoc-edit-date{ flex:0 0 auto; min-width:0; }

  /* ── Year + month filters ─────────────────────────────────────────────
     Sits above the calendar and is no-print: Print Calendar should output
     the holidays, not the controls that chose them. */
  .hol-filters{
    display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px;
    width:100%; margin:0 0 18px;
  }
  .hol-filter{ display:flex; flex-direction:column; gap:5px; }
  .hol-filter-label{
    font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
    color: var(--color-ink-subtle, #64748b);
  }
  .hol-select{
    height:40px; min-width:150px; border-radius:10px; padding:0 12px;
    border:1px solid var(--color-hairline-strong, rgba(15,23,42,.14));
    background: var(--color-surface-card, #fff);
    font-size:13.5px; font-weight:700; color: var(--color-ink-strong, #0f172a);
    outline:none; cursor:pointer;
  }
  .hol-select:focus{ border-color: var(--color-altus-red, #E10600); }

  /* ── Empty states ───────────────────────────────────────────────────── */
  .hol-empty{
    border:1px dashed var(--color-hairline-strong, rgba(15,23,42,.16));
    border-radius:16px; padding:32px 26px; text-align:center;
    background: var(--color-surface-card, #fff);
  }
  .hol-empty-title{
    margin:0; font-size:15.5px; font-weight:800;
    color: var(--color-ink-strong, #0f172a);
  }
  .hol-empty-body{
    margin:8px auto 0; max-width:56ch; font-size:13.5px; line-height:1.6;
    color: var(--color-ink-muted, #475569);
  }
  .hol-cal{
    display:flex; flex-direction:column; gap:30px; margin-top:0;
    /* Pinned to the width the calendar already had. The shell around it is now
       1400px so the discretion note below can run wide; without this cap that
       change would also reflow the holiday grid from 3 columns to 4, which is
       not what was asked for. Remove these two lines to let the cards widen. */
    /* NO WIDTH CAP AND NO AUTO-CENTRING. These used to be pinned to 980px and
       centred, which left the calendar floating in the middle of a page whose
       Management Discretion note ran the full width - two different left edges
       on one screen. They now fill PageShell exactly as the note does, so all
       four blocks share one left edge and one right edge, and the whole column
       widens and narrows with the sidebar for free (PageShell is what tracks
       it - there is nothing to observe or measure here). */
    width:100%;
  }
  .hol-quarter{}
  /* Working-year tabs over the All-upcoming list. */
  .hol-fy-tabs{ display:flex; flex-wrap:wrap; gap:8px; }
  .hol-fy-tab{
    display:flex; flex-direction:column; align-items:flex-start; gap:1px;
    padding:8px 16px; border-radius:14px; white-space:nowrap;
    border:1px solid var(--color-hairline, rgba(15,23,42,.08));
    background: var(--color-surface-card, #fff);
    transition: border-color .15s ease, background .15s ease;
  }
  .hol-fy-tab:hover{ border-color: var(--color-hairline-strong, rgba(15,23,42,.14)); }
  .hol-fy-year{ font-family: var(--font-display, Georgia, serif); font-weight:800; font-size:17px; color: var(--color-ink-strong, #0f172a); }
  .hol-fy-span{ font-size:11px; font-weight:700; letter-spacing:.04em; color: var(--color-ink-muted, #475569); }
  .hol-fy-tab.is-active{ background: var(--color-altus-red, #E10600); border-color: var(--color-altus-red, #E10600); }
  .hol-fy-tab.is-active .hol-fy-year, .hol-fy-tab.is-active .hol-fy-span{ color:#fff; }
  .hol-q-head{ display:flex; align-items:baseline; gap:12px; margin:0 4px 12px; }
  .hol-q-label{ font-family: var(--font-display, Georgia, serif); font-weight:800; font-size:18px; letter-spacing:-.01em; color: var(--color-ink-strong, #0f172a); }
  .hol-q-span{ font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color: var(--color-ink-muted, #475569); }
  .hol-q-rule{ flex:1; height:1px; background: linear-gradient(90deg, var(--color-hairline-strong, rgba(15,23,42,.10)), transparent); }
  .hol-q-count{
    font-size:12px; font-weight:800; color: var(--color-altus-red-deep, #A80400);
    background: color-mix(in srgb, var(--color-altus-red, #E10600) 10%, #fff);
    border-radius:8px; min-width:24px; text-align:center; padding:2px 8px;
  }

  .hol-list{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(268px, 1fr));
    /* start, not the default stretch: a card is only as tall as its own
       content. Stretching forced every card up to the tallest in its row, and
       that surplus had nowhere good to go - under the text it read as a hollow
       box, above the weekday as a gap. Card tops still line up; only a title
       that actually wraps makes its own card taller. */
    align-items:start;
    gap:12px; margin:0; padding:0; list-style:none;
  }
  .hol-row{
    position:relative;
    display:flex; align-items:stretch; gap:14px;
    background:#fff; border:1px solid var(--color-hairline, rgba(15,23,42,.06));
    border-radius:16px; padding:14px 16px;
    box-shadow: 0 12px 30px -26px rgba(15,23,42,.5);
    transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
  }
  .hol-row:hover{ transform: translateY(-2px); box-shadow: 0 20px 40px -28px rgba(15,23,42,.55); border-color: var(--color-hairline-strong, rgba(15,23,42,.10)); }
  .hol-row.is-national{
    border-color: color-mix(in srgb, var(--color-altus-red, #E10600) 30%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red, #E10600) 5%, #fff), #fff);
  }
  .hol-badge{
    /* No height of its own: it stretches to the text column, so its bottom
       edge lands exactly on the weekday row (and on the National tag) whatever
       the title length. */
    flex:0 0 auto; align-self:stretch; width:52px; border-radius:12px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background: linear-gradient(160deg, #f7f7f8, #eef0f2);
    border:1px solid var(--color-hairline, rgba(15,23,42,.06));
  }
  .is-national .hol-badge{
    background: linear-gradient(160deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400));
    border-color: transparent;
  }
  .hol-badge-mon{ font-size:10px; font-weight:800; letter-spacing:.08em; color: var(--color-ink-muted, #475569); }
  .hol-badge-day{ font-family: var(--font-display, Georgia, serif); font-weight:800; font-size:22px; line-height:1; color: var(--color-ink-strong, #0f172a); }
  .is-national .hol-badge-mon,
  .is-national .hol-badge-day{ color:#fff; }

  /* Content-sized: the card carries no space it does not use - title, the
     weekday 3px under it, and that is the card. */
  .hol-row-body{ display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
  .hol-name{
    font-weight:700; font-size:15.5px; letter-spacing:-.005em; line-height:20px;
    color: var(--color-ink-strong, #0f172a);
  }
  /* Weekday left, National marker right, on one line. */
  .hol-meta{
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    font-size:14px; color: var(--color-ink-muted, #475569);
  }
  .hol-weekday{ font-weight:600; }

  .hol-flag{
    flex:0 0 auto;
    display:inline-flex; align-items:center; gap:5px;
    font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    color:#fff; padding:4px 9px; border-radius:8px;
    background: linear-gradient(120deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400));
    box-shadow: 0 8px 18px -12px rgba(168,4,0,.7);
  }

  /* Management discretion note */
  .hol-note{
    display:flex; margin-top:44px;
    background:#fff; border:1px solid var(--color-hairline, rgba(15,23,42,.06));
    border-radius:20px; overflow:hidden;
    box-shadow: 0 26px 60px -40px rgba(15,23,42,.4);
  }
  .hol-note-bar{ flex:0 0 6px; background: linear-gradient(180deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400)); }
  .hol-note-body{ padding: 28px 32px; }
  .hol-note-title{
    font-family: var(--font-display, Georgia, serif); font-weight:800; letter-spacing:-.01em;
    font-size:20px; color: var(--color-altus-red-deep, #A80400); margin:0 0 12px;
  }
  .hol-note-lead{ font-size:15px; line-height:1.72; color: var(--color-ink-strong, #0f172a); margin:0; }
  .hol-accordingly{ font-weight:800; font-size:14px; letter-spacing:.02em; color: var(--color-ink-strong, #0f172a); margin:20px 0 12px; }
  .hol-clauses{ display:flex; flex-direction:column; gap:12px; margin:0; padding:0; list-style:none; }
  .hol-clause{ display:flex; gap:12px; font-size:14px; line-height:1.68; color: var(--color-ink-muted, #475569); }
  .hol-clause-mark{
    flex:0 0 auto; margin-top:8px; width:7px; height:7px; border-radius:2px; transform: rotate(45deg);
    background: linear-gradient(120deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400));
  }
  .hol-closing{
    margin:20px 0 0; padding-top:16px; font-size:13.5px; line-height:1.7; font-style:italic;
    color: var(--color-ink-muted, #475569);
    border-top:1px solid var(--color-hairline, rgba(15,23,42,.06));
  }

  /* Entrance motion (CSS only) */
  .hol-in{ animation: holFadeUp .5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes holFadeUp{ from{ opacity:0; transform: translateY(16px); } to{ opacity:1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce){
    .hol-in{ animation:none; }
    .hol-row{ transition:none; }
  }

  /* Responsive */
  @media (max-width: 560px){
    .hol-row{ gap:12px; padding:11px 13px; flex-wrap:wrap; }
    .hol-note-body{ padding:22px 18px; }
  }

  /* Print */
  @media print{
    /* A PAGE BOX OF ITS OWN, WITH NO MARGIN. Chrome draws its own header and
       footer (date, title, the page URL bottom-left, "1/2" bottom-right) INSIDE
       the @page margin, so any margin prints them. A zero margin leaves them no
       room, and the 12mm the sheet needs moves to padding on .hol-root below -
       still one fixed box every printer agrees on. */
    @page{ size: A4 portrait; margin: 0; }
    html, body, .hr-shell, .hr-shell-scroll{ background:#fff !important; }
    .hol-root{ min-height:0 !important; padding: 11mm 12mm 0 !important; }
    .hol-root main{ padding:0 !important; max-width:none !important; }

    .no-print{ display:none !important; }

    /* THE APP IS NOT PART OF THE DOCUMENT. The global top bar, the module rail
       and any floating toast were all landing on the printed sheet — the top of
       page 1 was a screenshot of the browser, not a calendar. */
    .aura-topbar, .app-topbar, .sidebar-rail, [data-sonner-toaster], .onb-nudge{
      display:none !important;
    }
    .hol-root{ background:#fff !important; }
    .hol-in{ animation:none !important; }
    .hol-row, .hol-note{
      box-shadow:none !important;
      break-inside: avoid;
    }
    .hol-quarter{ break-inside: avoid; }
    main{ padding-top:0 !important; }

    /* ── THE PRINTED YEAR IS ITS OWN, DENSER LAYOUT ──────────────────────
       The screen grid (auto-fill at 268px, 30px gaps, roomy cards) carried
       straight into print and spread twenty holidays over three sheets, most
       of each one blank. Print gets three fixed columns and tighter cards, so
       a whole year lands on one page and the quarters stop splitting across
       sheets. Screen is untouched. */
    /* ── ONE SHEET, ALWAYS ────────────────────────────────────────────────
       The year and the discretion note share a single A4 page. The note used
       to be pushed onto a sheet of its own (break-before: page), which with
       the shell's grey canvas under it printed as a second, mostly-empty page.
       The layout below is sized so a typical year (about 8 rows of cards) fits
       at full size, and --hol-print-zoom (computed on the server from the
       number of rows, see printZoomFor) shrinks both blocks together in a year
       with more holidays, so nothing ever spills or overlaps. */
    .hol-print-year, .hol-note{ zoom: var(--hol-print-zoom, 1); }
    .hol-print-year{ gap:10px !important; }
    .hol-print-title{ font-size:16px !important; margin-bottom:0 !important; }
    .hol-print-year .hol-q-head{ margin:0 2px 4px !important; }
    .hol-print-year .hol-q-label{ font-size:13px !important; }
    .hol-print-year .hol-q-span{ font-size:9px !important; }
    .hol-print-year .hol-q-count{ font-size:9.5px !important; padding:1px 6px !important; }
    .hol-print-year .hol-list{
      grid-template-columns:repeat(3, minmax(0, 1fr)) !important;
      gap:5px !important;
    }
    .hol-print-year .hol-row{
      padding:4px 7px !important; gap:7px !important; border-radius:7px !important;
    }
    .hol-print-year .hol-badge{ padding:2px 5px !important; border-radius:5px !important; min-width:0 !important; }
    .hol-print-year .hol-badge-mon{ font-size:7.5px !important; }
    .hol-print-year .hol-badge-day{ font-size:13px !important; line-height:1.05 !important; }
    .hol-print-year .hol-name{ font-size:10.5px !important; line-height:1.2 !important; }
    .hol-print-year .hol-meta, .hol-print-year .hol-weekday, .hol-print-year .hol-flag{
      font-size:8.5px !important;
    }

    /* Padding on all four sides. An earlier print rule zeroed the horizontal
       padding, which jammed the text against the red bar on the left and ran it
       into the border on the right — the box printed looking broken. */
    .hol-note{ break-inside: avoid; overflow:hidden !important; margin-top:12px !important; }
    .hol-note-body{ padding:11px 18px 11px 20px !important; }
    .hol-clause{ padding-right:4px !important; }
    .hol-note-title{ font-size:13.5px !important; margin-bottom:5px !important; }
    .hol-note-lead, .hol-clause{ font-size:9.5px !important; line-height:1.4 !important; }
    .hol-accordingly{ font-size:11px !important; margin:7px 0 4px !important; }
    .hol-clauses{ gap:3px !important; margin:0 !important; }
    .hol-closing{ font-size:10px !important; line-height:1.4 !important; margin-top:7px !important; padding-top:7px !important; }
    .hol-badge, .hol-flag, .hol-title, .is-national .hol-badge, .hol-note-bar, .hol-clause-mark{
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }
  }
`;
