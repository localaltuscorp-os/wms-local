/**
 * INCENTIVE CLASH POLICY — "Incentive Clash Policy" (CLASH).
 *
 * Verbatim transcription of the Altus Corp incentive-clash policy into the
 * declarative `PolicyDoc` model. Authored against lib/hr/policies/types.ts —
 * FROZEN legal text, no editable fields. Registered in the policy registry
 * (key → PolicyDoc) + flips its POLICY_CARDS entry to status:"ready".
 *
 * PURE + CLIENT-SAFE: imports only ./types (which is itself load-neutral).
 */

import {
  type PolicyDoc,
  heading,
  p,
  ul,
  declaration,
} from "@/lib/hr/policies/types";

const clashPolicy: PolicyDoc = {
  key: "clash",
  title: "Incentive Clash Policy",
  docCode: "HR-POL-004",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary:
    "Fair, transparent incentive attribution grounded in accurate CRM documentation, call recordings and teamwork.",

  sections: [
    /* 1 ─────────────────────────────────────────────────────────── */
    heading(
      "Purpose",
      p(
        "The purpose of this policy is to ensure that incentives are awarded fairly and transparently while encouraging accurate CRM documentation and teamwork.",
      ),
    ),

    /* 2 ─────────────────────────────────────────────────────────── */
    heading(
      "CRM is the Primary Source of Truth",
      p(
        "All team members are expected to update the CRM after every meaningful customer interaction. CRM notes should accurately reflect the discussion, progress, and next steps. In the event of an incentive dispute, CRM records will be the primary source of evidence.",
      ),
    ),

    /* 3 ─────────────────────────────────────────────────────────── */
    heading(
      "CRM Notes with Supporting Call Recording",
      p(
        "If a team member has updated the CRM with accurate conversation notes, and those notes are supported by the corresponding call recording, the closure and the associated incentive will be awarded to that team member.",
      ),
    ),

    /* 4 ─────────────────────────────────────────────────────────── */
    heading(
      "Call Recording as Alternate Evidence",
      p(
        "If no CRM notes have been updated, but the closure call recording clearly establishes that a team member was responsible for successfully closing the customer, the closure and the associated incentive will be awarded to that team member.",
      ),
    ),

    /* 5 ─────────────────────────────────────────────────────────── */
    heading(
      "Multiple Contributions",
      p(
        "If more than one team member has contributed to the sales process, management will review all available evidence, including CRM entries, call recordings, communication history, and the overall contribution made by each individual before determining incentive eligibility.",
      ),
    ),

    /* 6 ─────────────────────────────────────────────────────────── */
    heading(
      "Responsibility of Employees",
      p("Every team member is expected to:"),
      ul(
        "Update the CRM promptly after every meaningful customer interaction.",
        "Ensure CRM information is accurate and complete.",
        "Maintain professionalism and avoid disputes through proper documentation.",
      ),
      p(
        "Failure to update the CRM may weaken a claim for ownership. However, genuine cases supported by call recordings or other verifiable evidence will still be considered.",
      ),
    ),

    /* 7 ─────────────────────────────────────────────────────────── */
    heading(
      "Review Process",
      p(
        "In case of an incentive clash, management will review all relevant information, including CRM notes and timestamps, call recordings, customer communication history, and any other supporting evidence deemed relevant.",
      ),
    ),

    /* 8 ─────────────────────────────────────────────────────────── */
    heading(
      "Final Decision",
      p(
        "All disputes will be reviewed objectively and fairly. The decision taken by the management after reviewing the available evidence will be final and binding. No further appeals will be entertained.",
      ),
    ),

    /* 9 ─────────────────────────────────────────────────────────── */
    heading(
      "Best Practice",
      p(
        "Timely CRM updates protect your work and ensure that your efforts are recognized. Keeping accurate records helps avoid disputes and enables faster and fair incentive processing for everyone.",
      ),
    ),
  ],

  /* Declaration & Acknowledgement — shared sign-off block ─────────── */
  declaration: declaration(),
};

export default clashPolicy;
