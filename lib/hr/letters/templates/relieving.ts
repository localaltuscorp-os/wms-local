/**
 * RELIEVING LETTER — official acknowledgement of resignation + release from
 * duties, certifying completed tenure and confirming F&F settlement per policy.
 *
 * Transcribed verbatim from the Altus relieving-letter master and normalized onto
 * the shared <Letterhead> (the old V-logo / address block is dropped — the
 * letterhead wrapper supplies branding + the paying-entity return address).
 *
 * Red (editable) fields: recipientName (reused in the "To," block and the
 * greeting), addressBlock, position, resignationReceivedDate, tenureFrom,
 * tenureTo, signDate. Everything else is frozen prose. Signed off by
 * CA Manan Vasa with the letter date — no e-sign (signature: "none").
 */

import { type LetterTemplate, t, f, para, heading, spacer } from "../types";

const template: LetterTemplate = {
  key: "relieving",
  title: "Relieving Letter",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Acknowledge a resignation, certify the tenure and release the employee from their duties.",
  blocks: [
    // Recipient block ------------------------------------------------------
    para(t("To,")),
    para(f("recipientName", "Recipient Name", { placeholder: "e.g. Mrs. Moushmi G Kalbere" })),
    para(
      f("addressBlock", "Address", {
        placeholder: "B- 203, Gautam Nagar,\nDatta Mandir Road,\nMalad East,\nMumbai - 400097",
        multiline: true,
      }),
    ),
    spacer("md"),

    // Title ----------------------------------------------------------------
    heading("Relieving Letter", 2),
    spacer("sm"),

    // Body -----------------------------------------------------------------
    para(t("Dear "), f("recipientName", "Recipient Name"), t(",")),
    para(
      t("This letter is an official acknowledgement that your resignation from your position as "),
      f("position", "Position", { placeholder: "e.g. Sales Manager" }),
      t(" at {firm} was received on "),
      f("resignationReceivedDate", "Resignation Received Date", { placeholder: "e.g. 21st March 2026", date: true }),
      t(". This also certifies that you have successfully completed your tenure with the firm from"),
      f("tenureFrom", "Tenure From", { placeholder: "e.g. 8th December 2025" }),
      t(" to "),
      f("tenureTo", "Tenure To", { placeholder: "e.g. 21st March 2026" }),
      t("."),
    ),
    para(
      t(
        "We hereby confirm your departure from the firm and grant you release from your duties and responsibilities as a sales manager. We are pleased with the way you have performed all your duties, responsibilities, and tasks with diligence, sincerity, and utmost professionalism.",
      ),
    ),
    para(
      t(
        "Kindly note that your full and final settlement will be made as per the firm's policy in the stipulated time.",
      ),
    ),
    para(
      t(
        "We highly appreciate your efforts and contributions to the firm during your tenure and wish you the best in all your future endeavors.",
      ),
    ),

    // Sign-off -------------------------------------------------------------
    spacer("lg"),
    para(t("CA Manan Vasa")),
    para(f("signDate", "Date", { placeholder: "e.g. 21st March 2026", date: true })),
  ],
};

export default template;
