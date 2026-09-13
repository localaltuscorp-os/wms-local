/**
 * AFTER FREE TRAINING — the outcome of the 15-day pre-employment programme.
 *
 * Placed immediately AFTER Induction in During Employment: the pre-employment
 * training letter (./free-training) is what the candidate signs BEFORE the
 * programme, and this is what the firm issues once it has ended. The two are
 * deliberately separate documents - one sets the terms, the other records what
 * happened against them - because a single editable letter covering both would
 * leave no evidence of which version the person actually agreed to.
 *
 * ── THE OUTCOME IS A FIELD, NOT A SEPARATE LETTER ────────────────────────
 * Selected, not selected and withdrawn all resolve through the SAME letter,
 * with the outcome and the payment consequence stated as editable fields. The
 * alternative was three near-identical templates, which is three places for the
 * firm's payment terms to drift apart from ./free-training §7.
 *
 * Authored with the span/block builders - PURE + CLIENT-SAFE, load-neutral.
 *
 * The wording follows ./free-training §5-§7 closely on purpose: the letter must
 * not promise or deny anything the signed policy did not. It is a first draft
 * in the firm's register and "Edit freely" on the letter page can correct it.
 */

import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature } from "../types";
import { personSignOff } from "../sign-off";

const template: LetterTemplate = {
  key: "after-free-training",
  title: "After Free Training",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb: "The outcome of the 15-day pre-employment training & evaluation programme - the decision, and what follows from it.",
  blocks: [
    heading("Outcome of Pre-Employment Training & Evaluation", 1),

    para(t("Dear "), f("candidateName", "Candidate Name", { placeholder: "Full name" }), t(",")),

    para(
      t("You participated in the Pre-Employment Training & Evaluation Programme at {firm} for the role of "),
      f("position", "Position", { placeholder: "Position" }),
      t(", from "),
      f("trainingFrom", "Training Start", { date: true }),
      t(" to "),
      f("trainingTo", "Training End", { date: true }),
      t("."),
    ),

    heading("Evaluation", 2),
    para(
      t(
        "Your performance was reviewed against the criteria set out in the Pre-Employment Training & Evaluation Policy you signed - job competency, learning ability, attendance and punctuality, professional conduct, communication and teamwork, and overall suitability for the role.",
      ),
    ),
    para(t("Evaluated by: "), f("evaluatedBy", "Reporting Manager", { placeholder: "Reporting manager / panel" })),

    heading("Decision", 2),
    para(t("Outcome: "), f("outcome", "Outcome", { placeholder: "Selected / Not selected / Withdrawn", bold: true })),
    para(t("Remarks: "), f("remarks", "Remarks", { placeholder: "Brief remarks", multiline: true })),

    heading("What follows", 2),
    bullets(
      [
        t(
          "If you have been selected, your employment will be confirmed through an official Appointment Letter, and the firm will pay you for the entire training period along with the applicable salary/payroll process.",
        ),
      ],
      [
        t(
          "If you have not been selected after evaluation, no payment or remuneration is payable for the training period, in line with the policy you signed.",
        ),
      ],
      [
        t(
          "If you chose to withdraw or discontinue before the evaluation was completed, no payment or remuneration is payable for the training period.",
        ),
      ],
    ),

    para(
      t(
        "Your obligation to keep the firm's confidential information confidential continues regardless of the outcome above.",
      ),
    ),

    para(t("We thank you for the time and effort you gave the programme.")),

    spacer("lg"),
    signature({
      forEntity: true,
      esign: false,
      name: [t("HR Team")],
      designation: [t("Human Resources")],
    }),
    ...personSignOff({ prefix: "candidate", who: "Received and acknowledged by the candidate" }),
  ],
};

export default template;
