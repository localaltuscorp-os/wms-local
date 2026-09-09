"use client";

import { useMemo, useState } from "react";
import { ExternalLink, PenLine, ShieldCheck } from "lucide-react";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  type AgreementStatus,
} from "@/db/enums";
import type { AgreementRow } from "@/lib/agreements/types";
import type { SignatureStatus } from "@/lib/documents/signing";
import { SignatureStatusPill } from "@/components/documents/signature-status-pill";
import { formatDate } from "@/lib/format";

/** Latest DigiLocker-signature status per agreement id (from the server page). */
export type AgreementSignatures = Record<
  string,
  { signatureId: string; status: SignatureStatus; signedPdfPath: string | null }
>;

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/** status → chip colours (brand-consistent, no raw palette leaking to callers). */
const STATUS_STYLE: Record<AgreementStatus, { bg: string; fg: string }> = {
  draft: { bg: "color-mix(in srgb, var(--color-ink-soft) 14%, transparent)", fg: "var(--color-ink-soft)" },
  sent: { bg: "color-mix(in srgb, #C2740A 16%, transparent)", fg: "#8A5207" },
  signed: { bg: "color-mix(in srgb, #15803d 16%, transparent)", fg: "#15803d" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatDate(d);
}

function StatusChip({ status }: { status: AgreementStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
      style={{ background: s.bg, color: s.fg }}
    >
      {AGREEMENT_STATUS_LABELS[status]}
    </span>
  );
}

type Filter = AgreementStatus | "all";

/** Admin tracker: every agreement, filterable by status, with PDF + sign links. */
export function StatusTracker({
  rows,
  signatures = {},
}: {
  rows: AgreementRow[];
  signatures?: AgreementSignatures;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, draft: 0, sent: 0, signed: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const tabs: Filter[] = ["all", ...AGREEMENT_STATUSES];

  return (
    <section
      className="wg-rise rounded-2xl bg-surface-card p-5 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -20px rgba(15,23,42,0.35)" }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: "-0.02em" }}
        >
          Agreement Tracker
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const active = t === filter;
            const label = t === "all" ? "All" : AGREEMENT_STATUS_LABELS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className="rounded-pill px-3 py-1 text-[12px] font-bold transition-colors"
                style={
                  active
                    ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff" }
                    : { background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
                }
              >
                {label}
                <span className="ml-1.5 opacity-70">{counts[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface-soft px-4 py-8 text-center text-[13px] text-ink-subtle">
          No agreements {filter === "all" ? "yet" : `marked ${AGREEMENT_STATUS_LABELS[filter as AgreementStatus].toLowerCase()}`}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                <th className="pb-2 pr-3">Employee</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Verified E-Sign</th>
                <th className="pb-2 pr-3">Signed</th>
                <th className="pb-2 pr-3 text-right">Links</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="py-2.5 pr-3 font-semibold text-ink-strong">{r.employeeName}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">{AGREEMENT_TYPE_LABELS[r.type]}</td>
                  <td className="py-2.5 pr-3"><StatusChip status={r.status} /></td>
                  <td className="py-2.5 pr-3">
                    <SignatureStatusPill status={signatures[r.id]?.status ?? null} />
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">
                    {r.status === "signed" ? (
                      <span>
                        {fmt(r.signedAt)}
                        {r.signedName ? <span className="text-ink-subtle"> · {r.signedName}</span> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/agreements/pdf/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-ink-soft hover:text-ink-strong"
                        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
                      >
                        <ExternalLink size={12} strokeWidth={2.4} /> PDF
                      </a>
                      <a
                        href={`/agreements/sign/${r.signToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold"
                        style={{ color: GREEN_DEEP, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GREEN} 40%, transparent)` }}
                      >
                        <PenLine size={12} strokeWidth={2.4} /> Sign
                      </a>
                      <a
                        href={`/documents/sign?kind=agreement&doc=${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold"
                        style={{ color: GREEN_DEEP, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GREEN} 40%, transparent)` }}
                      >
                        <ShieldCheck size={12} strokeWidth={2.4} /> Verify
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
