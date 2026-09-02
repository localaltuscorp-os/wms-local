import Link from "next/link";
import type { Route } from "next";
import { CalendarDays } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listHolidays } from "@/lib/queries/holidays";
import { AdminSection } from "@/components/admin/ui/section-shell";
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
    <AdminSection
      eyebrow="Admin · Attendance"
      title="Holidays"
      subtitle={`${items.length} in ${year} · ${activeCount} active · Marked off on the attendance calendar`}
      icon={CalendarDays}
      stats={[
        { label: `In ${year}`, value: items.length },
        { label: "Active", value: activeCount, tone: "green" },
      ]}
      actions={
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle mr-0.5">
            Year
          </span>
          {years.map((y) => {
            const active = y === year;
            return (
              <Link
                key={y}
                href={`/admin/holidays?year=${y}` as Route}
                aria-current={active ? "page" : undefined}
                className="wg-btn rounded-pill px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, #E10600, #A80400)",
                        color: "#fff",
                        boxShadow: "0 4px 14px -6px rgba(225,6,0,0.55)",
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
      }
    >
      <HolidayList items={items} year={year} />
    </AdminSection>
  );
}
