import { Flag } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HolidayPrintButton } from "./print-button";
import { PageShell } from "@/components/layout/page-shell";
import {
  HOLIDAYS_2026_TITLE,
  HOLIDAYS_2026_INTRO,
  HOLIDAYS_2026_BY_QUARTER,
  holidayMonthAbbr,
  holidayDisplayName,
  MANAGEMENT_DISCRETION_TITLE,
  MANAGEMENT_DISCRETION_NOTE,
  MANAGEMENT_DISCRETION_CLAUSES,
  MANAGEMENT_DISCRETION_CLOSING,
} from "@/lib/hr/holidays-2026";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * Holiday List — a premium, print-friendly presentation of the Altus Corp
 * "Public Holidays – Maharashtra (2026)" policy. Server component, HR-gated.
 *
 * All motion is pure CSS via a static <style> string (NO framer-motion, NO
 * styled-jsx interpolation) to stay load-neutral and avoid the webpack compile
 * hang. Brand tokens only.
 */
export default async function HolidaysPage() {
  await requireWorkspace("hr");

  return (
    <div className="hol-root min-h-full">
      <style>{HOL_CSS}</style>

      <HrTitleBar
        className="hol-chrome"
        right={<HolidayPrintButton />}

      />

      <PageShell width="wide" py={false} className="pt-6 pb-24 max-md:pt-4">
        {/* ── Quarter-grouped holiday list ─────────────────────────── */}
        <section className="hol-cal" aria-label="Holiday calendar for 2026">
          {HOLIDAYS_2026_BY_QUARTER.map((q, qi) => (
            <div key={q.key} className="hol-quarter hol-in" style={{ animationDelay: `${0.06 * (qi + 1)}s` }}>
              <div className="hol-q-head">
                <span className="hol-q-label">{q.label}</span>
                <span className="hol-q-span">{q.span}</span>
                <span className="hol-q-rule" aria-hidden />
                <span className="hol-q-count">{q.holidays.length}</span>
              </div>
              <ul className="hol-list" role="list">
                {q.holidays.map((h) => (
                  <li key={h.date} className={`hol-row${h.national ? " is-national" : ""}`}>
                    <div className="hol-badge" aria-hidden>
                      <span className="hol-badge-mon">{holidayMonthAbbr(h.month)}</span>
                      <span className="hol-badge-day">{h.dayNum}</span>
                    </div>
                    <div className="hol-row-body">
                      {/* The badge to the left already carries month + day and
                          the quarter heading carries the year, so the full date
                          here was pure repetition - and the longest thing in the
                          card. Weekday only, with the National marker sharing
                          its line. */}
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
  .hol-cal{
    display:flex; flex-direction:column; gap:30px; margin-top:0;
    /* Pinned to the width the calendar already had. The shell around it is now
       1400px so the discretion note below can run wide; without this cap that
       change would also reflow the holiday grid from 3 columns to 4, which is
       not what was asked for. Remove these two lines to let the cards widen. */
    max-width:980px; width:100%; margin-inline:auto;
  }
  .hol-quarter{}
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
    .no-print{ display:none !important; }
    .hol-root{ background:#fff !important; }
    .hol-in{ animation:none !important; }
    .hol-row, .hol-note{
      box-shadow:none !important;
      break-inside: avoid;
    }
    .hol-quarter{ break-inside: avoid; }
    main{ padding-top:18px !important; }
    .hol-badge, .hol-flag, .hol-title, .is-national .hol-badge, .hol-note-bar, .hol-clause-mark{
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }
  }
`;
