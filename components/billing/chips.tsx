import type { BillingDocStatus, BillingDocType } from "@/db/enums";
import { docTypeShort, docTypeStyle, statusView } from "@/lib/billing/ui";

/**
 * The two badges the Billing module repeats everywhere. Pure render — no hooks,
 * no "use client" — so a server list and a client table can use the same ones.
 */

export function DocTypeChip({ type }: { type: BillingDocType }) {
  const s = docTypeStyle(type);
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: s.bg, color: s.ink, boxShadow: `inset 0 0 0 1px ${s.border}` }}
    >
      {docTypeShort(type)}
    </span>
  );
}

export function StatusBadge({
  status,
  isOverdue = false,
}: {
  status: BillingDocStatus;
  isOverdue?: boolean;
}) {
  const { label, style } = statusView(status, isOverdue);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: style.bg, color: style.ink, boxShadow: `inset 0 0 0 1px ${style.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} aria-hidden />
      {label}
    </span>
  );
}
