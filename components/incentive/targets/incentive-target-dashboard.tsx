"use client";

import * as React from "react";
import { Crosshair, Gauge, Package, TrendingUp, Users } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/admin/ui/data-table";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { fetchTargetBoard, deleteTargetPlan } from "@/app/(app)/incentive/target-actions";
import { IncentiveSection, Segmented } from "@/components/incentive/ui/chrome";
import { IncentiveKpi, IncentiveKpiRow } from "@/components/incentive/ui/kpi";
import { IncentiveEmptyState } from "@/components/incentive/ui/states";
import { attainmentTone, toneBase, toneFill, toneInk, type Tone } from "@/components/incentive/ui/tone";
import { TargetFormDialog } from "./target-form-dialog";
import { TargetPerformanceChart, TargetMixChart, TargetAchievementChart } from "./target-charts";
import type {
  TargetBoard,
  TargetPlanRow,
  TargetProductOption,
  TeamOption,
} from "@/lib/queries/incentive-target-plans";
import type { EmployeeOption } from "@/lib/queries/employees";
import {
  TARGET_PERIOD_TYPES,
  TARGET_PERIOD_LABELS,
  periodPresets,
  weekOptions,
  monthOptions,
  quarterOptions,
  yearOptions,
  type TargetPeriodType,
} from "@/lib/incentive/target-period";

type View = "performance" | "mix" | "achievement";
type Level = "team" | "user";
type Measure = "quantity" | "amount";

const LEVEL_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
  { value: "performance", label: "Target Performance" },
  { value: "mix", label: "Target Mix" },
  { value: "achievement", label: "Achievement" },
];

const MEASURE_OPTIONS: Array<{ value: Measure; label: string }> = [
  { value: "amount", label: "Amount" },
  { value: "quantity", label: "Quantity" },
];

function statusTone(status: string): Tone {
  return status === "Completed" ? "slate" : status === "Active" ? "green" : "blue";
}

export function IncentiveTargetDashboard({
  initial,
  products,
  teams,
  users,
  isAdmin,
  canSeeTeam,
}: {
  initial: TargetBoard;
  products: TargetProductOption[];
  teams: TeamOption[];
  users: EmployeeOption[];
  isAdmin: boolean;
  canSeeTeam: boolean;
}) {
  const [board, setBoard] = React.useState<TargetBoard>(initial);
  const [level, setLevel] = React.useState<Level>(initial.level);
  const [subjectId, setSubjectId] = React.useState<string>(initial.subjectId ?? "");
  const [type, setType] = React.useState<TargetPeriodType>(initial.period.type);
  const [value, setValue] = React.useState<string>(initial.period.value);
  const [productName, setProductName] = React.useState<string>(initial.productName ?? "");
  const [view, setView] = React.useState<View>("performance");
  const [measure, setMeasure] = React.useState<Measure>("amount");
  const [pending, startTransition] = React.useTransition();

  const prev = React.useRef({ level, subjectId, type, value, productName });

  function load(next: Partial<{ level: Level; subjectId: string; type: TargetPeriodType; value: string; productName: string }>) {
    const target = { level, subjectId, type, value, productName, ...next };
    setLevel(target.level);
    setSubjectId(target.subjectId);
    setType(target.type);
    setValue(target.value);
    setProductName(target.productName);
    const snap = { ...prev.current };
    prev.current = target;
    startTransition(async () => {
      const res = await fetchTargetBoard({
        type: target.type,
        value: target.value,
        level: target.level,
        subjectId: target.subjectId || null,
        productName: target.productName || null,
      });
      if (!res.ok) {
        setLevel(snap.level);
        setSubjectId(snap.subjectId);
        setType(snap.type);
        setValue(snap.value);
        setProductName(snap.productName);
        prev.current = snap;
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setBoard(res.data);
    });
  }

  const subjectOptions: Array<{ id: string; name: string }> = level === "team" ? teams : users;

  // Period value options for the custom picker, always including the live value.
  const valueOptions = (
    type === "week" ? weekOptions() : type === "month" ? monthOptions() : type === "quarter" ? quarterOptions() : yearOptions()
  );
  const hasValue = valueOptions.some((o) => o.value === value);

  const onSubjectLevelChange = (lv: Level) => {
    setLevel(lv);
    setSubjectId("");
    load({ level: lv, subjectId: "" });
  };

  const summary = board.summary;

  const columns: DataTableColumn<TargetPlanRow>[] = [
    {
      key: "subject",
      label: "Team / User",
      sortValue: (r) => r.subjectName.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-[13.5px] font-bold text-ink-strong">{r.subjectName}</span>
          <span className="text-[11.5px] font-semibold text-ink-subtle">
            {r.targetLevel === "team" ? "Team" : "User"}
          </span>
        </span>
      ),
    },
    {
      key: "product",
      label: "Product",
      sortValue: (r) => r.productName.toLowerCase(),
      render: (r) => <span className="text-[13px] font-semibold text-ink-soft">{r.productName}</span>,
    },
    {
      key: "periodType",
      label: "Period Type",
      sortValue: (r) => r.periodType,
      render: (r) => (
        <span className="text-[12.5px] font-semibold text-ink-soft capitalize">{r.periodType}</span>
      ),
    },
    {
      key: "period",
      label: "Period",
      sortValue: (r) => r.periodStart,
      render: (r) => <span className="text-[12.5px] tabular-nums text-ink-soft">{r.periodLabel}</span>,
    },
    {
      key: "targetQuantity",
      label: "Target Qty",
      align: "right",
      sortValue: (r) => r.quantity,
      render: (r) => <span className="text-[13px] tabular-nums">{Math.round(r.quantity)}</span>,
    },
    {
      key: "targetAmount",
      label: "Target Amount",
      align: "right",
      sortValue: (r) => r.targetAmount,
      render: (r) => <span className="text-[13px] font-semibold tabular-nums text-ink-strong">{formatInr(r.targetAmount)}</span>,
    },
    {
      key: "actualQuantity",
      label: "Actual Qty",
      align: "right",
      render: () => (
        <span className="text-[12.5px] text-ink-subtle" title="The source ledger stores amounts only, not a sold quantity.">
          —
        </span>
      ),
    },
    {
      key: "actualAmount",
      label: "Actual Amount",
      align: "right",
      sortValue: (r) => r.actualAmount,
      render: (r) => <span className="text-[13px] font-bold tabular-nums text-ink-strong">{formatInr(r.actualAmount)}</span>,
    },
    {
      key: "achievement",
      label: "Achievement",
      align: "right",
      sortValue: (r) => r.achievement ?? -1,
      render: (r) => (
        <span className="text-[13px] font-bold tabular-nums" style={{ color: toneInk(attainmentTone(r.achievement)) }}>
          {r.achievement == null ? "—" : `${r.achievement.toFixed(0)}%`}
        </span>
      ),
    },
    {
      key: "setDate",
      label: "Set Date",
      sortValue: (r) => r.targetSetDate,
      render: (r) => <span className="text-[12.5px] tabular-nums text-ink-soft">{r.targetSetDate}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => r.status,
      render: (r) => {
        const tone = statusTone(r.status);
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-bold"
            style={{ background: toneFill(tone), color: toneInk(tone) }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: toneBase(tone) }} />
            {r.status}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3" data-incentive-targets aria-busy={pending}>
      {/* ── Control bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-card px-3 py-2">
        {canSeeTeam && (
          <Segmented ariaLabel="Target level" options={LEVEL_OPTIONS} value={level} disabled={pending} onChange={onSubjectLevelChange} />
        )}
        <select
          aria-label={level === "team" ? "Team" : "User"}
          value={subjectId}
          disabled={pending}
          onChange={(e) => load({ subjectId: e.target.value })}
          className="h-9 max-w-[220px] rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-altus-red"
        >
          <option value="">{level === "team" ? "All teams" : "All users"}</option>
          {subjectOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Period type"
          value={type}
          disabled={pending}
          onChange={(e) => {
            const t = e.target.value as TargetPeriodType;
            setType(t);
            const opts = t === "week" ? weekOptions() : t === "month" ? monthOptions() : t === "quarter" ? quarterOptions() : yearOptions();
            load({ type: t, value: opts[opts.length - 1]?.value ?? "" });
          }}
          className="h-9 rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-altus-red"
        >
          {TARGET_PERIOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TARGET_PERIOD_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          aria-label="Period"
          value={value}
          disabled={pending}
          onChange={(e) => load({ value: e.target.value })}
          className="h-9 rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-altus-red"
        >
          {!hasValue ? <option value={value}>{value}</option> : null}
          {valueOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Product"
          value={productName}
          disabled={pending}
          onChange={(e) => load({ productName: e.target.value })}
          className="h-9 rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-altus-red"
        >
          <option value="">All Products</option>
          {products.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        <Segmented ariaLabel="Measure" options={MEASURE_OPTIONS} value={measure} onChange={setMeasure} size="sm" />

        {isAdmin && (
          <div className="ml-auto">
            <TargetFormDialog products={products} teams={teams} users={users} onSaved={() => load({})} />
          </div>
        )}
      </div>

      {/* ── Quick period presets ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Quick period</span>
        {periodPresets().map((p) => {
          const active = p.type === type && p.value === value;
          return (
            <button
              key={p.id}
              type="button"
              disabled={pending}
              onClick={() => load({ type: p.type, value: p.value })}
              className="rounded-pill border px-2.5 py-1 text-[12px] font-bold transition-colors"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      color: "#fff",
                      borderColor: "transparent",
                    }
                  : { borderColor: "var(--color-hairline)", color: "var(--color-ink-muted)" }
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ── Summary ── */}
      <IncentiveKpiRow cols={4}>
        <IncentiveKpi
          label="Total Target"
          value={measure === "amount" ? formatInr(summary.totalTarget) : String(Math.round(summary.totalQuantity))}
          caption={`${summary.productsTargeted} ${summary.productsTargeted === 1 ? "product" : "products"} targeted`}
          tone="slate"
          icon={<Crosshair size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Actual"
          value={formatInr(summary.totalActual)}
          caption="from existing incentive data"
          tone="red"
          icon={<TrendingUp size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Achievement"
          value={summary.achievement == null ? "—" : `${summary.achievement.toFixed(0)}%`}
          caption="actual ÷ target"
          tone={attainmentTone(summary.achievement)}
          icon={<Gauge size={13} strokeWidth={2.4} />}
        />
        <IncentiveKpi
          label="Products"
          value={String(summary.productsTargeted)}
          caption="in this period"
          tone="blue"
          icon={<Package size={13} strokeWidth={2.4} />}
        />
      </IncentiveKpiRow>

      {/* ── Dashboard ── */}
      <IncentiveSection
        title="Target Dashboard"
        hint={board.period.label}
        actions={
          <Segmented ariaLabel="Visualization" options={VIEW_OPTIONS} value={view} onChange={setView} size="sm" />
        }
      >
        <div className={pending ? "opacity-60" : ""}>
          {board.products.length === 0 ? (
            <IncentiveEmptyState
              icon={Crosshair}
              title="No targets in this period"
              body={isAdmin ? "Add a target above to start planning." : "No targets are set for this selection yet."}
            />
          ) : view === "performance" ? (
            <TargetPerformanceChart buckets={board.products} />
          ) : view === "mix" ? (
            <TargetMixChart buckets={board.products} measure={measure} />
          ) : (
            <TargetAchievementChart buckets={board.products} />
          )}
        </div>
      </IncentiveSection>

      {/* ── Records table ── */}
      <IncentiveSection
        title="Target Records"
        hint={`${board.rows.length} ${board.rows.length === 1 ? "row" : "rows"}`}
        bare
      >
        <DataTable
          rows={board.rows}
          columns={columns}
          getRowKey={(r) => r.lineId}
          searchText={(r) => `${r.subjectName} ${r.productName}`}
          searchPlaceholder="Local search — team, user or product"
          initialSort={{ key: "period", dir: "desc" }}
          stickyFirstColumn
          dense
          pageSize={25}
          filters={[
            {
              label: "Type",
              options: [
                { value: "team", label: "Team" },
                { value: "user", label: "User" },
              ],
              match: (r, v) => r.targetLevel === v,
            },
            {
              label: "Period",
              options: [
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
                { value: "quarter", label: "Quarter" },
                { value: "year", label: "Year" },
              ],
              match: (r, v) => r.periodType === v,
            },
            {
              label: "Status",
              options: [
                { value: "Upcoming", label: "Upcoming" },
                { value: "Active", label: "Active" },
                { value: "Completed", label: "Completed" },
              ],
              match: (r, v) => r.status === v,
            },
          ]}
          rowActions={
            isAdmin
              ? (r) => (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Delete this ${r.productName} target for ${r.subjectName}?`)) return;
                      startTransition(async () => {
                        const res = await deleteTargetPlan({ planId: r.planId });
                        if (!res.ok) {
                          fireToast({ message: res.error, type: "error" });
                          return;
                        }
                        fireToast({ message: "Target deleted." });
                        load({});
                      });
                    }}
                    className="text-[12px] font-bold text-ink-subtle transition-colors hover:text-altus-red"
                  >
                    Delete
                  </button>
                )
              : undefined
          }
          emptyState={
            <IncentiveEmptyState
              icon={Users}
              title="No target records"
              body="No targets match this period, scope and product."
            />
          }
        />
      </IncentiveSection>
    </div>
  );
}
