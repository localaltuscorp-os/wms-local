/**
 * PRE-EMPLOYMENT TRAINING & EVALUATION POLICY
 *
 * The Altus "Pre-Employment Training & Evaluation Policy" (formerly a plain
 * Google Doc) reformatted onto the Altus letterhead in the declarative letter
 * model. All 11 sections are transcribed verbatim; only the candidate's name is
 * an editable field (the acceptance sign block). Authored with the span/block
 * builders — PURE + CLIENT-SAFE, load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature } from "../types";

const template: LetterTemplate = {
  key: "free-training",
  title: "Pre-Employment Training & Evaluation",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb:
    "The 15-calendar-day pre-employment training & evaluation policy the candidate reads, understands and signs.",
  blocks: [
    heading("Pre-Employment Training & Evaluation Policy", 1),

    heading("1. Purpose", 2),
    para(
      t(
        "The purpose of this policy is to establish a structured pre-employment training and evaluation process that enables both {firm} and prospective employees to assess mutual suitability before entering into formal employment.",
      ),
    ),

    heading("2. Applicability", 2),
    para(
      t(
        "This policy applies to all candidates selected to participate in the Pre-Employment Training & Evaluation Program prior to the issuance of an appointment letter.",
      ),
    ),

    heading("3. Pre-Employment Training Period", 2),
    bullets(
      [
        t(
          "Selected candidates will undergo a 15-calendar-day Pre-Employment Training & Evaluation Program.",
        ),
      ],
      [
        t(
          "The training is designed to familiarize candidates with the firm's work culture, processes, systems, products, and performance expectations.",
        ),
      ],
      [
        t(
          "This period also allows the firm to evaluate the candidate's skills, attitude, learning ability, discipline, professionalism, and overall suitability for the role.",
        ),
      ],
    ),

    heading("4. Nature of the Training", 2),
    bullets(
      [
        t(
          "The training period is pre-employment in nature and is intended solely for assessment and training purposes.",
        ),
      ],
      [
        t(
          "Participation in the training program does not constitute confirmation of employment or guarantee the issuance of an Appointment Letter.",
        ),
      ],
      [
        t(
          "During this period, candidates are expected to comply with all firm policies, confidentiality requirements, workplace conduct standards, and instructions provided by their supervisors or trainers.",
        ),
      ],
    ),

    heading("5. Performance Evaluation", 2),
    para(
      t(
        "At the end of the training period, candidates will be evaluated based on, but not limited to, the following criteria:",
      ),
    ),
    bullets(
      [t("Technical knowledge and job competency.")],
      [t("Learning ability and adaptability.")],
      [t("Attendance and punctuality.")],
      [t("Professional conduct and discipline.")],
      [t("Communication and teamwork.")],
      [t("Overall performance and suitability for the assigned role.")],
    ),
    para(
      t(
        "The evaluation shall be conducted by the Reporting Manager and/or the designated evaluation panel.",
      ),
    ),

    heading("6. Employment Decision", 2),
    bullets(
      [
        t(
          "The candidate's employment status shall be reviewed and finalized on the 15th day of the training period.",
        ),
      ],
      [
        t(
          "The firm will communicate its decision regarding selection or non-selection on the same day, wherever reasonably practicable, to ensure transparency and avoid any gap in communication.",
        ),
      ],
      [
        t(
          "Candidates who successfully meet the firm's performance and behavioural standards may be offered employment through the issuance of an official Appointment Letter, subject to management approval and completion of any other pre-employment formalities.",
        ),
      ],
    ),

    heading("7. Training Stipend / Payment Terms", 2),
    bullets(
      [t("The 15-day training period is unpaid unless the candidate is selected for employment.")],
      [
        t(
          "If the candidate is successfully selected and issued an Appointment Letter, the firm will pay the candidate for the entire 15-day training period along with the applicable salary/payroll process.",
        ),
      ],
      [
        t(
          "If the candidate is not selected by the firm after evaluation, no payment or remuneration shall be payable for the training period.",
        ),
      ],
      [
        t(
          "If the candidate voluntarily withdraws, resigns, discontinues the training, or chooses not to continue before completion of the evaluation process, they shall not be entitled to any payment or remuneration for the training period.",
        ),
      ],
    ),

    heading("8. Voluntary Withdrawal or Relieving", 2),
    bullets(
      [
        t(
          "The firm reserves the right to discontinue the candidate's participation in the training program at any time if their performance, conduct, attendance, or suitability is found to be unsatisfactory.",
        ),
      ],
      [
        t(
          "A candidate may voluntarily withdraw from the training program at any stage by informing the Reporting Manager or Human Resources.",
        ),
      ],
      [
        t(
          "In either case, where the candidate is relieved by the firm during the training period or voluntarily withdraws before selection, the training engagement shall conclude without any obligation on the part of {firm} to offer employment or make any payment for the training period.",
        ),
      ],
    ),

    heading("9. Confidentiality", 2),
    para(
      t(
        "All information, documents, customer data, business processes, software, intellectual property, and other confidential information accessed during the training period shall remain strictly confidential. Candidates shall not disclose or misuse any confidential information during or after the completion of the training program.",
      ),
    ),

    heading("10. Firm Rights", 2),
    para(
      t(
        "{firm} reserves the right to amend, extend, shorten, suspend, or discontinue this policy or the training program at its sole discretion, subject to applicable laws.",
      ),
    ),

    heading("11. Acceptance", 2),
    para(
      t(
        "By participating in the Pre-Employment Training & Evaluation Program, the candidate acknowledges that they have read, understood, and agreed to the terms and conditions contained in this policy.",
      ),
    ),

    spacer("lg"),
    signature({
      forEntity: true,
      esign: false,
      name: [t("Manan Vasa")],
      designation: [t("Sign and stamp")],
    }),
    spacer("lg"),
    para(t("Employee name: "), f("candidateName", "Candidate Name", { placeholder: "Full name" })),
    spacer("md"),
    para(t("Employee sign:")),
  ],
};

export default template;
