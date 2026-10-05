import Link from "next/link";
import type { Route } from "next";
import {
  CC_TIMEFRAMES,
  CC_TIMEFRAME_LABEL,
  type CcTimeframe,
} from "@/lib/compliance/cc-timeframes";

export function CcTimeframeTabs({
  active,
  date,
  year,
  who,
}: {
  active: CcTimeframe;
  date: string;
  year: number;
  who?: string;
}) {
  const href = (view: CcTimeframe) => {
    const params = new URLSearchParams({ view, date, year: String(year) });
    if (who) params.set("who", who);
    return `/employees/cc?${params.toString()}` as Route;
  };

  return (
    <nav
      aria-label="Compliance timeframe"
      className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-hairline bg-white p-1"
    >
      {CC_TIMEFRAMES.map((view) => {
        const selected = view === active;
        return (
          <Link
            key={view}
            href={href(view)}
            aria-current={selected ? "page" : undefined}
            className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-extrabold uppercase tracking-[0.04em] transition-colors"
            style={
              selected
                ? { background: "#d81f12", color: "#fff" }
                : { color: "rgba(15,23,42,.64)" }
            }
          >
            {CC_TIMEFRAME_LABEL[view]}
          </Link>
        );
      })}
    </nav>
  );
}
