/**
 * Agreements module · the four HR templates (Management → Employee).
 *
 * Same shape as lib/salary/exit-letters.ts: a PURE, framework-free
 * `renderAgreement(input) → RenderedAgreement` that feeds BOTH the on-screen
 * preview and the pdfkit PDF from one source. Every variable is a fill-in field
 * surfaced in the workbench; this module only decides the wording/structure. The
 * signatory block is appended by the renderer via signatoryForEntity(entity).
 */
import type { AgreementType } from "@/db/enums";
import { AGREEMENT_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";

export interface AgreementInput {
  type: AgreementType;
  employeeName: string;
  designation?: string | null;
  department?: string | null;
  entity: string;
  /** ISO date (YYYY-MM-DD) the letter is issued. */
  letterDate?: string | null;
  place?: string | null;
  joiningDate?: string | null;
  // Appointment / CTC
  ctcAmount?: string | null; // free text so ₹ / words are preserved
  ctcBreakup?: string | null; // multi-line "Label: Value" particulars
  probationMonths?: string | null;
  reportingTo?: string | null;
  workLocation?: string | null;
  // Employment agreement
  noticePeriod?: string | null;
  // NDA
  confidentialityYears?: string | null;
  // Confirmation letters (probation / training completion)
  probationEndDate?: string | null;
  trainingEndDate?: string | null;
  /** The date the confirmation takes effect (payroll / confirmed service). */
  effectiveDate?: string | null;
  // Any template: extra editable clauses (one per line, appended as bullets)
  extraClauses?: string | null;
}

export interface RenderedAgreement {
  title: string;
  refLine: string | null;
  dateLine: string;
  recipientBlock: string[];
  subject: string;
  salutation: string;
  /** Body paragraphs; blank-line separated when printed. */
  body: string[];
  /** Optional labelled table of particulars (label → value). */
  particulars: Array<{ label: string; value: string }> | null;
  /** Numbered clause list (printed 1. 2. 3. …) below the body. */
  clauses: string[];
  closing: string;
  /** True → the doc carries an employee acceptance/signature block. */
  needsEmployeeAcceptance: boolean;
}

const BLANK = "____________________";

function fmtDate(iso?: string | null): string {
  if (!iso) return BLANK;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

function lines(text?: string | null): string[] {
  if (!text) return [];
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function particularsFrom(text?: string | null): RenderedAgreement["particulars"] {
  const rows = lines(text);
  if (rows.length === 0) return null;
  return rows.map((l) => {
    const [label, ...rest] = l.split(":");
    return { label: (label ?? "").trim(), value: rest.join(":").trim() || BLANK };
  });
}

export function renderAgreement(input: AgreementInput): RenderedAgreement {
  const title = AGREEMENT_TYPE_LABELS[input.type];
  const name = input.employeeName.trim() || BLANK;
  const entity = input.entity.trim() || BLANK;
  const designation = input.designation?.trim();
  const department = input.department?.trim();
  const recipientBlock = [name, designation || "", input.entity.trim()].filter(Boolean);
  const dateLine = `Date: ${fmtDate(input.letterDate)}`;
  const salutation = `Dear ${input.employeeName.trim() || "Employee"},`;
  const extra = lines(input.extraClauses);

  if (input.type === "appointment") {
    const body = [
      `We are pleased to offer you an appointment with ${entity}` +
        (designation ? ` as ${designation}` : "") +
        (department ? ` in the ${department} department` : "") +
        (input.joiningDate ? `, effective ${fmtDate(input.joiningDate)}` : "") +
        ".",
      `Your annual Cost to Company (CTC) is ${input.ctcAmount?.trim() || BLANK}` +
        ", subject to statutory deductions and the company's policies as amended from time to time.",
      "Your appointment is governed by the terms below and the company's prevailing policies. We look forward to a long and rewarding association.",
    ];
    const clauses = [
      `You will report to ${input.reportingTo?.trim() || BLANK} and be based at ${input.workLocation?.trim() || entity}.`,
      `Your appointment is subject to a probation period of ${input.probationMonths?.trim() || BLANK} months, on satisfactory completion of which your services will be confirmed in writing.`,
      `Either party may terminate this appointment by serving ${input.noticePeriod?.trim() || BLANK} written notice, or salary in lieu thereof.`,
      "You shall maintain the confidentiality of all company information and comply with the code of conduct and applicable policies.",
      ...extra,
    ];
    return {
      title, refLine: null, dateLine, recipientBlock,
      subject: "Subject: Letter of Appointment",
      salutation, body, particulars: particularsFrom(input.ctcBreakup), clauses,
      closing: "For and on behalf of the management,", needsEmployeeAcceptance: true,
    };
  }

  if (input.type === "employment") {
    const body = [
      `This Employment Agreement is entered into on ${fmtDate(input.letterDate)} between ${entity} (the "Company") and ${name} (the "Employee").`,
      `The Employee is engaged in the role of ${designation || BLANK}` +
        (department ? ` within the ${department} department` : "") +
        (input.joiningDate ? `, with effect from ${fmtDate(input.joiningDate)}` : "") +
        ", on the terms set out below.",
    ];
    const clauses = [
      `Duties: The Employee shall diligently perform the duties of ${designation || "the role"} and such other reasonable duties as assigned, devoting their full working time to the Company.`,
      `Compensation: The Employee's annual CTC is ${input.ctcAmount?.trim() || BLANK}, payable monthly subject to statutory deductions.`,
      `Confidentiality: The Employee shall not, during or after employment, disclose or misuse any confidential or proprietary information of the Company.`,
      `Notice period: Either party may terminate this Agreement by ${input.noticePeriod?.trim() || BLANK} written notice, or payment in lieu thereof.`,
      `Company property & IP: All work product and intellectual property created in the course of employment shall vest solely in the Company.`,
      `Governing law: This Agreement is governed by the laws of India and subject to the jurisdiction of the courts at ${input.place?.trim() || BLANK}.`,
      ...extra,
    ];
    return {
      title, refLine: null, dateLine, recipientBlock,
      subject: "Subject: Employment Agreement",
      salutation, body, particulars: particularsFrom(input.ctcBreakup), clauses,
      closing: "For and on behalf of the Company,", needsEmployeeAcceptance: true,
    };
  }

  if (input.type === "nda") {
    const years = input.confidentialityYears?.trim() || BLANK;
    const body = [
      `This Non-Disclosure & Confidentiality Agreement is made between ${entity} (the "Company") and ${name} (the "Employee")` +
        (input.joiningDate ? `, in connection with the Employee's engagement from ${fmtDate(input.joiningDate)}` : "") +
        ".",
      `The Employee acknowledges that during the course of employment they will have access to confidential and proprietary information of the Company and its clients.`,
    ];
    const clauses = [
      `"Confidential Information" means all non-public business, technical, financial, client and personnel information disclosed to or accessed by the Employee, in any form.`,
      `The Employee shall keep all Confidential Information strictly confidential and use it solely for the Company's benefit in the course of employment.`,
      `The Employee shall not copy, distribute, or disclose any Confidential Information to any third party without the Company's prior written consent.`,
      `Upon cessation of employment, the Employee shall return or destroy all Confidential Information and company property in their possession.`,
      `The confidentiality obligations survive termination of employment and remain in force for ${years} year(s) thereafter.`,
      ...extra,
    ];
    return {
      title, refLine: null, dateLine, recipientBlock,
      subject: "Subject: Non-Disclosure & Confidentiality Agreement",
      salutation, body, particulars: null, clauses,
      closing: "For and on behalf of the Company,", needsEmployeeAcceptance: true,
    };
  }

  if (input.type === "probation_confirmation") {
    const body = [
      `We are pleased to confirm that, on satisfactory completion of your probation period` +
        (input.probationEndDate ? ` ending ${fmtDate(input.probationEndDate)}` : "") +
        `, your appointment with ${entity}` +
        (designation ? ` as ${designation}` : "") +
        (department ? ` in the ${department} department` : "") +
        ` stands CONFIRMED with effect from ${fmtDate(input.effectiveDate)}.`,
      "We appreciate your contribution during the probation period and look forward to your continued growth with us.",
    ];
    const clauses = [
      "All terms and conditions of your original letter of appointment continue to apply, save as amended in writing.",
      `Either party may terminate the employment by serving ${input.noticePeriod?.trim() || BLANK} written notice, or salary in lieu thereof.`,
      "You shall continue to maintain confidentiality of all company information and comply with the code of conduct and applicable policies.",
      ...extra,
    ];
    return {
      title, refLine: null, dateLine, recipientBlock,
      subject: "Subject: Confirmation of Appointment",
      salutation, body, particulars: null, clauses,
      closing: "For and on behalf of the management,", needsEmployeeAcceptance: true,
    };
  }

  if (input.type === "training_completion") {
    const body = [
      `This is to confirm that your free training period with ${entity}` +
        (input.trainingEndDate ? ` concluded on ${fmtDate(input.trainingEndDate)}` : " has concluded") +
        ".",
      `Accordingly, you are now on the regular payroll and your salary is payable with effect from ${fmtDate(input.effectiveDate)}, in accordance with your agreed Cost to Company` +
        (input.ctcAmount?.trim() ? ` of ${input.ctcAmount.trim()}` : "") +
        " and the company's prevailing policies.",
    ];
    const clauses = [
      "The free training period was un-paid, as communicated at the time of your engagement; salary accrues from the effective date above.",
      "All other terms of your appointment continue to apply.",
      ...extra,
    ];
    return {
      title, refLine: null, dateLine, recipientBlock,
      subject: "Subject: Completion of Free Training Period",
      salutation, body, particulars: null, clauses,
      closing: "For and on behalf of the management,", needsEmployeeAcceptance: false,
    };
  }

  // ctc — Compensation / Salary letter
  const body = [
    `This is to confirm your compensation details with ${entity}` +
      (designation ? ` in your role as ${designation}` : "") +
      (input.joiningDate ? `, effective ${fmtDate(input.joiningDate)}` : "") +
      ".",
    `Your total annual Cost to Company (CTC) is ${input.ctcAmount?.trim() || BLANK}. The component-wise breakup is set out below. All amounts are annual and subject to applicable statutory deductions.`,
  ];
  const particulars = particularsFrom(input.ctcBreakup);
  const clauses = [
    "This letter reflects your current compensation and supersedes any prior communication on the subject.",
    "Revisions to your compensation, if any, will be communicated separately in writing.",
    ...extra,
  ];
  return {
    title, refLine: null, dateLine, recipientBlock,
    subject: "Subject: Compensation (CTC) Confirmation",
    salutation, body, particulars, clauses,
    closing: "For and on behalf of the management,", needsEmployeeAcceptance: false,
  };
}
