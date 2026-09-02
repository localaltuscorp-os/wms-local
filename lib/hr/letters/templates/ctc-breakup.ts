/**
 * CTC BREAKUP LETTER — the formal "Cost to the Company structure with break-up"
 * on the Altus letterhead.
 *
 * The heart of the letter is a bordered TABLE (COMPONENTS · PER MONTH · PER
 * ANNUM):
 *   · A. Earnings — Basic + allowances, each a PERCENTAGE of the total CTC
 *     (defaults Basic 40, HRA 10, Medical 10, Conveyance 20, Uniform 20 → 100),
 *     with a Gross Salary summary row.
 *   · B. Deductions — Professional Tax at the TOP (₹2,500/yr → ₹200/month
 *     Mar–Jan, ₹300 in February), with a Total Deductions summary row.
 *   · Net Monthly Take-Home — the grand row.
 *
 * The on-screen editor shows a PERCENTAGE-BASED CALCULATOR (in
 * components/hr/letters/letter-editor.tsx): HR enters the total CTC + each
 * component's %, and every ₹ figure, the PT, and the Gross / Deductions / Net
 * summary rows are auto-computed and written into these fields. Zero components
 * are hidden from the produced document. The Compensation Workbench can also
 * pre-fill the ₹ figures directly.
 *
 * `CTC_LETTER_COMPONENTS` / `CTC_LETTER_TOTALS` / `CTC_LETTER_DEDUCTIONS` are
 * exported so the calculator + the Workbench pre-fill map onto the exact field
 * ids — one source of truth for the mapping.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  type TableRow,
  t,
  f,
  para,
  paraRight,
  heading,
  term,
  table,
  tgroup,
  ttotal,
  tgrand,
  tcomponent,
  signature,
} from "../types";

/* ------------------------------------------------------------------ */
/* Component catalogue — the "A. Earnings" rows                         */
/* ------------------------------------------------------------------ */

/** One CTC-letter earning row + how it maps to the calculator / Workbench. */
export interface CtcLetterComponent {
  /** Row label, e.g. "House Rent Allowance". */
  label: string;
  /** Editable per-month ₹ field id. */
  pmId: string;
  /** Editable per-annum ₹ field id. */
  paId: string;
  /** Editable "% of CTC" field id. */
  pctId?: string;
  /** Default percentage seed for `pctId` (the five default to 40/10/10/20/20). */
  pctDefault?: string;
  /** Matching CTC-Workbench component id (omitted → no Workbench source). */
  workbenchId?: string;
}

/**
 * The earning components, in the letter's order. Each carries an editable
 * "% of CTC" annotation; the five defaults sum to 100.
 */
export const CTC_LETTER_COMPONENTS: CtcLetterComponent[] = [
  { label: "Basic Salary", pmId: "basicPm", paId: "basicPa", pctId: "basicPct", pctDefault: "40", workbenchId: "basic" },
  { label: "House Rent Allowance", pmId: "hraPm", paId: "hraPa", pctId: "hraPct", pctDefault: "10", workbenchId: "hra" },
  { label: "Medical Allowance", pmId: "medicalPm", paId: "medicalPa", pctId: "medicalPct", pctDefault: "10", workbenchId: "medical" },
  { label: "Conveyance", pmId: "conveyancePm", paId: "conveyancePa", pctId: "conveyancePct", pctDefault: "20", workbenchId: "conveyance" },
  { label: "Uniform Allowance", pmId: "uniformPm", paId: "uniformPa", pctId: "uniformPct", pctDefault: "20" },
];

/** The Gross + Net summary field ids (the Workbench pre-fill targets these). */
export const CTC_LETTER_TOTALS = {
  subtotalPm: "subtotalPm",
  subtotalPa: "subtotalPa",
  netPm: "netPm",
  netPa: "netPa",
} as const;

/** The Deductions field ids (Professional Tax + the deductions total). */
export const CTC_LETTER_DEDUCTIONS = {
  ptPm: "ptPm",
  ptPa: "ptPa",
  totalDedPm: "totalDedPm",
  totalDedPa: "totalDedPa",
} as const;

/** The component-name cell — label + its editable "% of CTC" field. */
function nameCell(c: CtcLetterComponent) {
  if (!c.pctId) return [t(c.label)];
  return [
    t(`${c.label} (`),
    f(c.pctId, "%", { defaultValue: c.pctDefault, placeholder: "0" }),
    t("% of CTC)"),
  ];
}

/** Build every table row: earnings → gross → PT → deductions total → net.
 *  Exported so other compensation letters (e.g. Appraisal — Revised CTC) reuse
 *  the exact same structured table + calculator field ids. */
export function ctcRows(): TableRow[] {
  const rows: TableRow[] = [tgroup("A. Earnings")];
  for (const c of CTC_LETTER_COMPONENTS) {
    rows.push(
      tcomponent(
        nameCell(c),
        [f(c.pmId, "Per month", { placeholder: "₹0" })],
        [f(c.paId, "Per annum", { placeholder: "₹0" })],
        c.pmId,
      ),
    );
  }
  rows.push(
    ttotal([
      [t("Gross Salary")],
      [f(CTC_LETTER_TOTALS.subtotalPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_TOTALS.subtotalPa, "Per annum", { placeholder: "₹0" })],
    ]),
  );

  rows.push(tgroup("B. Deductions"));
  // Professional Tax sits at the TOP of the deductions table.
  rows.push(
    tcomponent(
      [t("Professional Tax (PT)")],
      [f(CTC_LETTER_DEDUCTIONS.ptPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_DEDUCTIONS.ptPa, "Per annum", { placeholder: "₹0" })],
      CTC_LETTER_DEDUCTIONS.ptPm,
    ),
  );
  rows.push(
    ttotal([
      [t("Total Deductions")],
      [f(CTC_LETTER_DEDUCTIONS.totalDedPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_DEDUCTIONS.totalDedPa, "Per annum", { placeholder: "₹0" })],
    ]),
  );

  rows.push(
    tgrand([
      [t("Net Monthly Take-Home")],
      [f(CTC_LETTER_TOTALS.netPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_TOTALS.netPa, "Per annum", { placeholder: "₹0" })],
    ]),
  );
  return rows;
}

const NOTES_SEED =
  "1. Six months probation, six days working.\n2. Reimbursement of conveyance for client visits will be paid as per firm policy.";

const GROWTH_SEED = [
  "1. Learning Productivity Shastra Workshop worth Rs. 30,000/- in the first two months of joining (improves time management & productivity).",
  "2. Learning our flagship workshop, the Colloquium, worth Rs. 150,000/- in the first 3 months (goal-setting across life areas + tools to accomplish them).",
  "3. Exposure to a live case study on business owners' sales, operations & production challenges + strategy to overcome them.",
  "4. An opportunity to handle and hand-hold entrepreneurs from the 7th month.",
].join("\n");

const template: LetterTemplate = {
  key: "ctc-breakup",
  title: "CTC Breakup Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  // The Director/Boss signs the CTC Breakdown (authorisation hierarchy).
  signatory: "director",
  blurb: "The structured Cost-to-Firm annexure — component-wise pay-slip break-up.",
  blocks: [
    heading("COST TO THE FIRM STRUCTURE WITH BREAK-UP", 1),

    // Designation is right-aligned at the top-right of the header; the Name term
    // sits on the left beneath it.
    paraRight(t("Designation: "), f("designation", "Designation", { placeholder: "e.g. Business Development Manager" })),
    term("Name", f("employeeName", "Name", { placeholder: "e.g. Ms. Tanisha Shah" })),

    table(["COMPONENTS", "PER MONTH", "PER ANNUM"], ctcRows()),

    para(
      t(
        "In February the PT will be Rs. 300/- as per govt PT rules; the rest of the months Rs. 200/-.",
      ),
    ),

    heading("Notes", 2),
    para(f("notes", "Notes", { multiline: true, defaultValue: NOTES_SEED })),

    heading("Growth Journey", 2),
    para(f("growthJourney", "Growth Journey", { multiline: true, defaultValue: GROWTH_SEED })),

    heading("Custom Perks / Notes", 2),
    para(
      f("customPerks", "Custom Perks / Notes", {
        multiline: true,
        placeholder: "Add any candidate-specific perks, benefits or notes…",
      }),
    ),

    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [f("signatoryDesignation", "Designation", { defaultValue: "Founder" })],
      showDate: true,
      place: [f("place", "Place", { defaultValue: "Mumbai" })],
    }),
  ],
};

export default template;
