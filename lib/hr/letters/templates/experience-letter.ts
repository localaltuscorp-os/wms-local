/**
 * Experience Letter / Letter of Recommendation.
 *
 * Placed on the Separation card. Certifies an employee's (or intern's) tenure
 * and contribution on exit. Red editable fields: employeeName (reused so every
 * mention stays in sync), designation, tenure, plus the signatory designation /
 * place. The firm name resolves from the selected paying entity ({firm});
 * pronouns ({he}/{his}/{him}) resolve from the Gender selector.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  t,
  f,
  para,
  heading,
  bullets,
  signature,
} from "../types";

const template: LetterTemplate = {
  key: "experience-letter",
  title: "Experience Letter",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Certify an employee's tenure, role and contribution on exit.",
  blocks: [
    heading("Experience Letter / Letter of Recommendation", 1),
    para(t("To whomsoever it may concern,")),
    para(
      t("We hereby certify that "),
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Yug Varma" }),
      t(" was employed with {firm} as "),
      f("designation", "Designation", { placeholder: "e.g. Research Analyst Intern" }),
      t(", from "),
      f("tenure", "Tenure", { placeholder: "e.g. 14th May to 10th July 2026" }),
      t("."),
    ),
    para(t("{he} has done the following work:")),
    bullets(
      [
        t(
          "Devising a solution based matrix by analysing problems across B2C, D2C and B2B business verticals and performing thorough market research for the same.",
        ),
      ],
      [
        t(
          "Produced web content and prepared case studies of clients for the Firm by synthesizing technical and commercial information into concise, accessible narratives.",
        ),
      ],
      [
        t(
          "Assisted marketing projects by preparing presentable client-based information explaining their growth.",
        ),
      ],
    ),
    para(
      t("Throughout {his} tenure, "),
      f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Yug Varma" }),
      t(
        " consistently displayed a positive attitude, willingness to learn, strong communication skills, and the ability to work effectively both independently and as part of a team. {his} contributions played a valuable role in supporting the Firm's marketing and administrative objectives.",
      ),
    ),
    para(t("We appreciate {his} dedication and wish {him} every success in {his} future professional endeavors.")),
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
