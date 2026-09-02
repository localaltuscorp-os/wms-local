/**
 * WS-5 — Salary documents · Exit-letter templates (Management → Employee).
 *
 * Three generated documents, each closed with the Entity signatory block:
 *   1. Full & Final Settlement Letter   (full-and-final)
 *   2. Return of Company Assets Letter  (return-of-assets)
 *   3. Handover Accepted Letter         (handover-accepted)
 *
 * These are REASONABLE DEFAULT templates. Every variable (employee, dates,
 * amounts, asset list, handover notes) is a fill-in field surfaced in the UI —
 * this module only decides the wording/structure. Pure + framework-free so it
 * can render both the on-screen preview and the pdfkit PDF from one source.
 */

import { formatDate } from "@/lib/format";

export type ExitLetterType =
  | "full-and-final"
  | "return-of-assets"
  | "handover-accepted";

export const EXIT_LETTER_TYPES: ExitLetterType[] = [
  "full-and-final",
  "return-of-assets",
  "handover-accepted",
];

export interface ExitLetterMeta {
  type: ExitLetterType;
  title: string;
  /** Short one-line description for the picker UI. */
  blurb: string;
}

export const EXIT_LETTER_META: Record<ExitLetterType, ExitLetterMeta> = {
  "full-and-final": {
    type: "full-and-final",
    title: "Full & Final Settlement Letter",
    blurb: "Confirms the final settlement amount payable on separation.",
  },
  "return-of-assets": {
    type: "return-of-assets",
    title: "Return of Company Assets Letter",
    blurb: "Records the company assets to be returned by the employee.",
  },
  "handover-accepted": {
    type: "handover-accepted",
    title: "Handover Accepted Letter",
    blurb: "Acknowledges that the employee's handover has been accepted.",
  },
};

/** Everything the templates can consume. Optional fields are fill-in blanks. */
export interface ExitLetterInput {
  type: ExitLetterType;
  employeeName: string;
  designation?: string | null;
  entity: string;
  /** ISO date (YYYY-MM-DD) the letter is issued / effective. */
  letterDate?: string | null;
  place?: string | null;
  lastWorkingDay?: string | null;
  // Full & Final specific
  settlementAmount?: string | null; // free text so ₹ / words are preserved
  settlementBreakup?: string | null; // multi-line particulars
  // Return of Assets specific
  assets?: string | null; // multi-line list, one asset per line
  assetReturnBy?: string | null;
  // Handover Accepted specific
  handoverTo?: string | null;
  handoverSummary?: string | null;
}

export interface RenderedLetter {
  title: string;
  /** Reference line, e.g. "Ref: FNF/2026-07-09". Optional. */
  refLine: string | null;
  dateLine: string;
  recipientBlock: string[];
  subject: string;
  salutation: string;
  /** Body paragraphs; blank-line separated when printed. */
  body: string[];
  /** Optional labelled table of particulars (label → value). */
  particulars: Array<{ label: string; value: string }> | null;
  closing: string;
}

const BLANK = "____________________";

function fmtDate(iso?: string | null): string {
  if (!iso) return BLANK;
  return formatDate(iso);
}

function lines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Build the structured letter. The signatory block is NOT part of this — it is
 * appended by the renderer (component / PDF) via signatoryForEntity(entity).
 */
export function renderExitLetter(input: ExitLetterInput): RenderedLetter {
  const meta = EXIT_LETTER_META[input.type];
  const name = input.employeeName.trim() || BLANK;
  const designation = input.designation?.trim();
  const recipientBlock = [
    name,
    designation ? designation : "",
    input.entity.trim(),
  ].filter(Boolean);
  const dateLine = `Date: ${fmtDate(input.letterDate)}`;
  const salutation = `Dear ${input.employeeName.trim() || "Employee"},`;

  if (input.type === "return-of-assets") {
    const assetList = lines(input.assets);
    const body = [
      `This is with reference to the conclusion of your employment with ${input.entity.trim()}` +
        (input.lastWorkingDay ? `, effective ${fmtDate(input.lastWorkingDay)}` : "") +
        ".",
      "As part of the exit formalities, you are requested to return the following company assets that were issued to you during the course of your employment. Kindly ensure that all items are returned in good working condition:",
    ];
    if (assetList.length === 0) {
      body.push(`   •  ${BLANK}\n   •  ${BLANK}\n   •  ${BLANK}`);
    } else {
      body.push(assetList.map((a) => `   •  ${a}`).join("\n"));
    }
    body.push(
      `Please arrange to hand over the above on or before ${fmtDate(
        input.assetReturnBy,
      )}. Any asset not returned may be recovered from your Full & Final settlement.`,
      "We thank you for your contribution and wish you the very best for your future endeavours.",
    );
    return {
      title: meta.title,
      refLine: null,
      dateLine,
      recipientBlock,
      subject: "Subject: Return of Company Assets",
      salutation,
      body,
      particulars: null,
      closing: "Yours sincerely,",
    };
  }

  if (input.type === "handover-accepted") {
    const body = [
      `This letter is to formally acknowledge that you have completed and handed over your responsibilities, documents and pending work in connection with your role` +
        (designation ? ` as ${designation}` : "") +
        ` at ${input.entity.trim()}` +
        (input.lastWorkingDay ? `, on or before your last working day of ${fmtDate(input.lastWorkingDay)}` : "") +
        ".",
      `The handover has been received and accepted by ${
        input.handoverTo?.trim() || BLANK
      } on behalf of the management.`,
    ];
    const summary = lines(input.handoverSummary);
    if (summary.length > 0) {
      body.push("Summary of the handover:");
      body.push(summary.map((s) => `   •  ${s}`).join("\n"));
    }
    body.push(
      "With the handover duly accepted, there are no pending deliverables outstanding against you on this account. This acknowledgement may be used towards completion of your exit formalities.",
      "We thank you for your contribution and wish you continued success.",
    );
    return {
      title: meta.title,
      refLine: null,
      dateLine,
      recipientBlock,
      subject: "Subject: Acknowledgement of Handover",
      salutation,
      body,
      particulars: null,
      closing: "Yours sincerely,",
    };
  }

  // Full & Final Settlement (default)
  const body = [
    `This is with reference to the cessation of your employment with ${input.entity.trim()}` +
      (input.lastWorkingDay ? `, with your last working day being ${fmtDate(input.lastWorkingDay)}` : "") +
      ".",
    "We have computed your Full & Final settlement after accounting for salary payable, applicable deductions (including Professional Tax and any advances / dues), and other adjustments as per policy. The net settlement is set out below.",
  ];
  const breakup = lines(input.settlementBreakup);
  const particulars: RenderedLetter["particulars"] =
    breakup.length > 0
      ? breakup.map((l) => {
          const [label, ...rest] = l.split(":");
          return {
            label: (label ?? "").trim(),
            value: rest.join(":").trim() || BLANK,
          };
        })
      : null;
  body.push(
    `Net amount payable in Full & Final settlement: ${
      input.settlementAmount?.trim() || BLANK
    }.`,
    "This settlement is made in full and final satisfaction of all dues. Kindly countersign a copy of this letter as a token of your acceptance.",
    "We thank you for your association and wish you the very best for the future.",
  );
  return {
    title: meta.title,
    refLine: null,
    dateLine,
    recipientBlock,
    subject: "Subject: Full & Final Settlement of Dues",
    salutation,
    body,
    particulars,
    closing: "Yours sincerely,",
  };
}
