/**
 * REJECTION LETTER — a considerate decline after the interview.
 *
 * Authored against the declarative letter model (see ../types). Everything that
 * is NOT a red `f(...)` field is FROZEN prose. Red editable fields:
 *   · candidateName  — the applicant's name (greeting)
 *   · position       — the role interviewed for
 *   · company        — the paying entity name (defaults to "Altus Corp")
 *   · signatoryDesignation — the signatory's designation
 * The signature "For <entity>" line + the Date come from the letter chrome.
 *
 * PURE + CLIENT-SAFE: imports only ../types. Load-neutral.
 */

import { type LetterTemplate, t, f, para, signature } from "../types";

const template: LetterTemplate = {
  key: "rejection",
  title: "Rejection Letter",
  category: "recruitment",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "A warm, considered decline after the interview.",
  blocks: [
    para(t("Dear "), f("candidateName", "Candidate Name", { placeholder: "Full name" }), t(",")),
    para(
      t("Thank you for your time and interest in the "),
      f("position", "Position Title", { placeholder: "e.g. Accounts Executive" }),
      t(" role at "),
      f("company", "Firm Name", { defaultValue: "Altus Corp" }),
      t("."),
    ),
    para(
      t(
        "After careful consideration, we regret to inform you that we will not be moving forward with your application. We appreciate the opportunity to learn about your experience and thank you for participating in the interview process.",
      ),
    ),
    para(t("We wish you every success in your future endeavors.")),
    para(t("Kind Regards,")),
    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [f("signatoryDesignation", "Designation", { placeholder: "e.g. Founder" })],
      showDate: true,
      place: [t("Mumbai")],
    }),
  ],
};

export default template;
