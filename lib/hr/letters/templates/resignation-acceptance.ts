import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature, term } from "../types";

const template: LetterTemplate = {
  key: "resignation-acceptance",
  title: "Resignation Acceptance Letter",
  category: "separation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Formal acceptance of an employee resignation and the required exit formalities.",
  blocks: [
    heading("Resignation Acceptance Letter", 1),
    term("Date", f("letterDate", "Date", { date: true })),
    term("Employee Name", f("employeeName", "Employee Name")),
    term("Employee ID", f("employeeId", "Employee ID")),
    term("Designation", f("designation", "Designation")),
    term("Department", f("department", "Department", { optionsKey: "departments" })),
    heading("Subject: Acceptance of Resignation", 2),
    para(t("Dear "), f("employeeName", "Employee Name"), t(",")),
    para(t("This is with reference to your resignation submitted on "), f("resignationDate", "Resignation Date", { date: true }), t(" from the position of "), f("designation", "Designation"), t(" at Altus Corp.")),
    para(t("We hereby confirm that your resignation has been formally accepted by the Management.")),
    para(t("Your last working day with the Company will be "), f("lastWorkingDate", "Last Working Date", { date: true }), t(", subject to completion of the applicable notice period, handover responsibilities, and other exit formalities as per Company policy.")),
    para(t("You are required to complete the following before your last working day:")),
    bullets(
      [t("Complete the necessary handover of your responsibilities, work, documents, and pending assignments to the concerned person/team.")],
      [t("Return all Company assets, documents, equipment, access cards, and other Company property in your possession.")],
      [t("Complete all applicable exit and clearance formalities.")],
      [t("Ensure that any outstanding Company-related matters are appropriately resolved before your last working day.")],
      [t("Continue to comply with the Company’s applicable policies, confidentiality obligations, and other terms applicable to you until your separation is formally completed.")],
    ),
    para(t("Your final settlement and other applicable separation documents will be processed upon completion of the required exit formalities and clearances, in accordance with Company policy.")),
    para(t("We thank you for your contributions during your association with Altus Corp and wish you success in your future endeavours.")),
    spacer("lg"),
    signature({ forEntity: true, esign: true, name: [f("authorizedSignatory", "Authorized Signatory")], designation: [f("signatoryDesignation", "Designation")], showDate: true }),
  ],
};

export default template;
