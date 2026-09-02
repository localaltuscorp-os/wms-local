/**
 * Rejection of Resignation Letter.
 *
 * Placed on the Separation card. The management's formal decision not to accept
 * a tendered resignation. Red editable fields: employeeName (reused so the
 * address block and greeting stay in sync), resignationDate, plus the signatory
 * designation / place. The firm name resolves from the selected paying entity
 * ({firm}).
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  t,
  f,
  para,
  heading,
  signature,
} from "../types";

const template: LetterTemplate = {
  key: "resignation-rejection",
  title: "Rejection of Resignation Letter",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Formally decline a tendered resignation and request continued service.",
  blocks: [
    para(t("To,")),
    para(f("employeeName", "Employee Name", { placeholder: "Full name" })),
    heading("Subject: Rejection of Your Resignation", 3),
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),
    para(
      t("This is with reference to your resignation letter dated "),
      f("resignationDate", "Resignation Date", { placeholder: "DD/MM/YYYY", date: true }),
      t(", wherein you expressed your intention to resign from your position at {firm}."),
    ),
    para(
      t(
        "After careful consideration, the management has decided not to accept your resignation at this time due to ongoing business requirements and the critical nature of your role within the organization.",
      ),
    ),
    para(
      t(
        "We sincerely value your contributions and believe your continued association with the firm is important. We request that you continue in your current position and work with the management to address any concerns or issues that may have influenced your decision.",
      ),
    ),
    para(
      t(
        "If you would like to discuss your reasons for resigning, we would be pleased to meet with you and explore possible solutions.",
      ),
    ),
    para(
      t(
        "Accordingly, your resignation is not accepted as of the date of this letter. We look forward to your continued support and commitment to the organization.",
      ),
    ),
    para(t("Thank you for your understanding and cooperation.")),
    para(t("Regards,")),
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
