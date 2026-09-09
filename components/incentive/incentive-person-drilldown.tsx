"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, BadgeIndianRupee, FolderKanban } from "lucide-react";
import { formatInr } from "@/lib/format";
import { getPersonDetail } from "@/app/(app)/incentive/admin-actions";
import type { IncentivePersonDetail } from "@/lib/queries/incentives";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * Read-only per-person incentive drill-down. Fed lazily by the `getPersonDetail`
 * server action (admins → anyone; others → themselves). Controlled from a
 * parent (Dashboard / Targets rows) via `empName` + `onClose`.
 */
export function IncentivePersonDrilldown({
  empName,
  year,
  onClose,
}: {
  empName: string | null;
  year: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<IncentivePersonDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!empName) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setDetail(null);
    getPersonDetail(empName, year)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          onClose();
          return;
        }
        setDetail(res.detail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empName, year]);

  const open = empName != null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl overflow-y-auto rounded-[24px] bg-surface-card p-0 max-h-[calc(100dvh-32px)]"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 28px 70px -28px rgba(15,23,42,0.45)",
          }}
        >
          {/* Glass header band */}
          <div
            className="sticky top-0 z-10 flex items-start justify-between gap-4 px-7 pt-6 pb-4 max-md:px-4"
            style={{
              background: [
                `radial-gradient(130% 200% at 100% 0%, color-mix(in srgb, ${RED} 9%, transparent), transparent 55%)`,
                "rgba(255,255,255,0.88)",
              ].join(", "),
              backdropFilter: "blur(10px) saturate(140%)",
              borderBottom: "1px solid var(--color-hairline)",
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {empName && <EmployeeAvatar name={empName} size="lg" background={`linear-gradient(135deg, ${RED}, ${RED_DEEP})`} />}
              <div className="min-w-0">
                <Dialog.Title
                  className="truncate text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: 24,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  {empName}
                </Dialog.Title>
                <Dialog.Description className="text-ink-subtle font-semibold mt-0.5" style={{ fontSize: 13 }}>
                  Incentive detail · {year}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-7 pb-7 pt-5 max-md:px-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-ink-subtle">
                <Loader2 size={18} className="animate-spin" />
                <span className="font-semibold" style={{ fontSize: 14 }}>
                  Loading…
                </span>
              </div>
            ) : detail ? (
              <DetailBody detail={detail} />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailBody({ detail }: { detail: IncentivePersonDetail }) {
  const { entries, projects, totals } = detail;
  const paidPct =
    totals.totalApproved > 0 ? Math.min(100, (totals.totalPaid / totals.totalApproved) * 100) : 0;
  return (
    <div className="space-y-6">
      {/* Totals */}
      <div>
        <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
          <StatChip label="Earned (YTD)" value={formatInr(totals.totalApproved)} tone="ink" />
          <StatChip label="Paid" value={formatInr(totals.totalPaid)} tone="green" />
          <StatChip label="Unpaid" value={formatInr(totals.totalUnpaid)} tone={totals.totalUnpaid > 0 ? "red" : "ink"} />
        </div>
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(totals.totalApproved > 0 ? 2 : 0, paidPct)}%`,
              background: `linear-gradient(90deg, #22c55e, ${GREEN_DEEP})`,
            }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] font-semibold text-ink-subtle">
          {totals.totalApproved > 0 ? `${paidPct.toFixed(0)}% of earned settled` : "Nothing earned this year yet"}
        </p>
      </div>

      {/* Permanent entries */}
      <section>
        <SectionHead icon={<BadgeIndianRupee size={15} strokeWidth={2.3} />} label="Permanent Incentives" />
        {entries.length === 0 ? (
          <Empty>No permanent incentives this year.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--color-surface-soft)" }}>
                  <Th>Incentive</Th>
                  <Th>Month</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Approved</Th>
                  <Th align="right">Paid</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                    <Td>{e.incentiveName}</Td>
                    <Td subtle>{fmtMonth(e.periodMonth)}</Td>
                    <Td align="right">{formatInr(e.amount)}</Td>
                    <Td align="right">{formatInr(e.approvedAmt)}</Td>
                    <Td align="right" tone="green">
                      {formatInr(e.paidAmt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Project legs */}
      <section>
        <SectionHead icon={<FolderKanban size={15} strokeWidth={2.3} />} label="Project Incentives" />
        {projects.length === 0 ? (
          <Empty>No project incentives this year.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--color-surface-soft)" }}>
                  <Th>Project</Th>
                  <Th>Role</Th>
                  <Th>Month</Th>
                  <Th align="right">Approved</Th>
                  <Th align="right">Paid</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                    <Td>{p.projectName || "—"}</Td>
                    <Td subtle>{p.role === "supervisor" ? "Supervisor" : "Intern"}</Td>
                    <Td subtle>{fmtMonth(p.periodMonth)}</Td>
                    <Td align="right">{formatInr(p.approved)}</Td>
                    <Td align="right" tone="green">
                      {formatInr(p.paid)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: "ink" | "green" | "red" }) {
  const color =
    tone === "green" ? GREEN_DEEP : tone === "red" ? "var(--color-red-deep)" : "var(--color-ink-strong)";
  const accent = tone === "green" ? GREEN : tone === "red" ? "var(--color-altus-red)" : "#334155";
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${accent} 4%, var(--color-surface-soft))`,
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <div className="uppercase font-black tracking-[0.06em] text-ink-subtle" style={{ fontSize: 10.5 }}>
        {label}
      </div>
      <div
        className="tabular-nums mt-1"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 19,
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 text-ink-strong">
      <span
        className="inline-flex items-center justify-center h-6 w-6 rounded-lg"
        style={{ background: `color-mix(in srgb, ${RED} 10%, transparent)`, color: RED_DEEP }}
      >
        {icon}
      </span>
      <span className="font-bold" style={{ fontSize: 14.5 }}>
        {label}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-semibold text-ink-subtle" style={{ fontSize: 13.5 }}>
      {children}
    </p>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3 py-2 uppercase font-bold tracking-[0.05em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 10.5, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  subtle = false,
  tone,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  subtle?: boolean;
  tone?: "green";
}) {
  const color = tone === "green" ? GREEN_DEEP : subtle ? "var(--color-ink-subtle)" : "var(--color-ink-soft)";
  return (
    <td
      className="px-3 py-2 tabular-nums whitespace-nowrap font-semibold"
      style={{ fontSize: 13, textAlign: align, color }}
    >
      {children}
    </td>
  );
}

function fmtMonth(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})/);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2]! - 1]} ${m[1]}`;
}
