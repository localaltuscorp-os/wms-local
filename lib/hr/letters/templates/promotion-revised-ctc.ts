/**
 * PROMOTION — REVISED CTC LETTER — a promotion with the accompanying CTC revision.
 *
 * Confirms the employee's elevation to a new designation (and, optionally,
 * department / reporting manager) together with the revised Cost to Company that
 * comes with it. Previous → revised CTC and the effective date are called out,
 * followed by the headline revised structure. All ₹ figures are editable red
 * fields pulled from the Compensation Workbench.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, term, table, signature } from "../types";
import { ctcRows } from "./ctc-breakup";

const template: LetterTemplate = {
  key: "promotion-revised-ctc",
  title: "Promotion — Revised CTC Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Confirm a promotion and the revised CTC that comes with it.",
  blocks: [
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "e.g. Mr. Rohan Choudhary" }), t(",")),

    para(
      t(
        "It gives us immense pleasure to recognise your outstanding performance, ownership and leadership. In acknowledgement of your contribution, we are delighted to promote you from ",
      ),
      f("previousDesignation", "Previous Designation", { placeholder: "e.g. Business Development Manager" }),
      t(" to "),
      f("newDesignation", "New Designation", { placeholder: "e.g. Senior Business Development Manager" }),
      t(", effective "),
      f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 August 2026", date: true }),
      t("."),
    ),

    heading("Role Details", 2),
    term("New Designation", f("newDesignation", "New Designation")),
    term("Department", f("department", "Department", { placeholder: "e.g. Sales" })),
    term("Reporting Manager", f("reportingManager", "Reporting Manager", { placeholder: "e.g. CA Manan Vasa" })),

    heading("Revised Compensation", 2),
    term("Previous Cost to Firm (per annum)", f("previousCtc", "Previous CTC (per year)", { placeholder: "₹0" })),
    term("Revised Cost to Firm (per annum)", f("revisedCtc", "Revised CTC (per year)", { placeholder: "₹0" })),

    heading("Revised CTC Structure with Break-up", 2),
    table(["COMPONENTS", "PER MONTH", "PER ANNUM"], ctcRows()),

    para(
      t(
        "In February the PT will be Rs. 300/- as per govt PT rules; the rest of the months Rs. 200/-.",
      ),
    ),

    para(
      t(
        "With this new role come greater responsibilities, and we are confident you will rise to them with the same dedication you have always shown. All other terms and conditions of your employment remain unchanged.",
      ),
    ),

    para(
      t("Congratulations once again on this well-deserved milestone in your journey with us."),
    ),

    para(t("Warm regards,")),

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
