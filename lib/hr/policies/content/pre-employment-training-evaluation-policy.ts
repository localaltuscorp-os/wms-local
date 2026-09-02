/**
 * PRE-EMPLOYMENT TRAINING & EVALUATION POLICY.
 *
 * Verbatim transcription of the source Google-Doc policy into the declarative
 * `PolicyDoc` model. Authored against lib/hr/policies/types.ts — FROZEN legal
 * text, no editable fields. Registered in the policy registry (key → PolicyDoc)
 * + flips its POLICY_CARDS entry to status:"ready".
 *
 * The issuing firm name is the `{firm}` token (lib/hr/firm.ts), resolved to the
 * paying entity chosen in the reader's toolbar — so the same policy re-brands to
 * whichever entity is selected instead of a hardcoded name. "the Firm" is the
 * source document's own generic self-reference and is kept as written.
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

const preEmploymentTrainingEvaluationPolicy: PolicyDoc = {
  key: "pre-employment-training-evaluation-policy",
  title: "Pre-Employment Training & Evaluation Policy",
  docCode: "HR-POL-005",
  effectiveDate: "01 June 2026",
  version: "1.0",
  owner: "Human Resources Department / Founder",
  registeredOffice:
    "C-6, Ground Floor, Gambhir Estates, Sacred Space (Synergy Road), Kotkar Road, Off Aarey Road, Next to Pravasi Industrial Estate, Hanuman Tekdi, Goregaon East, Mumbai – 400063, Maharashtra, India",
  hrEmail: "hr.altuscorp@gmail.com",
  entityDefault: "altus-corp",
  summary:
    "A structured pre-employment training and evaluation process that lets the Firm and prospective employees assess mutual suitability before formal employment.",

  sections: [
    /* 1 ─────────────────────────────────────────────────────────── */
    heading(
      "Purpose",
      p(
        "The purpose of this policy is to establish a structured pre-employment training and evaluation process that enables both {firm} and prospective employees to assess mutual suitability before entering into formal employment.",
      ),
    ),

    /* 2 ─────────────────────────────────────────────────────────── */
    heading(
      "Applicability",
      p(
        "This policy applies to all candidates selected to participate in the Pre-Employment Training & Evaluation Program prior to the issuance of an appointment letter.",
      ),
    ),

    /* 3 ─────────────────────────────────────────────────────────── */
    heading(
      "Pre-Employment Training Period",
      ul(
        "Selected candidates will undergo a 15 (fifteen) Calendar Working Day Pre-Employment Training & Evaluation Program.",
        "The training is designed to familiarize candidates with the Firm's work culture, processes, systems, products, and performance expectations.",
        "This period also allows the Firm to evaluate the candidate's skills, attitude, learning ability, discipline, professionalism, and overall suitability for the role.",
      ),
    ),

    /* 4 ─────────────────────────────────────────────────────────── */
    heading(
      "Nature of the Training",
      ul(
        "The training period is pre-employment in nature and is intended solely for assessment and training purposes.",
        "Participation in the training program does not constitute confirmation of employment or guarantee the issuance of an Appointment Letter.",
        "During this period, candidates are expected to comply with all Firm policies, confidentiality requirements, workplace conduct standards, and instructions provided by their supervisors or trainers.",
      ),
    ),

    /* 5 ─────────────────────────────────────────────────────────── */
    heading(
      "Performance Evaluation",
      p(
        "At the end of the training period, candidates will be evaluated based on, but not limited to, the following criteria:",
      ),
      ul(
        "Technical knowledge and job competency",
        "Learning ability and adaptability",
        "Attendance and punctuality",
        "Professional conduct and discipline",
        "Communication and teamwork",
        "Overall performance and suitability for the assigned role",
        "Alignment with the Firm's Constitution, Values and Culture",
      ),
      p(
        "The evaluation shall be conducted by the Reporting Manager and/or the designated evaluation panel.",
      ),
    ),

    /* 6 ─────────────────────────────────────────────────────────── */
    heading(
      "Employment Decision",
      ul(
        "The candidate's employment status shall be reviewed and finalized on the 15th day of the said period.",
        "The Firm will communicate its decision regarding selection, extension or non-selection on the same day, wherever reasonably practicable, to ensure transparency and avoid any gap in communication.",
        "Candidates who successfully meet the Firm's performance and behavioural standards may be offered employment through the issuance of an official Appointment Letter, subject to management approval and completion of any other pre-employment formalities.",
      ),
    ),

    /* 7 ─────────────────────────────────────────────────────────── */
    heading(
      "Training Stipend / Payment Terms",
      ul(
        "The 15-day training period is unpaid unless the candidate is selected for employment.",
        "If the candidate is successfully selected and issued an Appointment Letter, the Firm will pay the candidate for the entire 15-day training period along with the applicable salary/payroll process if the candidate does not abscond till the 10th of the following month.",
        "If the candidate is not selected by the Firm after evaluation, no payment or remuneration shall be payable for the training period.",
        "If the candidate voluntarily withdraws, resigns, discontinues the training, or chooses not to continue before completion of the evaluation process, they shall not be entitled to any payment or remuneration for the training period.",
      ),
    ),

    /* 8 ─────────────────────────────────────────────────────────── */
    heading(
      "Voluntary Withdrawal or Relieving",
      ul(
        "The Firm reserves the right to discontinue the candidate's participation in the training program at any time if their performance, conduct, attendance, or suitability is found to be unsatisfactory.",
        "A candidate may voluntarily withdraw from the training program at any stage by informing the Reporting Manager or Human Resources.",
        "In either case, where the candidate is relieved by the Firm during the training period or voluntarily withdraws before selection, the training engagement shall conclude without any obligation on the part of {firm} to offer employment or make any payment for the training period.",
      ),
    ),

    /* 9 ─────────────────────────────────────────────────────────── */
    heading(
      "Confidentiality",
      p(
        "All information, documents, customer data, business processes, software, intellectual property, and other confidential information accessed during the training period shall remain strictly confidential. Candidates shall not disclose or misuse any confidential information during or after the completion of the training program.",
      ),
    ),

    /* 10 ────────────────────────────────────────────────────────── */
    heading(
      "Firm Rights",
      p(
        "{firm} reserves the right to amend, extend, shorten, suspend, or discontinue this policy or the training program at its sole discretion, subject to applicable laws.",
      ),
    ),

    /* 11 ────────────────────────────────────────────────────────── */
    heading(
      "Acceptance",
      p(
        "By participating in the Pre-Employment Training & Evaluation Program, the candidate acknowledges that they have read, understood, and agreed to the terms and conditions contained in this policy.",
      ),
    ),
  ],

  /* Declaration & Acknowledgement — shared sign-off block ─────────── */
  declaration: declaration(),
};

export default preEmploymentTrainingEvaluationPolicy;
