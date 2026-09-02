"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Target, Loader2, Pencil, Search, Crosshair, TrendingUp, Gauge } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { IncentiveTargetVsActual } from "@/lib/queries/incentives";
import { setIncentiveYearTarget } from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { IncentivePersonDrilldown } from "./incentive-person-drilldown";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/* Attainment threshold colors: green ≥100, amber ≥60, red below. */
function attainTone(pct: number | null): { color: string; bg: string } {
  if (pct == null) return { color: "var(--color-ink-subtle)", bg: "var(--color-hairline)" };
  if (pct >= 100) return { color: GREEN_DEEP, bg: GREEN };
  if (pct >= 60) return { color: "#B45309", bg: "#F59E0B" };
  return { color: "var(--color-red-deep)", bg: "var(--color-altus-red)" };
}

/** Compact SVG attainment ring — green ≥100, amber ≥60, red below. */
function AttainRing({ pct, size = 40 }: { pct: number | null; size?: number }) {
  const tone = attainTone(pct);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = pct == null ? 0 : Math.min(100, pct) / 100;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.bg}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fill)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span
        className="absolute tabular-nums font-black"
        style={{ fontSize: size >= 56 ? 13 : 9.5, color: tone.color }}
      >
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </span>
    </span>
  );
}

type SortKey = "name" | "target" | "actual" | "attain";

export function IncentiveTargets({
  data,
  year,
  isAdmin,
}: {
  data: IncentiveTargetVsActual;
  year: number;
  isAdmin: boolean;
}) {
  const { rows, totals } = data;
  const [drillName, setDrillName] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState<number>(0);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "actual",
    dir: "desc",
  });

  function openEdit(name: string, current: number) {
    setEditName(name);
    setEditValue(current);
  }

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) => r.empName.toLowerCase().includes(needle))
      : rows.slice();
    base.sort((a, b) => {
      const va =
        sort.key === "name"
          ? a.empName.toLowerCase()
          : sort.key === "attain"
            ? (a.attainmentPct ?? -1)
            : a[sort.key];
      const vb =
        sort.key === "name"
          ? b.empName.toLowerCase()
          : sort.key === "attain"
            ? (b.attainmentPct ?? -1)
            : b[sort.key];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [rows, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  const onTargetCount = rows.filter((r) => r.attainmentPct != null && r.attainmentPct >= 100).length;
  const withTargets = rows.filter((r) => r.target > 0).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <SummaryCard
          icon={<Crosshair size={17} strokeWidth={2.4} />}
          accent="#334155"
          label="Total target"
          value={formatInr(totals.target)}
          caption={`${withTargets} ${withTargets === 1 ? "person has" : "people have"} a ${year} target`}
          delay={0}
        />
        <SummaryCard
          icon={<TrendingUp size={17} strokeWidth={2.4} />}
          accent="#E10600"
          label="Total actual"
          value={formatInr(totals.actual)}
          caption="incentive earned so far"
          delay={50}
        />
        <SummaryCard
          icon={<Gauge size={17} strokeWidth={2.4} />}
          accent={attainTone(totals.attainmentPct).color}
          label="Attainment"
          value={totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
          caption={`${onTargetCount} at or above target`}
          ring={<AttainRing pct={totals.attainmentPct} size={56} />}
          delay={100}
        />
      </div>

      <section
        className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
        style={{
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
          animationDelay: "140ms",
        }}
      >
        <header className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-grid size-9 place-items-center rounded-xl"
              style={{ background: `color-mix(in srgb, #E10600 10%, transparent)`, color: "#A80400" }}
            >
              <Target size={18} strokeWidth={2.3} />
            </span>
            <div>
              <h2
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 21,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Target vs Actual
              </h2>
              <p className="text-[13px] font-medium text-ink-subtle">
                Year target compared to incentive earned · {year}
              </p>
            </div>
          </div>
          <label
            className="flex h-10 w-full max-w-[260px] items-center gap-2 rounded-xl bg-surface-card px-3.5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            <Search size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Local search — person" title="Local search — filters only the list on this page" aria-label="Local search — person — this page only"
              className="w-full bg-transparent text-[14px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
            />
          </label>
        </header>

        {rows.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No targets or earnings this year yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <SortTh label="Person" k="name" sort={sort} onSort={toggleSort} />
                  <SortTh label="Target" k="target" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Actual" k="actual" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Attainment" k="attain" sort={sort} onSort={toggleSort} />
                  {isAdmin && (
                    <th
                      className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
                      style={{ fontSize: 11, textAlign: "right" }}
                    >
                      Set
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={isAdmin ? 5 : 4}
                      className="py-8 text-center text-[14px] font-semibold text-ink-subtle"
                    >
                      No people match “{q}”.
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const tone = attainTone(r.attainmentPct);
                  const barPct = r.attainmentPct == null ? 0 : Math.min(100, r.attainmentPct);
                  return (
                    <tr
                      key={r.empName}
                      className="border-t group transition-colors hover:bg-[color-mix(in_srgb,#E10600_3%,transparent)]"
                      style={{ borderColor: "var(--color-hairline)" }}
                    >
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => setDrillName(r.empName)}
                          className="flex cursor-pointer items-center gap-2.5 text-left"
                        >
                          <EmployeeAvatar name={r.empName} size="sm" />
                          <span
                            className="font-bold text-ink-strong transition-colors group-hover:text-[#A80400]"
                            style={{ fontSize: 14 }}
                          >
                            {r.empName}
                          </span>
                        </button>
                      </td>
                      <Td align="right">{r.target > 0 ? formatInr(r.target) : "—"}</Td>
                      <Td align="right" bold>
                        {formatInr(r.actual)}
                      </Td>
                      <td className="py-2.5 pl-3 min-w-[200px]">
                        <div className="flex items-center gap-2.5">
                          <AttainRing pct={r.attainmentPct} size={34} />
                          <div
                            className="flex-1 h-2.5 rounded-full overflow-hidden"
                            style={{ background: "var(--color-hairline)" }}
                          >
                            <span
                              className="block h-full rounded-full transition-all"
                              style={{ width: `${Math.max(2, barPct)}%`, background: tone.bg }}
                            />
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEdit(r.empName, r.target)}
                            className="bg-surface-card wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-soft transition-colors hover:text-ink-strong"
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                            }}
                          >
                            <Pencil size={12} strokeWidth={2.4} />
                            Target
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-3 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right" bold>
                    {formatInr(totals.target)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(totals.actual)}
                  </Td>
                  <td className="py-3 pl-3">
                    <span
                      className="tabular-nums font-black"
                      style={{ fontSize: 13, color: attainTone(totals.attainmentPct).color }}
                    >
                      {totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
                    </span>
                  </td>
                  {isAdmin && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <IncentivePersonDrilldown empName={drillName} year={year} onClose={() => setDrillName(null)} />

      {isAdmin && (
        <SetTargetDialog
          empName={editName}
          year={year}
          initial={editValue}
          onClose={() => setEditName(null)}
        />
      )}
    </div>
  );
}

function SetTargetDialog({
  empName,
  year,
  initial,
  onClose,
}: {
  empName: string | null;
  year: number;
  initial: number;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(String(initial || ""));
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setValue(initial ? String(initial) : "");
  }, [initial, empName]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empName) return;
    const amount = Number(value.replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      fireToast({ message: "Enter a valid amount.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await setIncentiveYearTarget({ empName, year, targetAmount: amount });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Target set for ${empName}.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={empName != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-[22px] bg-surface-card p-6"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.8), 0 24px 60px -24px rgba(15,23,42,0.4)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            {empName && <EmployeeAvatar name={empName} size="md" />}
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21, letterSpacing: "-0.02em" }}
              >
                Set {year} Target
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-semibold" style={{ fontSize: 13.5 }}>
                {empName} · whole-year incentive target
              </Dialog.Description>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block font-semibold text-ink-strong mb-1.5" style={{ fontSize: 13.5 }}>
                Target Amount (₹)
              </span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 250000"
                className="w-full rounded-chip border border-hairline bg-surface-card px-3.5 h-11 text-ink-strong tabular-nums outline-none transition-all focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/25"
                style={{ fontSize: 15 }}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button type="button" className="bg-surface-card cursor-pointer px-4 py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 14 }} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="wg-btn wg-sheen inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50"
                style={{
                  fontSize: 14,
                  background: `linear-gradient(135deg, #E10600, #A80400)`,
                  boxShadow: `0 10px 24px -12px color-mix(in srgb, #A80400 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} strokeWidth={2.4} />}
                {pending ? "Saving…" : "Save Target"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SummaryCard({
  icon,
  accent,
  label,
  value,
  caption,
  ring,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  ring?: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn flex items-start justify-between gap-3 rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div>
        <div className="flex items-center gap-2">
          <span
            className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
            style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
          >
            {icon}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            {label}
          </span>
        </div>
        <div
          className="mt-2 tabular-nums text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(21px, 1.7vw, 27px)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      </div>
      {ring}
    </div>
  );
}

type Sort = { key: SortKey; dir: "asc" | "desc" };

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <th
      className="pb-2 whitespace-nowrap"
      style={{ textAlign: align }}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
          active ? "text-ink-strong" : "text-ink-subtle hover:text-ink-soft"
        }`}
      >
        {label}
        {active && <span style={{ color: "#A80400" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`}
      style={{ fontSize: 14, textAlign: align }}
    >
      {children}
    </td>
  );
}
