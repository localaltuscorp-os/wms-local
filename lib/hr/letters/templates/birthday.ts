/**
 * HR LETTER — Birthday Wishes.
 *
 * A warm, personal birthday note from the Altus Corp family to an employee.
 * ONE editable red field (the employee's name); everything else is frozen prose.
 * Signed off "With warmest wishes, Your Altus Corp Family" — no Founder e-sign
 * block (`signature: "none"`).
 *
 * Authored against the declarative letter model — see ../types.
 */

import { type LetterTemplate, t, f, para } from "../types";

const template: LetterTemplate = {
  key: "birthday",
  title: "Birthday Wishes",
  category: "milestones",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "A warm birthday note from the whole Altus Corp family.",
  blocks: [
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),
    para(t("Happy Birthday!")),
    para(
      t(
        "On your special day, we simply want to say thank you for being you. Your dedication, positivity, and the way you support those around you make our workplace a better place every day.",
      ),
    ),
    para(
      t(
        "We hope this year brings you good health, endless happiness, exciting opportunities, and beautiful moments with the people you love. May you continue to grow, dream big, and achieve everything your heart desires.",
      ),
    ),
    para(t("Enjoy your day you truly deserve to be celebrated.")),
    para(t("Wishing you a birthday filled with joy, love, and unforgettable memories!")),
    para(t("With warmest wishes,")),
    para(t("Your {firm} Family")),
  ],
};

export default template;
