/**
 * DECLARATION LETTER — the joiner's own declaration, signed on day one.
 *
 * Sits FIRST in During Employment, before Induction: it is the thing a new
 * employee signs before they are walked through the firm, and the induction
 * record is the step that follows it.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * It is NOT a policy acknowledgement. Policy signing has its own ledger
 * (`policy_compliance`, per policy, per version - lib/hr/policies) and this
 * letter must never become a second, weaker record of the same thing. What it
 * declares is what only the employee can state: that the information and
 * documents they gave us are true, that they are free to take this employment,
 * and that they will keep the firm's information confidential.
 *
 * Authored with the span/block builders - PURE + CLIENT-SAFE, load-neutral.
 *
 * The wording is a first draft in the firm's register: every clause is plain
 * enough to be corrected in place by HR, and "Edit freely" on the letter page
 * allows exactly that.
 */

import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature } from "../types";
import { personSignOff } from "../sign-off";

const template: LetterTemplate = {
  key: "declaration",
  title: "Declaration Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  // "acknowledge": the employee signs it, and nothing is e-signed on issue -
  // matching how the other joiner-signed letters in this category behave.
  signature: "acknowledge",
  blurb: "The employee's own declaration - information given is true, they are free to join, and they will keep the firm's information confidential.",
  blocks: [
    heading("Declaration by the Employee", 1),

    para(t("I, "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(", holding the position of "), f("designation", "Designation", { placeholder: "Designation" }), t(" at {firm}, with effect from "), f("dateOfJoining", "Date of Joining", { date: true }), t(", declare as follows:")),

    spacer("md"),

    heading("1. Information and documents", 2),
    bullets(
      [t("All information I have provided to the firm - in my interview form, my onboarding form and in person - is true and complete to the best of my knowledge.")],
      [t("Every document and certificate I have submitted is genuine and relates to me.")],
      [t("I understand that any information found to be false or withheld may lead to withdrawal of my appointment or termination of my employment, at any stage.")],
    ),

    heading("2. Freedom to take this employment", 2),
    bullets(
      [t("I am not under any subsisting contract, bond, non-compete or other obligation to a previous employer that prevents or restricts me from taking up this employment.")],
      [t("I have no pending criminal proceedings against me that I have not disclosed to the firm.")],
    ),

    heading("3. Confidentiality", 2),
    para(
      t(
        "I understand that in the course of my employment I will have access to the firm's confidential information - customer data, business processes, pricing, software, intellectual property and internal records. I will not disclose, copy or use any of it for any purpose other than my work for the firm, either during my employment or after it ends.",
      ),
    ),

    heading("4. Conduct and firm policies", 2),
    para(
      t(
        "I have been given access to the firm's policies and I will comply with them, and with the lawful instructions of my reporting manager. I will keep my personal details, contact number and address current in the firm's records.",
      ),
    ),

    spacer("lg"),
    para(t("Place: "), f("place", "Place", { placeholder: "City" })),
    ...personSignOff({ prefix: "employee", who: "Signed by the employee" }),

    spacer("lg"),
    signature({
      forEntity: true,
      esign: false,
      name: [t("HR Team")],
      designation: [t("Human Resources")],
    }),
  ],
};

export default template;
