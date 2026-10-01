import Link from "next/link";
import type { Route } from "next";
import { FilePlus2 } from "lucide-react";
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
import { DocumentYearPicker } from "@/components/billing/document-year-picker";

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
  // YEAR — the calendar year of the document date, picked with the dropdown
  // beside New document. Defaults to this year, like the old Billing page.
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  const yearRaw = Number(one(sp.year));
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= currentYear + 1 ? yearRaw : currentYear;
  if (!years.includes(year)) years.unshift(year);

  const parsed = BillingListFilterSchema.safeParse({
    // These five are comma-separated lists now (?type=tax_invoice,proforma).
    // `one` would keep only the first value, so the raw parameter goes
    // straight to the schema, which splits and validates it.
    type: sp.type,
    status: sp.status,
    customerId: sp.customerId,
    entityId: sp.entityId,
    finYear: sp.finYear,
    from: one(sp.from) ?? `${year}-01-01`,
    to: one(sp.to) ?? `${year}-12-31`,
    q: one(sp.q),
    overdue: one(sp.overdue) === "true" ? true : null,
    archived: one(sp.archived) === "true" ? true : null,
  });
  const filters = parsed.success ? parsed.data : {};

  // Paging is in the URL like every other filter (?page=2&size=50), so the
  // server only ever reads one page of documents.
  const PAGE_SIZES = [10, 20, 50, 100];
  const size = PAGE_SIZES.includes(Number(one(sp.size))) ? Number(one(sp.size)) : 20;
  const page = Math.max(1, Math.trunc(Number(one(sp.page)) || 1));
  const documentHref = (patch: Record<string, string | null>): Route => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (first && key !== "page" && !(key in patch)) next.set(key, first);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return `/billing/documents${qs ? `?${qs}` : ""}` as Route;
  };

  const [{ rows, total }, summary, customers] = await Promise.all([
    listBillingDocuments(filters, { limit: size, offset: (page - 1) * size }),
    billingSummary(filters),
    listBillingCustomers(),
  ]);

  return (
    <PageShell width="wide">
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h1
              className="text-ink-strong"
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
            <DocumentYearPicker years={years} activeYear={year} currentYear={currentYear} />
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
            href={documentHref({ type: t, status: null, overdue: null })}
          />
        ))}
        <Tile
          label="Outstanding"
          value={rupeesCompact(summary.outstandingValue)}
          caption={`${summary.outstandingCount} awaiting payment`}
          href={documentHref({ status: "generated,sent", overdue: null })}
        />
        <Tile
          label="Overdue"
          value={rupeesCompact(summary.overdueValue)}
          caption={`${summary.overdueCount} past due date`}
          accent
          href={documentHref({ status: "generated,sent", overdue: "true" })}
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
  href,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
  href: Route;
}) {
  return (
    <Link href={href} className="block rounded-[20px] px-4 py-3.5 transition hover:-translate-y-px" style={CARD_STYLE}>
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
    </Link>
  );
}
