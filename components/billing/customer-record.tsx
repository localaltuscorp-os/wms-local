"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileDown, FileText, Paperclip, Pencil } from "lucide-react";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import { customerToPrintData, openKycPrintView } from "@/lib/billing/kyc-print";
import type { CustomerDetail } from "@/lib/queries/billing-customers";

/**
 * ONE CLIENT, READ-ONLY. `CustomerDetailBody` is the sections themselves and
 * is shared by the Full Record page and the Customer Master's Quick View, so
 * the two show the same fields in the same order.
 */

export function CustomerRecord({ customer: c }: { customer: CustomerDetail }) {
  return (
    <>
      <Link
        href={"/billing/customers" as Route}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted hover:text-ink-strong"
      >
        <ArrowLeft size={14} /> Customer Master
      </Link>
      <header className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
            Full Record · <span className="font-mono">{c.clientCode ?? "—"}</span>
          </p>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(24px,2.8vw,34px)",
              letterSpacing: "-0.025em",
            }}
          >
            {c.name}
          </h1>
          <StatusLine c={c} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openKycPrintView(customerToPrintData(c))}
            className="inline-flex h-10 items-center gap-2 rounded-chip bg-white px-4 text-[13px] font-bold"
            style={{ boxShadow: "inset 0 0 0 1px #FCA5A5", color: "#B91C1C" }}
          >
            <FileDown size={15} /> View form (PDF)
          </button>
          <Link
            href={`/billing/customers/${c.id}/edit` as Route}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
          >
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </header>
      <CustomerDetailBody c={c} />
    </>
  );
}

export function StatusLine({ c }: { c: CustomerDetail }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className="font-bold" style={{ color: c.isActive ? "#15803D" : "var(--color-ink-muted)" }}>
        {c.isActive ? "Active" : "Inactive"}
      </span>
      <span className="text-ink-muted">·</span>
      <span className="text-ink-muted">Created {c.createdAt.slice(0, 10)}</span>
    </p>
  );
}

export function CustomerDetailBody({ c, compact }: { c: CustomerDetail; compact?: boolean }) {
  const cols = compact ? "md:grid-cols-2" : "md:grid-cols-3";
  return (
    <div className="grid gap-3">
      <Card title="Identity" accent="#E10600">
        <Pairs
          cols={cols}
          pairs={[
            ["GSTIN", c.gstin],
            ["Sales person", c.salesPersonName],
            ["Tags", c.tags.join(", ")],
            ["Industry type", c.industryTypes.join(", ")],
            ["Product types", c.productTypes.join(", ")],
            ["Business category", c.businessCategory],
            ["Nature of business", c.natureOfBusiness],
          ]}
        />
      </Card>
      <Card title="Registration & Tax" accent="#DC2626">
        <Pairs
          cols={cols}
          pairs={[
            ["PAN / IT No", c.pan],
            ["MSME / Udyam No", c.msmeNo],
            ["GST registration type", c.gstRegType],
            ["Currency", c.currency],
            ["Country", c.country],
            ["State", c.stateName],
          ]}
        />
      </Card>
      <Card title="Contact Person" accent="#059669">
        {c.contacts.length === 0 ? (
          <Empty>No contacts.</Empty>
        ) : (
          c.contacts.map((p, i) => (
            <div key={i} className="mb-3 border-b border-hairline pb-3 last:mb-0 last:border-0 last:pb-0">
              <p className="mb-1.5 text-[12.5px] font-bold text-ink-strong">
                {[p.firstName, p.lastName].filter(Boolean).join(" ") || `Contact ${i + 1}`}
                {i === 0 ? <span className="ml-1.5 text-[11px] font-semibold text-ink-muted">(primary)</span> : null}
              </p>
              <Pairs
                cols={cols}
                pairs={[
                  ["Contact no", p.phone],
                  ["WhatsApp no", p.whatsapp],
                  ["Email", p.email],
                  ["Designation", p.designation],
                  ["Department", p.department],
                  ["Contact notes", p.notes],
                ]}
              />
            </div>
          ))
        )}
      </Card>
      <Card title="Addresses" accent="#EA580C">
        {c.addresses.length === 0 ? (
          <Empty>No addresses.</Empty>
        ) : (
          <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
            {c.addresses.map((a, i) => (
              <div key={i} className="rounded-[12px] border border-hairline p-3 text-[13px]">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                  {a.kind === "billing" ? "Billing" : "Shipping"}
                </p>
                {[a.line1, a.line2, a.line3, a.line4].filter(Boolean).map((l, j) => (
                  <p key={j}>{l}</p>
                ))}
                <p>{[a.city, a.stateName, a.pincode].filter(Boolean).join(", ")}</p>
                <p className="text-ink-muted">{a.country}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Commercial & Credit" accent="#2563EB">
        <Pairs
          cols={cols}
          pairs={[
            ["Payment terms", c.paymentTerms],
            ["Credit days", c.creditDays],
            ["Other references", c.otherReferences],
            ["Client notes", c.notes],
          ]}
        />
      </Card>
      <Card title="Online & Payment Options" accent="#0D9488">
        <Pairs
          cols={cols}
          pairs={[
            ["LinkedIn address", c.linkedinUrl],
            ["Instagram handle", c.instagramHandle],
            ["Subscription", c.subscription],
            ["EMI", c.emi],
            ["Module wise payment", c.moduleWisePayment],
          ]}
        />
      </Card>
      <Card title="Introducer" accent="#B45309">
        <Pairs
          cols={cols}
          pairs={[
            ["Website", c.introducer?.website],
            ["Introducer name", [c.introducer?.firstName, c.introducer?.lastName].filter(Boolean).join(" ")],
            ["Social media", c.introducer?.socialMedia],
            ["City", c.introducer?.city],
            ["Email", c.introducer?.email],
            ["WhatsApp number", c.introducer?.whatsapp],
            ["Company / organisation", c.introducer?.company],
            ["Designation / role", c.introducer?.designation],
            ["Nature of business / work", c.introducer?.natureOfWork],
            ["Business category", c.introducer?.businessCategory],
            ["Came to know through", c.introducer?.cameThrough],
            ["Introduced by", c.introducer?.introducedBy],
          ]}
        />
      </Card>
      <Card title="Documents" accent="#E10600">
        {c.documents.length === 0 ? (
          <Empty>No documents attached.</Empty>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {c.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[12.5px] font-bold"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)", color: BILLING_PURPLE_DEEP }}
                >
                  {d.contentType?.startsWith("image/") ? <Paperclip size={13} /> : <FileText size={13} />}
                  {d.slot === "front"
                    ? "Card front · "
                    : d.slot === "back"
                      ? "Card back · "
                      : d.slot === "brochure"
                        ? "Brochure · "
                        : d.slot === "video"
                          ? "Video · "
                          : ""}
                  {d.fileName}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] p-4" style={{ ...CARD_STYLE, borderLeft: `3px solid ${accent}` }}>
      <h2 className="mb-2.5 text-[11.5px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pairs({ pairs, cols }: { pairs: [string, string | null | undefined][]; cols: string }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-4 gap-y-2.5 ${cols}`}>
      {pairs.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-bold text-ink-muted">{k}</dt>
          <dd className="whitespace-pre-wrap break-words text-[13px] text-ink-strong">{v?.trim() ? v : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink-muted">{children}</p>;
}
