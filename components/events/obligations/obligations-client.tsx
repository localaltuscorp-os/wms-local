"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Pencil,
  Plus,
  Archive,
  AlertTriangle,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { deleteObligation } from "@/app/(app)/events/obligations/actions";
import { ObligationFormDialog } from "./obligation-form-dialog";
import { CellBumpPopover, STATUS_STYLE } from "./cell-bump-popover";
import {
  classifyCell,
  type CategoryOption,
  type CellStatus,
  type FyMonthCol,
  type ObligationRowVM,
  type ObligationsKpi,
} from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface Props {
  fyStartYear: number;
  fyLabel: string;
  prevHref: string;
  nextHref: string;
  columns: FyMonthCol[];
  rows: ObligationRowVM[];
  kpi: ObligationsKpi | null;
  categoryOptions: CategoryOption[];
}

const LEGEND: Array<{ status: CellStatus; label: string }> = [
  { status: "met", label: "Met" },
  { status: "partial", label: "Partial / In Progress" },
  { status: "missed", label: "Missed (Compulsory)" },
  { status: "future", label: "Future" },
];

export function ObligationsClient({
  fyStartYear,
  fyLabel,
  prevHref,
  nextHref,
  columns,
  rows,
  kpi,
  categoryOptions,
}: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ObligationRowVM | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(o: ObligationRowVM) {
    setEditing(o);
    setFormOpen(true);
  }

  function onArchive(o: ObligationRowVM) {
    if (!window.confirm(`Archive "${o.name}"? Its history and tagged events are kept.`)) return;
    startTransition(async () => {
      const res = await deleteObligation(o.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Obligation archived." });
      router.refresh();
    });
  }

  const kpiPct = kpi && kpi.total > 0 ? Math.round((kpi.onTrack / kpi.total) * 100) : 0;

  return (
    <>
      {/* MINIMAL HEADER (Sir) — the shared PageCommandBar, i.e. the Yearly
          Goals band. What stood here was a 42px display headline under a red
          uppercase eyebrow, a two-line paragraph and an icon tile, all above the
          KPI card that actually answers the question this page exists to answer.
          The New Obligation button keeps its prominence by moving into the
          band's own actions slot, where every other page puts its primary CTA. */}
      <PageCommandBar
        title="Obligations Dashboard"
        hint="Compulsory monthly sessions, counted from tagged calendar events."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--color-altus-red)" }}
          >
            <Plus size={15} strokeWidth={2.6} aria-hidden />
            New Obligation
          </button>
        }
      />

      {/* KPI + FY navigator */}
      <div className="mb-6 flex flex-wrap items-stretch gap-4">
        <div
          className="wg-rise flex min-w-[280px] flex-1 items-center gap-5 rounded-2xl border border-hairline bg-surface-card p-5"
          style={{ maxWidth: 460 }}
        >
          <div
            className="relative grid size-20 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(${ACCENT} ${kpiPct * 3.6}deg, #e2e8f0 0deg)`,
            }}
          >
            <div className="grid size-[62px] place-items-center rounded-full bg-surface-card">
              <span
                className="text-[19px] font-black tabular-nums text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui" }}
              >
                {kpi ? `${kpi.onTrack}/${kpi.total}` : "—"}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">
              On track this month
            </p>
            {kpi ? (
              <>
                <p className="mt-0.5 text-[15px] font-semibold text-ink-strong">
                  {kpi.onTrack} of {kpi.total} compulsory obligations
                </p>
                <p className="text-[13px] text-ink-muted">{kpi.monthLabel}</p>
              </>
            ) : (
              <p className="mt-0.5 text-[14px] text-ink-muted" style={{ maxWidth: "28ch" }}>
                Not the current financial year — showing history only.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={prevHref as Route}
            aria-label="Previous financial year"
            className="inline-flex size-10 items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-ink-soft transition-colors hover:border-[color:var(--ev-accent)] hover:text-[color:var(--ev-accent)]"
            style={{ ["--ev-accent" as string]: ACCENT } as React.CSSProperties}
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </Link>
          <div
            className="min-w-[120px] text-center text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "-0.02em",
            }}
          >
            {fyLabel}
          </div>
          <Link
            href={nextHref as Route}
            aria-label="Next financial year"
            className="inline-flex size-10 items-center justify-center rounded-lg border border-hairline-strong bg-surface-card text-ink-soft transition-colors hover:border-[color:var(--ev-accent)] hover:text-[color:var(--ev-accent)]"
            style={{ ["--ev-accent" as string]: ACCENT } as React.CSSProperties}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {LEGEND.map((l) => {
          const st = STATUS_STYLE[l.status];
          return (
            <span key={l.status} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
              <span
                className="inline-block size-3.5 rounded-[4px] border"
                style={{ background: st.bg, borderColor: st.border }}
              />
              {l.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
          <span className="inline-block size-1.5 rounded-full" style={{ background: ACCENT_DEEP }} />
          Manual Override
        </span>
      </div>

      {/* Compliance grid */}
      {rows.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
          <table className="w-full border-collapse text-left" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-hairline">
                <th
                  className="sticky left-0 z-10 bg-surface-card px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-ink-soft"
                  style={{ minWidth: 240 }}
                >
                  Obligation
                </th>
                {columns.map((c) => (
                  <th
                    key={c.month}
                    className="px-1 py-3 text-center text-[12px] font-bold"
                    style={{ minWidth: 54, color: c.isCurrent ? ACCENT_DEEP : c.isFuture ? "var(--color-ink-soft)" : "var(--color-ink-muted)" }}
                  >
                    <span className="block">{c.label}</span>
                    <span className="block text-[10px] font-semibold opacity-70">
                      &apos;{String(c.calYear % 100).padStart(2, "0")}
                    </span>
                    {c.isCurrent && (
                      <span
                        aria-hidden
                        className="mx-auto mt-0.5 block h-0.5 w-5 rounded-full"
                        style={{ background: ACCENT }}
                      />
                    )}
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-[12px] font-bold uppercase tracking-wide text-ink-soft" style={{ minWidth: 76 }}>
                  Edit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-hairline last:border-0">
                  <td className="sticky left-0 z-10 bg-surface-card px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: o.categoryColor ?? "#cbd5e1" }}
                        title={o.categoryName ?? "No category"}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-bold text-ink-strong">{o.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-muted">
                          {o.counterparty && <span>{o.counterparty}</span>}
                          <span className="tabular-nums">target {o.targetCount}/mo</span>
                          {o.isCompulsory ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
                            >
                              Compulsory
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                              Optional
                            </span>
                          )}
                        </p>
                        {o.penaltyNote && (
                          <p className="mt-1 inline-flex items-start gap-1 text-[11.5px] text-ink-soft">
                            <AlertTriangle size={12} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                            <span className="italic">{o.penaltyNote}</span>
                          </p>
                        )}
                        {/* FY heatmap strip — a compact glance of the year. */}
                        <div className="mt-1.5 flex gap-0.5" aria-hidden>
                          {columns.map((c) => {
                            const cell = o.cells[c.month]!;
                            const status = classifyCell(cell.effective, o.targetCount, o.isCompulsory, c);
                            return (
                              <span
                                key={c.month}
                                className="h-1.5 flex-1 rounded-[2px]"
                                style={{ background: STATUS_STYLE[status].bg, border: `1px solid ${STATUS_STYLE[status].border}` }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                  {columns.map((c) => {
                    const cell = o.cells[c.month]!;
                    const status = classifyCell(cell.effective, o.targetCount, o.isCompulsory, c);
                    return (
                      <td key={c.month} className="px-1 py-2 align-middle">
                        <CellBumpPopover
                          obligationName={o.name}
                          obligationId={o.id}
                          target={o.targetCount}
                          fyStartYear={fyStartYear}
                          col={c}
                          cell={cell}
                          status={status}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(o)}
                        aria-label={`Edit ${o.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                      >
                        <Pencil size={15} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onArchive(o)}
                        disabled={pending}
                        aria-label={`Archive ${o.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-altus-red disabled:opacity-50"
                      >
                        <Archive size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ObligationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        obligation={editing}
        categoryOptions={categoryOptions}
      />
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-solid border-hairline-strong bg-surface-card px-6 py-16 text-center">
      <span
        className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl"
        style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}
      >
        <Gauge size={26} strokeWidth={2.2} />
      </span>
      <h2
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 20 }}
      >
        No Obligations Yet
      </h2>
      <p className="mt-1.5 max-w-md text-[14.5px] text-ink-muted">
        Add a compulsory monthly session (like AICL sessions) and track it against
        a done/target grid across the year. Tag calendar events to it and the
        count fills in automatically.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="brand-btn wg-btn mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        <Plus size={17} strokeWidth={2.6} aria-hidden />
        New obligation
      </button>
    </div>
  );
}
