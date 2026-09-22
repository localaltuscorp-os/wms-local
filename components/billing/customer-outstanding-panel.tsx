import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, IndianRupee } from "lucide-react";
import { formatInr, formatDate } from "@/lib/format";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import type { CustomerOutstanding } from "@/lib/queries/billing-outstanding";

/**
 * WHAT THIS CUSTOMER STILL OWES — Billing's window into Outstanding.
 *
 * Billing knows what was invoiced and Outstanding knows what came back; this is
 * the one place a person looking at a customer can see both. "Open the ledger"
 * goes to the Outstanding dashboard already filtered to this client, so the
 * answer to "which ones?" is one click rather than a search.
 *
 * IT SAYS WHAT IT MATCHED ON. A receivable names its client in free text, so
 * this panel joins by name (see lib/queries/billing-outstanding.ts). A customer
 * whose name is spelled differently in the two modules would otherwise read as
 * a confident zero — the empty state names the string it looked for instead, so
 * a mismatch looks like a mismatch rather than a paid-up account.
 */
export function CustomerOutstandingPanel({
  customerName,
  data,
  base,
}: {
  customerName: string;
  data: CustomerOutstanding;
  /** Which Outstanding door to link to — Billing's, from a Billing screen. */
  base: string;
}) {
  const ledgerHref = `${base}?client=${encodeURIComponent(customerName)}#entries` as Route;
  const overdueHref =
    `${base}?client=${encodeURIComponent(customerName)}&status=overdue#entries` as Route;

  return (
    <section style={CARD_STYLE} className="rounded-section p-4">
      <header className="flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg"
          style={{ background: "var(--color-surface-soft)", color: BILLING_PURPLE_DEEP }}
        >
          <IndianRupee size={14} strokeWidth={2.4} aria-hidden />
        </span>
        <h2 className="flex-1 text-[15px] font-bold text-ink-strong">Outstanding</h2>
        {data.entries > 0 && (
          <Link
            href={ledgerHref}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold"
            style={{ color: BILLING_PURPLE_DEEP }}
          >
            Open the ledger
            <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
          </Link>
        )}
      </header>

      {data.entries === 0 ? (
        <p className="mt-2.5 text-[12.5px] leading-snug text-ink-muted">
          No receivables matched <strong className="text-ink-soft">“{customerName}”</strong>.
          Outstanding records a client by name, so a different spelling there shows as nothing
          here — worth a look in the ledger before reading this as paid up.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Figure label="Open balance" value={formatInr(data.balance)} />
            <Figure
              label="Overdue"
              value={formatInr(data.overdue)}
              tone={data.overdue > 0 ? "red" : undefined}
              href={data.overdue > 0 ? overdueHref : undefined}
            />
            <Figure label="Not yet due" value={String(data.notDueCount)} />
          </div>
          <p className="mt-2.5 text-[12px] text-ink-muted">
            {data.entries} {data.entries === 1 ? "installment" : "installments"} on record
            {data.oldestDue ? (
              <>
                {" · oldest unpaid due "}
                <strong className="text-ink-soft">{formatDate(new Date(data.oldestDue))}</strong>
              </>
            ) : null}
            {" · matched by name"}
          </p>
        </>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "red";
  href?: Route;
}) {
  const color = tone === "red" ? BILLING_PURPLE : "var(--color-ink-strong)";
  const body = (
    <>
      <span
        className="block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
      >
        {label}
      </span>
      <span className="mt-0.5 block text-[19px] font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-lg px-2.5 py-2 transition-colors hover:bg-[color:var(--color-surface-soft)]"
      style={{ border: "1px solid var(--color-hairline)" }}
    >
      {body}
    </Link>
  ) : (
    <div
      className="rounded-lg px-2.5 py-2"
      style={{ border: "1px solid var(--color-hairline)" }}
    >
      {body}
    </div>
  );
}
