"use client";

import { fireToast } from "@/lib/toast";
import type { CustomerDetail } from "@/lib/queries/billing-customers";

/**
 * THE CUSTOMER KYC AS A PRINTABLE SHEET — "View in PDF Format" / "View form
 * (PDF)". Opens a new tab with the print dialog up; "Save as PDF" there makes
 * the file. Used by the KYC form (before the client is saved, from what is on
 * screen) and by the Customer Master (from the saved record), so both print
 * the same layout.
 *
 * Every value is HTML-escaped: this writes user-typed text into a document.
 */

export interface KycPrintData {
  name: string;
  clientCode: string;
  gstin: string;
  salesPerson: string;
  exportLabel: string;
  grade: string;
  tags: string;
  customerTypes: string;
  industryTypes: string;
  productTypes: string;
  businessCategory?: string;
  natureOfBusiness?: string;
  linkedinUrl?: string;
  instagramHandle?: string;
  subscription?: string;
  emi?: string;
  moduleWisePayment?: string;
  introducer?: [string, string][];
  pan: string;
  msmeNo: string;
  gstRegType: string;
  currency: string;
  country: string;
  stateName: string;
  paymentTerms: string;
  freightCharges: string;
  creditDays: string;
  creditLimit: string;
  transporter: string;
  quantityDeviation: string;
  otherReferences: string;
  notes: string;
  contacts: {
    firstName: string; lastName: string; phone: string; whatsapp?: string; email: string;
    designation: string; department: string; notes: string;
  }[];
  addresses: {
    kind: "billing" | "shipping";
    line1: string; line2: string; line3: string; line4: string;
    city: string; stateName: string; country: string; pincode: string;
  }[];
  documents: string[];
}

export function openKycPrintView(d: KycPrintData) {
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "<br>");
  const rows = (pairs: [string, string][]) =>
    `<table>${pairs
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v ? esc(v) : '<span class="nil">—</span>'}</td></tr>`)
      .join("")}</table>`;
  const section = (title: string, body: string) => `<section><h2>${esc(title)}</h2>${body}</section>`;

  const contactHtml =
    d.contacts
      .map(
        (c, i) =>
          `<h3>Contact ${i + 1}${i === 0 ? " (primary)" : ""}</h3>` +
          rows([
            ["Name", [c.firstName, c.lastName].filter(Boolean).join(" ")],
            ["Contact no", c.phone],
            ["WhatsApp no", c.whatsapp ?? ""],
            ["Email", c.email],
            ["Designation", c.designation],
            ["Department", c.department],
            ["Contact notes", c.notes],
          ]),
      )
      .join("") || '<span class="nil">No contacts.</span>';
  const addressHtml =
    d.addresses
      .map(
        (a) =>
          `<h3>${a.kind === "billing" ? "Billing address" : "Shipping address"}</h3>` +
          rows([
            ["Address", [a.line1, a.line2, a.line3, a.line4].filter(Boolean).join(", ")],
            ["City", a.city],
            ["State", a.stateName],
            ["Country", a.country],
            ["Pin code", a.pincode],
          ]),
      )
      .join("") || '<span class="nil">No addresses.</span>';
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Customer KYC - ${esc(d.name || d.clientCode)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:32px;font-size:12.5px}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #A80400;padding-bottom:10px;margin-bottom:14px}
  h1{margin:0;font-size:22px} .code{font-family:ui-monospace,monospace;font-weight:700;color:#A80400}
  section{margin-bottom:14px;break-inside:avoid} h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#A80400;margin:0 0 6px}
  h3{font-size:12.5px;margin:8px 0 4px} table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #e2e8f0;padding:5px 8px;text-align:left;vertical-align:top} th{width:32%;background:#f8fafc;font-weight:600;color:#475569}
  .nil{color:#94a3b8} ul{margin:0;padding-left:18px} @page{margin:14mm} @media print{body{margin:0}}
</style></head><body>
<header><div><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:700">Customer KYC</div>
<h1>${esc(d.name) || '<span class="nil">Unnamed client</span>'}</h1></div>
<div>Client code <span class="code">${esc(d.clientCode) || "—"}</span><br>${esc(today)}</div></header>
${section(
  "Identity",
  rows([
    ["GSTIN", d.gstin],
    ["Company name", d.name],
    ["Sales person", d.salesPerson],
    ["Tags", d.tags],
    ["Industry type", d.industryTypes],
    ["Product types", d.productTypes],
    ["Business category", d.businessCategory ?? ""],
    ["Nature of business", d.natureOfBusiness ?? ""],
  ]),
)}
${section(
  "Registration & Tax",
  rows([
    ["PAN / IT No", d.pan],
    ["MSME / Udyam No", d.msmeNo],
    ["GST registration type", d.gstRegType],
    ["Currency", d.currency],
    ["Country", d.country],
    ["State", d.stateName],
  ]),
)}
${section("Contact Person", contactHtml)}
${section(
  "Online & Payment Options",
  rows([
    ["LinkedIn address", d.linkedinUrl ?? ""],
    ["Instagram handle", d.instagramHandle ?? ""],
    ["Subscription", d.subscription ?? ""],
    ["EMI", d.emi ?? ""],
    ["Module wise payment", d.moduleWisePayment ?? ""],
  ]),
)}
${section("Addresses", addressHtml)}
${d.introducer && d.introducer.some(([, v]) => v) ? section("Introducer", rows(d.introducer)) : ""}
${section(
  "Commercial & Credit",
  rows([
    ["Payment terms", d.paymentTerms],
    ["Credit days", d.creditDays],
    ["Other references", d.otherReferences],
    ["Client notes", d.notes],
  ]),
)}
${section(
  "Documents",
  d.documents.length
    ? `<ul>${d.documents.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : '<span class="nil">No documents attached.</span>',
)}
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    fireToast({ message: "Allow pop-ups for this site to open the PDF view.", type: "error" });
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** A saved client (from getCustomerDetail) in the print sheet's shape. */
export function customerToPrintData(c: CustomerDetail): KycPrintData {
  return {
    name: c.name,
    clientCode: c.clientCode ?? "",
    gstin: c.gstin ?? "",
    salesPerson: c.salesPersonName ?? "",
    exportLabel: c.isExport ? "Yes" : "No",
    grade: c.grade ?? "",
    tags: c.tags.join(", "),
    customerTypes: c.customerTypes.join(", "),
    industryTypes: c.industryTypes.join(", "),
    productTypes: c.productTypes.join(", "),
    businessCategory: c.businessCategory ?? "",
    natureOfBusiness: c.natureOfBusiness ?? "",
    linkedinUrl: c.linkedinUrl ?? "",
    instagramHandle: c.instagramHandle ?? "",
    subscription: c.subscription ?? "",
    emi: c.emi ?? "",
    moduleWisePayment: c.moduleWisePayment ?? "",
    introducer: introducerRows(c.introducer),
    pan: c.pan ?? "",
    msmeNo: c.msmeNo ?? "",
    gstRegType: c.gstRegType ?? "",
    currency: c.currency,
    country: c.country,
    stateName: c.stateName ?? "",
    paymentTerms: c.paymentTerms ?? "",
    freightCharges: c.freightCharges ?? "",
    creditDays: c.creditDays ?? "",
    creditLimit: c.creditLimit ?? "",
    transporter: c.transporter ?? "",
    quantityDeviation: c.quantityDeviation ?? "",
    otherReferences: c.otherReferences ?? "",
    notes: c.notes ?? "",
    contacts: c.contacts,
    addresses: c.addresses,
    documents: c.documents.map((d) =>
      d.slot === "front"
        ? `Business card (front): ${d.fileName}`
        : d.slot === "back"
          ? `Business card (back): ${d.fileName}`
          : d.slot === "brochure"
            ? `Brochure: ${d.fileName}`
            : d.slot === "video"
              ? `Video: ${d.fileName}`
              : d.fileName,
    ),
  };
}

/** The introducer as label/value rows for the print sheet. */
export function introducerRows(i: CustomerDetail["introducer"] | undefined): [string, string][] {
  const v = i ?? {};
  return [
    ["Website", v.website ?? ""],
    ["Introducer name", [v.firstName, v.lastName].filter(Boolean).join(" ")],
    ["Social media", v.socialMedia ?? ""],
    ["City", v.city ?? ""],
    ["Email", v.email ?? ""],
    ["WhatsApp number", v.whatsapp ?? ""],
    ["Company / organisation", v.company ?? ""],
    ["Designation / role", v.designation ?? ""],
    ["Nature of business / work", v.natureOfWork ?? ""],
    ["Business category", v.businessCategory ?? ""],
    ["Came to know through", v.cameThrough ?? ""],
    ["Introduced by", v.introducedBy ?? ""],
  ];
}
