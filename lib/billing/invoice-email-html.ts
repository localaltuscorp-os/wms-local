/**
 * THE INVOICE, AS THE BODY OF THE EMAIL.
 *
 * Manan, 2026-09-19: the message itself should show the document — "in message
 * body I want that template picture" — with the PDF still attached below it.
 *
 * Built from the SAME view model the PDF and the on-screen preview use
 * (buildInvoiceViewModel), so the three can never disagree about a figure.
 * Email-client HTML: tables and inline styles only, no classes, no external
 * CSS, no images that need fetching — Gmail and Outlook strip or block all of
 * those. Every value is escaped: this is user-typed text going into markup.
 *
 * Pure and client-safe, so the composer can show exactly what will be sent.
 */

import type { InvoiceViewModel, LabelledValue } from "@/lib/billing/view-model";
import { documentNotes } from "@/lib/billing/notes";
import { fmtMoney } from "@/lib/billing/view-model";

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const ACCENT = "#A80400";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br />");
}

function pairs(rows: LabelledValue[], labelWidth = 120): string {
  return rows
    .map(
      (r) => `<tr>
        <td style="padding:2px 10px 2px 0;color:${MUTED};font-size:12px;vertical-align:top;width:${labelWidth}px;white-space:nowrap">${esc(r.label)}</td>
        <td style="padding:2px 0;color:${INK};font-size:12px;vertical-align:top">${esc(r.value)}</td>
      </tr>`,
    )
    .join("");
}

export function invoiceDocumentHtml(vm: InvoiceViewModel): string {
  const seller = vm.seller;
  const td = `padding:8px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${INK};vertical-align:top`;
  const th = `padding:6px;border-bottom:1px solid ${LINE};font-size:11px;color:${MUTED};font-weight:600;text-align:left`;

  const linesHtml = vm.isSimpleService
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px">
        <tr>
          <th style="${th};text-align:center">${esc(vm.descriptionNoun)} Description</th>
          <th style="${th};text-align:right;width:160px">Total Amount Due</th>
        </tr>
        ${vm.showServiceDescription && vm.serviceDescription ? `<tr><td colspan="2" style="${td};font-style:italic;color:${MUTED}">${esc(vm.serviceDescription)}</td></tr>` : ""}
        ${vm.lines
          .map(
            (l) => `<tr>
              <td style="${td}">${esc([l.name, l.description].filter(Boolean).join(" — "))}</td>
              <td style="${td};text-align:right;white-space:nowrap">${esc(fmtMoney(l.amount))}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px">
        <tr>
          <th style="${th};width:24px">#</th>
          <th style="${th}">Description</th>
          <th style="${th};width:70px">SAC</th>
          <th style="${th};width:50px;text-align:right">Qty</th>
          <th style="${th};width:90px;text-align:right">Rate</th>
          <th style="${th};width:110px;text-align:right">Amount</th>
        </tr>
        ${vm.lines
          .map(
            (l) => `<tr>
              <td style="${td};color:${MUTED}">${l.index}</td>
              <td style="${td}">${esc(l.code ? `${l.code} · ${l.name}` : l.name)}${l.description ? `<div style="color:${MUTED};font-size:11.5px;margin-top:2px">${esc(l.description)}</div>` : ""}</td>
              <td style="${td};color:${MUTED}">${esc(l.sacCode ?? "")}</td>
              <td style="${td};text-align:right">${esc(String(l.quantity))}${l.unit ? ` ${esc(l.unit)}` : ""}</td>
              <td style="${td};text-align:right;white-space:nowrap">${esc(fmtMoney(l.rate))}</td>
              <td style="${td};text-align:right;white-space:nowrap">${esc(fmtMoney(l.amount))}</td>
            </tr>`,
          )
          .join("")}
      </table>`;

  const totalRow = (label: string, value: string, bold = false) => `<tr>
      <td style="padding:3px 10px 3px 0;text-align:right;font-size:${bold ? 13.5 : 12.5}px;color:${bold ? INK : MUTED};font-weight:${bold ? 700 : 400}">${esc(label)}</td>
      <td style="padding:3px 6px;text-align:right;font-size:${bold ? 13.5 : 12.5}px;color:${INK};font-weight:${bold ? 700 : 400};width:160px;white-space:nowrap">${esc(value)}</td>
    </tr>`;
  const totals = [
    vm.discountTotal > 0 ? totalRow("Discount", `- ${fmtMoney(vm.discountTotal)}`) : "",
    vm.taxRows.length > 0 || vm.discountTotal > 0
      ? totalRow(vm.taxRows.length > 0 ? "Taxable Value" : "Subtotal", fmtMoney(vm.taxableValue))
      : "",
    ...vm.taxRows.map((t) => totalRow(t.label, t.value)),
    vm.roundOff !== 0 ? totalRow("Round Off", fmtMoney(vm.roundOff)) : "",
    `<tr><td colspan="2" style="border-top:1px solid ${LINE};padding:0;height:6px"></td></tr>`,
    totalRow("Total Amount Payable", fmtMoney(vm.total), true),
  ].join("");

  const footerBlocks = [...vm.identityRows, ...vm.paymentRows];

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#ffffff;margin:18px 0">
  <tr><td style="padding:18px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:2px solid ${ACCENT};padding-bottom:8px">
      <tr>
        <td style="vertical-align:bottom;padding-bottom:8px">
          <div style="font-size:16px;font-weight:800;color:${INK}">${esc(seller?.legalName ?? "")}</div>
          ${seller?.gstin ? `<div style="font-size:11.5px;color:${MUTED}">GSTIN ${esc(seller.gstin)}</div>` : ""}
        </td>
        <td style="vertical-align:bottom;text-align:right;padding-bottom:8px">
          <div style="font-size:15px;font-weight:800;letter-spacing:1.5px;color:${ACCENT}">${esc(vm.title)}</div>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px">
      <tr>
        <td style="vertical-align:top;width:58%"><table role="presentation" cellpadding="0" cellspacing="0">${pairs(vm.billTo, 90)}</table></td>
        <td style="vertical-align:top"><table role="presentation" cellpadding="0" cellspacing="0" align="right">${pairs(vm.meta, 110)}</table></td>
      </tr>
    </table>

    ${linesHtml}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px">${totals}</table>

    ${footerBlocks.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;border-top:1px solid ${LINE};padding-top:8px;width:100%">${pairs(footerBlocks, 170)}</table>` : ""}
    ${documentNotes(vm.remarks)
      .map(
        (n) =>
          `<div style="margin-top:10px;font-size:12px;color:${INK}"><strong>${esc(n.label)} :</strong> ${esc(n.text)}</div>`,
      )
      .join("")}
    ${vm.gstMode === "none" ? `<div style="margin-top:8px;font-size:11px;font-style:italic;color:${MUTED}">GST is not applicable on this document.</div>` : ""}
    <div style="margin-top:22px;font-size:12px;color:${INK}">
      <div style="font-weight:700">For ${esc(seller?.legalName ?? "")}</div>
      <div style="height:34px;border-bottom:1px solid ${LINE};width:180px"></div>
      <div style="margin-top:4px;font-weight:700">${esc(seller?.signatoryDesignation || "Proprietor")}</div>
    </div>
  </td></tr>
</table>`;
}
