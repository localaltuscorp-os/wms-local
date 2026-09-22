import type * as React from "react";
import Image from "next/image";
import { documentNotes } from "@/lib/billing/notes";
import { fmtMoney, type InvoiceViewModel, type LabelledValue } from "@/lib/billing/view-model";

/**
 * THE DOCUMENT, ON SCREEN.
 *
 * A FAITHFUL PORT OF public/billing/invoice-template.html, which is the
 * reference tax invoice in code form. Its structure and measurements are kept
 * as they are — the masthead flash, the 58/42 party split, the two rule
 * weights, the tax ladder hard against the amount column, the pinned red
 * footer bar — because the requirement is that what this app issues looks like
 * that document rather than merely resembling it. The styles live in
 * globals.css under `.billing-a4` / `.inv-*`; only the data comes from here.
 *
 * A REAL A4 SHEET: 210 x 297mm with a 14mm margin, declared in millimetres, so
 * the preview is literally the page that prints. On a screen narrower than that
 * the FRAME scrolls rather than the sheet shrinking — a sheet that narrowed to
 * fit would not be A4 any more, and A4 is the requirement.
 *
 * Fed by the SAME `buildInvoiceViewModel` as the PDF renderer, so the preview
 * the user approves and the file the customer receives cannot drift apart.
 *
 * THE TAX LADDER IS THE VIEW MODEL'S CALL, NOT THIS FILE'S. `vm.taxRows`
 * already emits CGST, SGST and IGST as three rows whenever GST applies at all,
 * including the head that does not — the reference's own shape, and the
 * reasoning is written out where that decision lives (lib/billing/view-model).
 * This file prints what it is handed and adds no rule of its own.
 *
 * ONE PLACE DEPARTS FROM THE REFERENCE: it only ever shows a single flat
 * service line, so a document with real quantities and rates gets an itemised
 * grid instead, built from the reference's own type sizes and rule weights
 * rather than a second visual language.
 */

/** How the sheet draws a picture. On screen: next/image. The PDF/email
 *  renderer (lib/billing/invoice-sheet-render.ts) passes a plain <img> with the
 *  file inlined, because next/image cannot be rendered outside a page. */
export type SheetImg = (p: { src: string; alt: string; width: number; height: number; className?: string }) => React.ReactElement;

const NextImg: SheetImg = ({ src, alt, width, height, className }) => (
  <Image src={src} alt={alt} width={width} height={height} className={className} unoptimized priority />
);

export function InvoiceView({ vm, Img = NextImg }: { vm: InvoiceViewModel; Img?: SheetImg }) {
  return (
    <div className="billing-a4-frame">
      {/* `@page` CANNOT BE SCOPED BY A SELECTOR — it applies to the whole
          printed document — so it lives here, in the component, rather than in
          globals.css where it would have silently changed the paper size and
          margins of every other printable screen in the app (the outstanding
          dashboard, task exports, payslips). Mounted only while an invoice is
          on screen, which is the only time anyone prints one. Same approach as
          components/hr/letterhead/letterhead.tsx.

          The zero margin is not cosmetic: the sheet supplies its own 14mm, and
          letting the printer add its margin on top is what pushes the footer
          bar onto a second page. */}
      <style>{`@page{size:A4 portrait;margin:0;}`}</style>

      <article className="billing-print-sheet billing-a4 shrink-0">
        <div className="inv-body">
          {/* ── MASTHEAD ─────────────────────────────────────────────── */}
          <div className="inv-masthead">
            <div className="inv-logo">
              {vm.seller.logoUrl ? (
                <Img
                  src={vm.seller.logoUrl}
                  alt=""
                  width={200}
                  height={80}
                  className="h-auto w-full object-contain"
                />
              ) : (
                <span className="text-[9.5pt] font-extrabold tracking-[0.04em]">
                  {vm.seller.legalName}
                </span>
              )}
            </div>
            {/* The brand flash, as artwork rather than a CSS impression of it.
                Decorative, so it carries no alt text. */}
            <div className="inv-flash" aria-hidden>
              <Img src="/billing/masthead-flash.png" alt="" width={815} height={64} />
            </div>
          </div>

          {/* ── TITLE ────────────────────────────────────────────────── */}
          <div className="inv-title">{vm.title}</div>
          {vm.status === "cancelled" ? <div className="inv-cancelled">CANCELLED</div> : null}

          <hr className="inv-rule-strong" />

          {/* ── PARTIES ──────────────────────────────────────────────── */}
          <div className="inv-parties">
            <div className="left">
              <Rows rows={vm.billTo} boldFirst />
            </div>
            <div className="right">
              <Rows rows={vm.meta} />
            </div>
          </div>

          <hr className="inv-rule" />

          {vm.isSimpleService ? (
            <>
              <table className="inv-lines">
                <thead>
                  <tr>
                    <th>
                      {vm.descriptionNoun}
                      <br />
                      Description
                    </th>
                    <th className="amt">
                      Total
                      <br />
                      Amount Due
                    </th>
                  </tr>
                </thead>
              </table>

              <hr className="inv-rule" />

              <table className="inv-lines">
                <tbody>
                  {vm.showServiceDescription && vm.serviceDescription ? (
                    <tr>
                      <td colSpan={2}>{vm.serviceDescription}</td>
                    </tr>
                  ) : null}
                  {vm.lines.map((line) => (
                    <tr key={line.index}>
                      <td>
                        {line.name}
                        {line.description ? <span className="block">{line.description}</span> : null}
                      </td>
                      <td className="amt">{fmtMoney(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {vm.discountTotal > 0 || vm.taxRows.length > 0 || vm.roundOff !== 0 ? (
                  <tbody className="inv-tax">
                    {vm.discountTotal > 0 ? (
                      <tr>
                        <td className="lbl">Discount</td>
                        <td className="amt">− {fmtMoney(vm.discountTotal)}</td>
                      </tr>
                    ) : null}
                    {vm.taxRows.map((t) => (
                      <tr key={t.label}>
                        <td className="lbl">{t.label}</td>
                        <td className="amt">{t.value}</td>
                      </tr>
                    ))}
                    {vm.roundOff !== 0 ? (
                      <tr>
                        <td className="lbl">Round Off</td>
                        <td className="amt">{fmtMoney(vm.roundOff)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                ) : null}
              </table>
            </>
          ) : (
            <ItemisedLines vm={vm} />
          )}

          <hr className="inv-rule" />

          <table className="inv-lines inv-total">
            <tbody>
              <tr>
                <td className="lbl">Total Amount Payable</td>
                <td className="amt">{fmtMoney(vm.total)}</td>
              </tr>
            </tbody>
          </table>

          <hr className="inv-rule" />

          {/* ── IDENTITY ─────────────────────────────────────────────── */}
          {vm.identityRows.length > 0 ? (
            <>
              <div className="inv-block">
                <Rows rows={vm.identityRows} wide />
              </div>
              <hr className="inv-rule" />
            </>
          ) : null}

          {/* ── PAYMENT / BANK ───────────────────────────────────────── */}
          {vm.paymentRows.length > 0 || vm.interestClause ? (
            <>
              <div className="inv-block">
                {vm.paymentRows.length > 0 ? <Rows rows={vm.paymentRows} wide /> : null}
                {vm.interestClause ? <div className="inv-note">{vm.interestClause}</div> : null}
              </div>
              {/* NO RULE HERE. The reference closes the bank block with white
                  space and lets the signature's own "For …" rule be the next
                  line on the page — a full-width rule here and another beside
                  the signature put two lines a centimetre apart. */}
            </>
          ) : null}

          {vm.gstMode === "none" ? (
            <div className="inv-note">GST is not applicable on this document.</div>
          ) : null}
          {vm.lineage ? <div className="inv-note">{vm.lineage}</div> : null}
          {documentNotes(vm.remarks).map((n) => (
            <div key={n.label} className="inv-note whitespace-pre-line">
              <strong>{n.label} :</strong> {n.text}
            </div>
          ))}

          {/* ── SIGNATURE ────────────────────────────────────────────── */}
          <div className="inv-sign">
            <div className="for">For {vm.seller.legalName}</div>
            <div className="space">
              {vm.seller.signatureImageUrl ? (
                <Img
                  src={vm.seller.signatureImageUrl}
                  alt=""
                  width={200}
                  height={64}
                  className="max-h-full w-auto object-contain"
                />
              ) : null}
            </div>
            {/* Under the signature: the Admin Master's designation, else
                "Proprietor" (Manan's reference template). */}
            <div className="role">{vm.seller.signatoryDesignation || "Proprietor"}</div>
          </div>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          <div className="inv-footer">
            {vm.contactParts.length > 0 ? (
              <div className="contact">
                {vm.contactParts.map((part, i) => (
                  <span key={part} className="contents">
                    {/* BETWEEN the details, not before the first one. */}
                    {i > 0 ? (
                      <span className="dot" aria-hidden>
                        &#9654;
                      </span>
                    ) : null}
                    <span>{part}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {vm.seller.addressLine ? <div className="bar">{vm.seller.addressLine}</div> : null}
            {vm.footerNote ? <div className="inv-note text-center">{vm.footerNote}</div> : null}
          </div>
        </div>
      </article>
    </div>
  );
}

/** label · colon · value, the four blocks that make up most of the sheet. */
function Rows({
  rows,
  boldFirst,
  wide,
}: {
  rows: LabelledValue[];
  boldFirst?: boolean;
  /** Identity and bank blocks: a fixed label column so the colons line up
   *  whatever the label says. See `.inv-rows--wide`. */
  wide?: boolean;
}) {
  return (
    <div className={wide ? "inv-rows inv-rows--wide" : "inv-rows"}>
      {rows.map((row, i) => (
        <div key={row.label} className="contents">
          <div className="lbl">{row.label}</div>
          <div className="sep" aria-hidden>
            :
          </div>
          <div className={`val${boldFirst && i === 0 ? " b" : ""}`}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * A document with real quantities and rates. The reference has no such case —
 * it only ever shows one flat service — so this borrows its type sizes and
 * rule weights rather than introducing a second visual language.
 */
function ItemisedLines({ vm }: { vm: InvoiceViewModel }) {
  return (
    <>
      {vm.showServiceDescription && vm.serviceDescription ? (
        <div className="inv-note">{vm.serviceDescription}</div>
      ) : null}
      <table className="inv-grid">
        <thead>
          <tr>
            <th style={{ width: "8mm" }}>#</th>
            <th>Description</th>
            <th style={{ width: "18mm" }}>SAC</th>
            <th className="num" style={{ width: "16mm" }}>
              Qty
            </th>
            <th className="num" style={{ width: "24mm" }}>
              Rate
            </th>
            <th className="num" style={{ width: "28mm" }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {vm.lines.map((line) => (
            <tr key={line.index}>
              <td>{line.index}</td>
              <td>
                <span className="font-bold">
                  {line.code ? `${line.code} · ` : ""}
                  {line.name}
                </span>
                {line.description ? <span className="block">{line.description}</span> : null}
              </td>
              <td>{line.sacCode ?? "—"}</td>
              <td className="num">
                {line.quantity}
                {line.unit ? ` ${line.unit}` : ""}
              </td>
              <td className="num">{fmtMoney(line.rate)}</td>
              <td className="num font-bold">{fmtMoney(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="inv-lines">
        <tbody className="inv-tax">
          <tr>
            <td className="lbl">{vm.taxRows.length > 0 ? "Taxable Value" : "Subtotal"}</td>
            <td className="amt">{fmtMoney(vm.taxableValue)}</td>
          </tr>
          {vm.discountTotal > 0 ? (
            <tr>
              <td className="lbl">Discount</td>
              <td className="amt">− {fmtMoney(vm.discountTotal)}</td>
            </tr>
          ) : null}
          {vm.taxRows.map((t) => (
            <tr key={t.label}>
              <td className="lbl">{t.label}</td>
              <td className="amt">{t.value}</td>
            </tr>
          ))}
          {vm.roundOff !== 0 ? (
            <tr>
              <td className="lbl">Round Off</td>
              <td className="amt">{fmtMoney(vm.roundOff)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
