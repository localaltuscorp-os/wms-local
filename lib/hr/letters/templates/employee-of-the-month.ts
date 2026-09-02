/**
 * HR LETTER — Employee of the Month Award.
 *
 * A warm, congratulatory recognition letter naming the awarded employee, their
 * role and the award month, signed off by management (CA Manan Vasa). Authored
 * against the declarative letter model in ../types. PURE + CLIENT-SAFE.
 *
 * Red (editable) fields: employeeName, jobTitle, monthYear.
 */

import { type LetterTemplate, t, f, para, heading, signature } from "../types";

const template: LetterTemplate = {
  key: "employee-of-the-month",
  title: "Employee of the Month Award",
  category: "milestones",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Celebrate the month's standout performer with a heartfelt award letter.",
  blocks: [
    heading("Employee of the Month Award Letter", 1),

    para(t("To: "), f("employeeName", "Employee Name", { placeholder: "Full name" })),
    para(t("Position: "), f("jobTitle", "Job Title", { placeholder: "e.g. Accounts Executive" })),

    heading("Subject: Congratulations on Being Named Employee of the Month", 3),

    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(",")),

    para(
      t("Congratulations on being selected as our Employee of the Month for "),
      f("monthYear", "Month, Year", { placeholder: "e.g. July, 2026" }),
      t("!"),
    ),

    para(
      t(
        "This recognition is awarded in appreciation of your exceptional dedication, outstanding performance, and positive attitude. Your commitment to excellence, willingness to support your colleagues, and consistent efforts to go above and beyond have made a significant impact on our team and organization.",
      ),
    ),

    para(
      t(
        "Your professionalism, reliability, and strong work ethic set an excellent example for others. We sincerely appreciate the enthusiasm and passion you bring to your role each day.",
      ),
    ),

    para(
      t(
        "On behalf of the entire management team, thank you for your valuable contributions. We are proud to have you as part of our organization and look forward to your continued success.",
      ),
    ),

    para(
      t(
        "Please accept our heartfelt congratulations on this well-deserved recognition. Keep up the outstanding work!",
      ),
    ),

    para(t("With appreciation,")),

    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [t("Management")],
      showDate: true,
      place: [f("place", "Place", { defaultValue: "Mumbai" })],
    }),
  ],
};

export default template;
