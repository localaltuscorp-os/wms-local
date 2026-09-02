import Link from "next/link";
import {
  Wallet,
  AlertTriangle,
  CalendarClock,
  FileWarning,
  type LucideIcon,
} from "lucide-react";
import { formatInr, formatCount } from "@/lib/format";
import { buildDrillHref } from "@/lib/outstanding/drill-href";

interface Totals {
  totalOutstanding: number;
  overdue: number;
  notDue: number;
  pdcNotReceived: number;
}

interface CardSpec {
  key: keyof Totals;
  label: string;
  sublabel: string;
  tone: "slate" | "red" | "green" | "amber";
  icon: LucideIcon;
  /** money cards format with formatInr; the PDC count formats plainly. */
  kind: "money" | "count";
  /** Filter override applied when the card is clicked (merged onto current). */
  drill: Record<string, string | null>;
}

const SPECS: CardSpec[] = [
  {
    key: "totalOutstanding",
    label: "TOTAL OUTSTANDING",
    sublabel: "Open balance across all entries",
    tone: "slate",
    icon: Wallet,
    kind: "money",
    // No status filter — clear status & pdc so all open rows show.
    drill: { status: null, pdc: null },
  },
  {
    key: "overdue",
    label: "OVERDUE",
    sublabel: "Past due, awaiting collection",
    tone: "red",
    icon: AlertTriangle,
    kind: "money",
    drill: { status: "overdue", pdc: null },
  },
  {
    key: "notDue",
    label: "NOT DUE",
    sublabel: "Scheduled, not yet due",
    tone: "green",
    icon: CalendarClock,
    kind: "money",
    drill: { status: "not_due", pdc: null },
  },
  {
    key: "pdcNotReceived",
    label: "PDC NOT RECEIVED",
    sublabel: "Open entries missing a PDC",
    tone: "amber",
    icon: FileWarning,
    kind: "count",
    drill: { pdc: "1", status: null },
  },
];

export function OutstandingStatCards({
  totals,
  sp,
}: {
  totals: Totals;
  sp: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
      {SPECS.map((spec) => (
        <StatCard
          key={spec.key}
          spec={spec}
          href={buildDrillHref(sp, spec.drill)}
          value={
            spec.kind === "money"
              ? formatInr(totals[spec.key])
              : formatCount(totals[spec.key])
          }
        />
      ))}
    </div>
  );
}

function StatCard({
  spec,
  value,
  href,
}: {
  spec: CardSpec;
  value: string;
  href: ReturnType<typeof buildDrillHref>;
}) {
  const Icon = spec.icon;
  return (
    <Link
      href={href}
      aria-label={`${spec.label} — view matching entries`}
      className="group relative block bg-surface-card rounded-section overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 cursor-pointer"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "16px 18px 15px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 5,
          background: `linear-gradient(90deg, var(--color-${spec.tone}), var(--color-${spec.tone}-deep))`,
        }}
      />
      <span
        aria-hidden
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
        style={{
          background: `color-mix(in srgb, var(--color-${spec.tone}) 14%, transparent)`,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 12,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        {spec.label}
      </span>
      <span
        className="block mt-2 leading-[0.9] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(26px, 2vw, 36px)",
        }}
      >
        {value}
      </span>
      <span
        className="block mt-2 font-bold leading-tight"
        style={{ fontSize: 12, color: "var(--color-ink-soft)" }}
      >
        {spec.sublabel}
      </span>
    </Link>
  );
}
