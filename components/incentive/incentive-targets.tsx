"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Crosshair, Gauge, Loader2, Pencil, Target, TrendingUp } from "lucide-react";
import { formatInr } from "@/lib/format";
import { nameKey } from "@/lib/incentive/payout-sources";
import type { IncentiveTargetVsActual, IncentiveTargetVsActualRow } from "@/lib/queries/incentives";
import { setIncentiveYearTarget } from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { IncentivePersonDrilldown } from "./incentive-person-drilldown";
import { IncentiveKpi, IncentiveKpiRow } from "./ui/kpi";
import { Segmented, INCENTIVE_BTN_NEUTRAL } from "./ui/chrome";
import { IncentiveEmptyState } from "./ui/states";
import { attainmentTone, toneBase, toneInk } from "./ui/tone";

/**
 * TARGET VS ACTUAL.
 *
 * The information design is unchanged — person, their year target, what they
 * actually earned, and how far along that is, with a totals row and a
 * click-through to the person's own ledger. What changed is the machinery
 * underneath: this was a hand-rolled table with its own sort headers, its own
 * search box and its own cell components, and it is now the app's shared
 * `DataTable`, so it has the same header type, the same search naming, dropdown
 * filters, a pinned identity column and the same empty state as every other
 * table in the app.
 *
 * Attainment used to be drawn THREE times in one cell — an SVG ring with a
 * percentage inside it, a colour, and a full-width bar. It is a bar and a
 * figure now; the ring survives once, in the summary card, where it is the only
 * thing in its corner.
 *
 * Nothing about targets themselves moved: `setIncentiveYearTarget` is the same
 * admin-only action, and the rows are the same server-narrowed set
 * (`restrictTargetVsActual`) this component was always handed.
 */

const VIEW_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

type ScopeView = "team" | "user";

/** Compact SVG attainment ring — the summary card's only, now. */
function AttainRing({ pct, size = 44 }: { pct: number | null; size?: number }) {
  const tone = attainmentTone(pct);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = pct == null ? 0 : Math.min(100, pct) / 100;
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneBase(tone)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fill)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span
        className="absolute tabular-nums font-bold"
        style={{ fontSize: 11, color: toneInk(tone) }}
      >
        {pct == null ? "-" : `${Math.round(pct)}%`}
      </span>
    </span>
  );
}

export function IncentiveTargets({
  data,
  year,
  isAdmin,
  me,
  canSeeTeam = false,
}: {
  data: IncentiveTargetVsActual;
  year: number;
  isAdmin: boolean;
  /** The signed-in person, so the User view can find their own row. */
  me?: { id: string; name: string };
  /**
   * Whether this viewer has a team at all — the SAME answer the dashboard's
   * switch is built from (`AnalyticsScope.canSeeTeam`, resolved on the server).
   * No new rule: the switch only ever narrows rows the viewer was already sent.
   */
  canSeeTeam?: boolean;
}) {
  const [drillName, setDrillName] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState<number>(0);
  const [view, setView] = React.useState<ScopeView>("team");

  const myKey = me ? nameKey(me.name) : "";
  const rows = React.useMemo(
    () => (view === "user" && myKey ? data.rows.filter((r) => nameKey(r.empName) === myKey) : data.rows),
    [data.rows, view, myKey],
  );

  /** Totals follow the rows on screen, so the footer can never contradict them. */
  const totals = React.useMemo(() => {
    if (view !== "user") return data.totals;
    const target = rows.reduce((s, r) => s + r.target, 0);
    const actual = rows.reduce((s, r) => s + r.actual, 0);
    return { target, actual, attainmentPct: target > 0 ? (actual / target) * 100 : null };
  }, [rows, view, data.totals]);

  function openEdit(name: string, current: number) {
    setEditName(name);
    setEditValue(current);
  }

  const onTargetCount = rows.filter((r) => r.attainmentPct != null && r.attainmentPct >= 100).length;
  const withTargets = rows.filter((r) => r.target > 0).length;

  const columns: DataTableColumn<IncentiveTargetVsActualRow>[] = [
    {
      key: "name",
      label: "Person",
      sortValue: (r) => r.empName.toLowerCase(),
      render: (r) => (
        <button
          type="button"
          onClick={() => setDrillName(r.empName)}
          className="flex cursor-pointer items-center gap-2 text-left"
        >
          <EmployeeAvatar name={r.empName} size="sm" />
          <span className="text-[13.5px] font-bold text-ink-strong transition-colors hover:text-altus-red">
            {r.empName}
          </span>
        </button>
      ),
    },
    {
      key: "target",
      label: "Target",
      align: "right",
      sortValue: (r) => r.target,
      render: (r) => (
        <span className="text-[13px] tabular-nums">{r.target > 0 ? formatInr(r.target) : "—"}</span>
      ),
    },
    {
      key: "actual",
      label: "Actual",
      align: "right",
      sortValue: (r) => r.actual,
      render: (r) => (
        <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(r.actual)}</span>
      ),
    },
    {
      key: "attain",
      label: "Attainment",
      sortValue: (r) => r.attainmentPct ?? -1,
      render: (r) => {
        const tone = attainmentTone(r.attainmentPct);
        const barPct = r.attainmentPct == null ? 0 : Math.min(100, r.attainmentPct);
        return (
          <span className="flex min-w-[150px] items-center gap-2">
            <span
              className="h-2 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--color-hairline)" }}
              aria-hidden
            >
              <span
                className="block h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, barPct)}%`, background: toneBase(tone) }}
              />
            </span>
            <span
              className="w-10 shrink-0 text-right text-[13px] font-bold tabular-nums"
              style={{ color: toneInk(tone) }}
            >
              {r.attainmentPct == null ? "—" : `${Math.round(r.attainmentPct)}%`}
            </span>
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canSeeTeam && me && (
          <Segmented ariaLabel="Whose targets" options={VIEW_OPTIONS} value={view} onChange={setView} />
        )}
        <span className="text-[12.5px] font-semibold text-ink-subtle">
          Year target compared with incentive earned · {year}
        </span>
      </div>

      <IncentiveKpiRow cols={3}>
        <IncentiveKpi
          label="Total target"
          value={formatInr(totals.target)}
          caption={`${withTargets} ${withTargets === 1 ? "person has" : "people have"} a ${year} target`}
          tone="slate"
          icon={<Crosshair size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Total actual"
          value={formatInr(totals.actual)}
          caption="incentive earned so far"
          tone="red"
          icon={<TrendingUp size={13} strokeWidth={2.4} />}
        />
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-grid size-5 shrink-0 place-items-center rounded-md"
                style={{
                  background: `color-mix(in srgb, ${toneBase(attainmentTone(totals.attainmentPct))} 12%, transparent)`,
                  color: toneInk(attainmentTone(totals.attainmentPct)),
                }}
              >
                <Gauge size={13} strokeWidth={2.4} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                Attainment
              </span>
            </span>
            <span
              className="mt-1.5 block tabular-nums text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: "clamp(18px, 1.35vw, 22px)",
                lineHeight: 1,
              }}
            >
              {totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
            </span>
            <span className="mt-1 block text-[12px] font-medium text-ink-subtle">
              {onTargetCount} at or above target
            </span>
          </div>
          <AttainRing pct={totals.attainmentPct} size={48} />
        </div>
      </IncentiveKpiRow>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.empName}
        searchText={(r) => r.empName}
        searchPlaceholder="Local search — person"
        initialSort={{ key: "actual", dir: "desc" }}
        stickyFirstColumn
        dense
        pageSize={30}
        filters={[
          {
            label: "Target",
            options: [
              { value: "set", label: "Has a target" },
              { value: "none", label: "No target" },
            ],
            match: (r, v) => (v === "set" ? r.target > 0 : r.target === 0),
          },
          {
            label: "Attainment",
            options: [
              { value: "on", label: "At or above target" },
              { value: "near", label: "60–99%" },
              { value: "behind", label: "Below 60%" },
            ],
            match: (r, v) => {
              const p = r.attainmentPct;
              if (p == null) return false;
              return v === "on" ? p >= 100 : v === "near" ? p >= 60 && p < 100 : p < 60;
            },
          },
        ]}
        rowActions={
          isAdmin
            ? (r) => (
                <button
                  type="button"
                  onClick={() => openEdit(r.empName, r.target)}
                  className={INCENTIVE_BTN_NEUTRAL}
                  style={{ height: 32 }}
                >
                  <Pencil size={13} strokeWidth={2.4} />
                  Target
                </button>
              )
            : undefined
        }
        footerRow={
          <tr className="border-t border-hairline-strong">
            <td className="px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-strong">
              Total
            </td>
            <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
              {formatInr(totals.target)}
            </td>
            <td className="px-5 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
              {formatInr(totals.actual)}
            </td>
            <td
              className="px-5 py-2.5 text-[13px] font-bold tabular-nums"
              style={{ color: toneInk(attainmentTone(totals.attainmentPct)) }}
            >
              {totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
            </td>
            {isAdmin ? <td /> : null}
          </tr>
        }
        emptyState={
          <IncentiveEmptyState
            icon={Target}
            title={`No targets or earnings in ${year} yet`}
            body={
              isAdmin
                ? "Set a year target on a person's row once they appear here, or pick a different year above."
                : "Your target for the year has not been set yet. The dashboard will prompt you when a monthly target is missing."
            }
          />
        }
      />

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
    const amount = Number(value.replace(/\brs\.?/gi, "").replace(/[₹,\s]/g, ""));
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
        <Dialog.Overlay className="fixed inset-0 z-[90]" style={{ background: "rgba(15,23,42,0.45)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-surface-card p-5"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <div className="mb-4 flex items-center gap-3">
            {empName && <EmployeeAvatar name={empName} size="md" />}
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-bold text-ink-strong">
                Set {year} target
              </Dialog.Title>
              <Dialog.Description className="text-[13px] font-medium text-ink-muted">
                {empName} · whole-year incentive target
              </Dialog.Description>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-bold text-ink-strong">Target amount (Rs.)</span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 250000"
                className="h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium tabular-nums text-ink-strong outline-none transition-colors focus:border-altus-red"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className={INCENTIVE_BTN_NEUTRAL} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Target size={14} strokeWidth={2.4} aria-hidden />
                )}
                {pending ? "Saving…" : "Save target"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
