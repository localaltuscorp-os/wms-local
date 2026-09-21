import Link from "next/link";
import type { Route } from "next";
import { FilePlus2, ReceiptIndianRupee } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listBillingEntities } from "@/lib/billing/entities";
import { BILLING_DOC_TYPE_LABELS } from "@/db/enums";
import { BillingListFilterSchema } from "@/lib/validators/billing";
import {
  billingSummary,
  listBillingCustomers,
  listBillingDocuments,
} from "@/lib/queries/billing-documents";
import { recentFinancialYears } from "@/lib/billing/numbering";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE, rupeesCompact } from "@/lib/billing/ui";
import { BillingDocumentsList } from "@/components/billing/documents-list";

/**
 * /billing/documents — the document ledger.
 *
 * A sibling of the existing `/billing` landing page (the Google-Sheets revenue
 * ledger), not a replacement for it: the two surfaces share the Billing room.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : null;
};

export default async function BillingDocumentsPage({ searchParams }: PageProps) {
  await requireWorkspace("billing");
  const sp = await searchParams;

  // Unknown or malformed filter values are dropped rather than 500-ing a list.
  // YEAR — the calendar year of the document date, picked with the pills
  // beside New document. Defaults to this year, like the old Billing page.
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  const yearRaw = Number(one(sp.year));
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= currentYear + 1 ? yearRaw : currentYear;
  if (!years.includes(year)) years.unshift(year);

  const parsed = BillingListFilterSchema.safeParse({
    type: one(sp.type),
    status: one(sp.status),
    customerId: one(sp.customerId),
    entityId: one(sp.entityId),
    finYear: one(sp.finYear),
    from: one(sp.from) ?? `${year}-01-01`,
    to: one(sp.to) ?? `${year}-12-31`,
    q: one(sp.q),
    archived: one(sp.archived) === "true" ? true : null,
  });
  const filters = parsed.success ? parsed.data : {};

  // Paging is in the URL like every other filter (?page=2&size=50), so the
  // server only ever reads one page of documents.
  const PAGE_SIZES = [10, 20, 50, 100];
  const size = PAGE_SIZES.includes(Number(one(sp.size))) ? Number(one(sp.size)) : 20;
  const page = Math.max(1, Math.trunc(Number(one(sp.page)) || 1));

  const [{ rows, total }, summary, customers] = await Promise.all([
    listBillingDocuments(filters, { limit: size, offset: (page - 1) * size }),
    billingSummary(filters),
    listBillingCustomers(),
  ]);

  return (
    <PageShell width="wide">
      <header
        className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
        style={{
          background: [
            `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${BILLING_PURPLE} 9%, transparent), transparent 55%)`,
            `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${BILLING_PURPLE} 5%, transparent), transparent 52%)`,
            "rgba(255, 255, 255, 0.72)",
          ].join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
            >
              <ReceiptIndianRupee size={13} strokeWidth={2.6} /> Billing
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px,3.4vw,42px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Documents
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Year pills first, then New document. Each keeps the other
                filters and goes back to page 1. */}
            <nav aria-label="Document year" className="flex flex-wrap items-center gap-2">
              {years.map((y) => {
                const active = y === year;
                const next = new URLSearchParams();
                for (const [k, v] of Object.entries(sp)) {
                  const val = Array.isArray(v) ? v[0] : v;
                  if (val && k !== "year" && k !== "page") next.set(k, val);
                }
                if (y !== currentYear) next.set("year", String(y));
                const qs = next.toString();
                return (
                  <Link
                    key={y}
                    href={`/billing/documents${qs ? `?${qs}` : ""}` as Route}
                    aria-current={active ? "page" : undefined}
                    className="inline-flex h-10 items-center rounded-chip px-3.5 text-[13px] font-bold transition"
                    style={
                      active
                        ? { background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})`, color: "#fff" }
                        : { boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: "var(--color-ink-muted)" }
                    }
                  >
                    {y}
                  </Link>
                );
              })}
            </nav>
            <Link
              href={"/billing/documents/new" as Route}
              className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
            >
              <FilePlus2 size={15} /> New document
            </Link>
          </div>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
        {(["quotation", "proforma_invoice", "tax_invoice"] as const).map((t) => (
          <Tile
            key={t}
            label={BILLING_DOC_TYPE_LABELS[t]}
            value={rupeesCompact(summary.byType[t].value)}
            caption={`${summary.byType[t].count} document${summary.byType[t].count === 1 ? "" : "s"}`}
          />
        ))}
        <Tile
          label="Outstanding"
          value={rupeesCompact(summary.outstandingValue)}
          caption={`${summary.outstandingCount} awaiting payment`}
        />
        <Tile
          label="Overdue"
          value={rupeesCompact(summary.overdueValue)}
          caption={`${summary.overdueCount} past due date`}
          accent
        />
      </section>

      <BillingDocumentsList
        rows={rows}
        total={total}
        page={page}
        pageSize={size}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        entities={(await listBillingEntities()).map((e) => ({ id: e.id, label: e.displayName }))}
        finYears={recentFinancialYears(4)}
      />
    </PageShell>
  );
}

function Tile({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[20px] px-4 py-3.5" style={CARD_STYLE}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</div>
      <div
        className="mt-1 text-[20px] font-black tabular-nums"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          color: accent ? "#EA580C" : undefined,
        }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-muted">{caption}</div>
    </div>
  );
}
