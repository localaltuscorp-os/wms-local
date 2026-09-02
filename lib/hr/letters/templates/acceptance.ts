/**
 * HR LETTERS — Employment Acceptance Letter (category: appointment).
 *
 * A formal acknowledgement that the candidate has ACCEPTED the offer: it restates
 * the agreed terms (department / reporting manager / designation / 6-month
 * probation / probation & confirmed salary), the performance-incentive structure,
 * the joining & onboarding formalities, and closes with a "Candidate Acceptance"
 * block the candidate signs and returns.
 *
 * Authored purely with the declarative span/block builders from ../types — every
 * red/blank in the source becomes an `f()` field; everything else is FROZEN.
 * Field ids are reused (candidateName, position) so the same value stays in sync
 * across the greeting, body and the candidate-acceptance block.
 *
 * PURE + CLIENT-SAFE (imports only ../types). Load-neutral. The Assemble phase
 * registers this template — do not wire it here.
 */

import { type LetterTemplate, t, f, para, heading, term, bullets, spacer, signature } from "../types";

const template: LetterTemplate = {
  key: "acceptance",
  title: "Acceptance Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Confirm the candidate's acceptance, the agreed terms and the onboarding steps.",
  blocks: [
    para(
      t("Date: "),
      f("letterDate", "Date", { placeholder: "e.g. 25 July 2026", date: true }),
      t("     Place: Mumbai"),
    ),
    spacer("sm"),

    para(
      t("Dear {title} "),
      f("candidateName", "Candidate Name", { placeholder: "Full name" }),
      t(","),
    ),
    para(
      t(
        "We are pleased to acknowledge and confirm your acceptance of employment with Altus Group for the position of ",
      ),
      f("position", "Position", { placeholder: "e.g. Accounts Executive" }),
      t(" at "),
      f("entity", "Entity", { placeholder: "e.g. Altus Corp" }),
      t(" (an Altus Group entity)."),
    ),
    para(
      t(
        "We are delighted to welcome you to the organization and look forward to having you as part of our growing team. We are confident that your skills, experience, and professional capabilities will contribute meaningfully to the continued growth and success of the organization.",
      ),
    ),
    para(t("Please find below the agreed terms of your employment:")),

    term("Department", f("department", "Department", { placeholder: "e.g. Accounts" })),
    term("Reporting Manager", f("reportingManager", "Reporting Manager", { placeholder: "Full name" })),
    term("Designation", f("designation", "Designation", { placeholder: "e.g. Executive" })),
    term("Probation Period", t("6 Months")),
    term("Salary During Probation", [
      t("₹"),
      f("salaryProbation", "Monthly Salary (Probation)", { placeholder: "e.g. 25,000" }),
      t(" per month"),
    ]),
    term("Salary After Probation", [
      t("₹"),
      f("salaryConfirmed", "Monthly Salary (Confirmed)", { placeholder: "e.g. 30,000" }),
      t(" per month"),
    ]),

    heading("Performance Incentives", 2),
    para(
      t(
        "The detailed Performance Incentive Structure will be shared with you during your induction training or within ",
      ),
      f("inductionDays", "Induction Days", { placeholder: "e.g. 7" }),
      t(" days of your date of joining."),
    ),
    para(
      t(
        "For business generated through your personal connections or references, you will be entitled to ",
      ),
      f("referralPct", "Referral %", { placeholder: "e.g. 10" }),
      t(
        "% of the converted business amount, subject to applicable firm policies and successful realization of payments from the respective client(s).",
      ),
    ),
    para(
      t("During your probation period, your Monthly Business Target will be ₹"),
      f("monthlyTarget", "Monthly Business Target", { placeholder: "e.g. 2,00,000" }),
      t("."),
    ),
    para(
      t(
        "You will become eligible for performance incentives only upon achieving the prescribed threshold limit, wherever applicable.",
      ),
    ),
    para(
      t(
        "Performance incentives will be calculated on a monthly cumulative basis and paid in accordance with the applicable incentive slabs after the prescribed threshold, if any, has been achieved.",
      ),
    ),

    heading("Joining & Onboarding Formalities", 2),
    para(t("To complete your onboarding process, kindly provide the following:")),
    bullets(
      [
        t(
          "A copy of your resignation acceptance letter or relieving letter from your current/previous employer.",
        ),
      ],
      [t("Confirmation of your proposed date of joining.")],
      [t("Completion of the Onboarding Form within 2 working days of receiving this letter.")],
    ),
    para(t("The Onboarding Form can be accessed using the link provided separately.")),
    para(
      t(
        "Please keep the following documents and information ready while completing the Onboarding Form:",
      ),
    ),
    bullets(
      [t("Aadhaar Card")],
      [t("PAN Card")],
      [t("Passport-size photograph")],
      [t("Cancelled cheque of your bank account")],
      [t("Previous employment details")],
    ),
    para(
      t(
        "Upon receipt and verification of the required documents and confirmation of your joining date, we will proceed with the remaining onboarding formalities.",
      ),
    ),

    heading("Acceptance & Confirmation", 2),
    para(
      t(
        "This letter serves as a formal acknowledgement of your acceptance of the position and the employment terms stated above.",
      ),
    ),
    para(
      t(
        "By signing this letter, you confirm that you have read, understood, and accepted the designation, compensation structure, probation period, performance expectations, incentive structure, and other employment terms communicated to you.",
      ),
    ),
    para(
      t(
        "We are pleased to welcome you to Altus Group and look forward to a successful, productive, and rewarding professional association.",
      ),
    ),
    para(
      t(
        "Should you require any clarification regarding your employment, joining, or onboarding formalities, please contact:",
      ),
    ),
    para(t("Ms. Rutvisha Mehta: 9987741410")),
    para(t("Ms. Ruchita Ambre: 9167110410")),
    para(
      t(
        "Kindly sign and return a copy of this letter as confirmation of your acceptance, along with your proposed date of joining.",
      ),
    ),

    para(t("Regards,")),
    signature({
      forEntity: true,
      esign: true,
      name: [t("Founder")],
    }),

    spacer("lg"),
    heading("Candidate Acceptance", 2),
    para(
      t("I, {title} "),
      f("candidateName", "Candidate Name", { placeholder: "Full name" }),
      t(
        ", hereby confirm that I have read, understood, and accepted the employment terms and conditions stated in this letter.",
      ),
    ),
    para(
      t("I hereby confirm my acceptance of the position of "),
      f("position", "Position", { placeholder: "e.g. Accounts Executive" }),
      t(
        " and my intention to join the organization in accordance with the agreed terms and conditions.",
      ),
    ),
    term("Proposed Date of Joining", f("proposedJoiningDate", "Proposed Date of Joining", {
      placeholder: "e.g. 5 August 2026",
      date: true,
    })),
    term("Candidate Name", f("candidateName", "Candidate Name", { placeholder: "Full name" })),
    term("Candidate Signature", t("____")),
    term("Date", f("candidateSignDate", "Date", { placeholder: "Signed on", date: true })),
  ],
};

export default template;
