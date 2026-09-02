import Link from "next/link";
import type { Route } from "next";
import { PartyPopper } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Info, Sparkles } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { HrBackButton } from "@/components/hr/hr-back-button";
import { DashboardHeader } from "@/components/layout/header";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listHolidays } from "@/lib/queries/monthly-events";
import { personalisedHolidays } from "@/components/events/holidays/personalise";
import { RELIGION_LABELS } from "@/db/enums";
import type { ReligionCode } from "@/lib/monthly-events/types";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const VALID_FY = new Set([2026, 2027]);

/**
 * HR → Holiday List. A read-only, religion-personalised view of the SAME company
 * holiday data owned by the Monthly Events Master module (event_holidays, via
 * listHolidays) — no duplication. Open to every employee (HR is an open room).
 */
export default async function HolidayListPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Holiday List"
        Icon={PartyPopper}
        blurb="The official company holiday calendar for the year, at a glance. This section is being built."
      />
    );
  }

  const sp = await searchParams;
  const parsedFy = Number(sp.fy);
  const fyStartYear = VALID_FY.has(parsedFy) ? parsedFy : 2026;

  const all = await listHolidays(fyStartYear);
  const religion = (me.religion as ReligionCode | null) ?? null;
  const hasReligion = religion !== null && religion !== "unspecified" && religion !== "other";
  const list = personalisedHolidays(all, religion);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[760px] px-8 pb-16 pt-8 max-md:px-4">
        <HrBackButton fallbackHref="/hr" />
        <header className="mb-5 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Holiday List
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            Company Holidays This Year
          </h1>
        </header>

        <div className="mb-4 inline-flex rounded-pill border border-hairline bg-surface-card p-1">
          {[2026, 2027].map((fy) => {
            const active = fy === fyStartYear;
            return (
              <Link
                key={fy}
                href={`/holidays?fy=${fy}` as Route}
                className="rounded-pill px-4 py-1.5 text-[13.5px] font-bold transition-colors"
                style={active ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, color: "#fff" } : { color: "var(--color-ink-muted, #64748b)" }}
              >
                FY{String(fy).slice(2)}
              </Link>
            );
          })}
        </div>

        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft/50 px-4 py-3 text-[13.5px] text-ink-muted" role="note">
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT_DEEP }} />
          {hasReligion ? (
            <span>
              Showing your personalised list for{" "}
              <strong className="text-ink-strong">{RELIGION_LABELS[religion]}</strong> — the company
              holidays plus your religion&apos;s add-ons.
            </span>
          ) : (
            <span>
              Showing the base company holidays. Ask an admin to set your religion to add your
              festival holidays to this list.
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-hairline bg-surface-card px-4 py-10 text-center text-ink-soft">
            No holidays published for this financial year yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {list.map((h) => {
              const d = parseISO(h.holidayDate);
              return (
                <li key={h.id} className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, lineHeight: 1 }}>
                      {format(d, "d")}
                    </div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-ink-soft">{format(d, "MMM")}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-semibold text-ink-strong">{h.name}</span>
                      {h.isFestivalMarker && <Sparkles size={15} style={{ color: ACCENT_DEEP }} />}
                      {h.isOptional && <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-ink-muted">OPTIONAL</span>}
                      {!h.isOfficeClosed && <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-ink-muted">OFFICE OPEN</span>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-muted">{format(d, "EEEE")}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </>
  );
}
