import Link from "next/link";
import type { Route } from "next";
import { requireAdmin } from "@/lib/auth/current";
import { listHolidays } from "@/lib/queries/holidays";
import { HolidayList } from "@/components/admin/holiday-list";

export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const now = new Date();
  const parsed = Number(sp.year);
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : now.getUTCFullYear();

  const rows = await listHolidays(year);
  const items = rows.map((r) => ({
    id: r.id,
    holidayDate: r.holidayDate,
    label: r.label,
    isActive: r.isActive,
  }));
  const activeCount = items.filter((i) => i.isActive).length;

  // Year selector range: current year ±2.
  const baseYear = now.getUTCFullYear();
  const years = [baseYear - 1, baseYear, baseYear + 1, baseYear + 2];
  if (!years.includes(year)) years.unshift(year);
  years.sort((a, b) => a - b);

  return (
    <div>
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
          Admin · Attendance
        </div>
        <h1
          className="mt-1 text-ink-strong"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Holidays
        </h1>
        <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
          {items.length} in {year} · {activeCount} active · Marked off on the
          attendance calendar
        </p>
      </header>

      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-subtle mr-1">
          Year
        </span>
        {years.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={`/admin/holidays?year=${y}` as Route}
              className="rounded-pill px-3.5 py-1.5 text-[14px] font-semibold tabular-nums transition-colors"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, #E10600, #A80400)",
                      color: "#fff",
                    }
                  : {
                      background: "var(--color-surface-card)",
                      color: "var(--color-ink-soft)",
                      border: "1px solid var(--color-hairline)",
                    }
              }
            >
              {y}
            </Link>
          );
        })}
      </div>

      <HolidayList items={items} year={year} />
    </div>
  );
}
