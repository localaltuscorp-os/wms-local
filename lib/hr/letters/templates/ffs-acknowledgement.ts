/**
 * FULL & FINAL SETTLEMENT ACKNOWLEDGEMENT LETTER — employee-signed.
 *
 * The departing employee acknowledges receipt of their Full & Final Settlement,
 * confirms they have no further financial claims, that all company property has
 * been returned, and that the acknowledgement is made voluntarily. Closes with an
 * employee signature block (Employee Name / Employee ID / Signature / Date).
 *
 * Authored against the declarative letter model in ../types. Red (editable)
 * fields: date, employeeName, employeeId, company, lastWorkingDate — reused ids
 * keep repeated values in sync (e.g. the company name in the address, the body
 * and the claims clause). Everything else is frozen prose.
 */

import { type LetterTemplate, t, f, para, term } from "../types";

const template: LetterTemplate = {
  key: "ffs-acknowledgement",
  title: "Full & Final Settlement Acknowledgement",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb: "Employee acknowledges receipt of their Full & Final Settlement and confirms no further claims.",
  blocks: [
    para(t("Date: "), f("date", "Date", { placeholder: "e.g. 25 July 2026", date: true })),

    para(t("To")),
    para(t("The HR Department")),
    para(f("company", "Firm Name", { defaultValue: "Altus Corp" })),

    para(t("Subject: Acknowledgement of Receipt of Full & Final Settlement")),

    para(t("Dear Sir/Madam,")),

    para(
      t("I, "),
      f("employeeName", "Employee Name", { placeholder: "Full name" }),
      t(", Employee ID "),
      f("employeeId", "Employee ID", { placeholder: "e.g. ALT-0042" }),
      t(
        ", hereby acknowledge that I have received my Full & Final Settlement from ",
      ),
      f("company", "Firm Name", { defaultValue: "Altus Corp" }),
      t(" in respect of my employment, which ended on "),
      f("lastWorkingDate", "Last Working Date", { placeholder: "e.g. 30 June 2026", date: true }),
      t("."),
    ),

    para(
      t(
        "I further confirm that, upon receipt of the above settlement, I have no further financial claims, demands, or dues of any nature whatsoever against ",
      ),
      f("company", "Firm Name", { defaultValue: "Altus Corp" }),
      t(
        " arising out of or in connection with my employment or its termination.",
      ),
    ),

    para(
      t(
        "I also confirm that I have returned all firm property, documents, equipment, and confidential information in my possession, if applicable.",
      ),
    ),

    para(
      t(
        "This acknowledgement is executed voluntarily and without any coercion, confirming that the Full & Final Settlement has been received to my satisfaction.",
      ),
    ),

    para(t("Thank you for the opportunity to work with the organization.")),

    para(t("Yours faithfully,")),

    term("Employee Name", f("employeeName", "Employee Name", { placeholder: "Full name" })),
    term("Employee ID", f("employeeId", "Employee ID", { placeholder: "e.g. ALT-0042" })),
    term("Signature", [t("")]),
    term("Date", f("signDate", "Date", { placeholder: "e.g. 25 July 2026", date: true })),
  ],
};

export default template;
