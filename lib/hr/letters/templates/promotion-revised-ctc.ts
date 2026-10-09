import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature, table, trow, term } from "../types";
import { personSignOff } from "../sign-off";

/** Source: approved Promotion & Salary Revision Letter PDF. */
const template: LetterTemplate = {
  key: "promotion-revised-ctc",
  title: "Appraisal + Promotion Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb: "Promotion and salary revision communication following appraisal.",
  blocks: [
    heading("Promotion & Salary Revision Letter", 1),
    term("Date", f("letterDate", "Date", { date: true })),
    term("Employee Name", f("employeeName", "Employee Name")),
    term("Current Designation", f("currentDesignation", "Current Designation")),
    term("Department", f("department", "Department", { optionsKey: "departments" })),
    heading("Subject: Promotion and Salary Revision", 2),
    para(t("Dear "), f("employeeName", "Employee Name"), t(",")),
    para(t("We are pleased to inform you that, in recognition of your performance, contribution, dedication, and progress within the organization, the management has decided to promote you from "), f("currentDesignation", "Current Designation"), t(" to "), f("newDesignation", "New Designation"), t(", effective "), f("effectiveDate", "Effective Date", { date: true }), t(".")),
    para(t("Along with your promotion, your compensation has also been revised. Your revised salary will be ₹"), f("newSalary", "New Salary", { numeric: true }), t(" per month / ₹"), f("newCtc", "New CTC", { numeric: true }), t(" per annum, effective from "), f("effectiveDate", "Effective Date", { date: true }), t(".")),
    heading("Revised Employment Details", 2),
    table(["Particular", "Existing", "Revised"], [
      trow([[t("Designation")], [f("currentDesignation", "Current Designation")], [f("newDesignation", "New Designation")]]),
      trow([[t("Department")], [f("department", "Department")], [f("revisedDepartment", "Revised Department")]]),
      trow([[t("Monthly Salary")], [t("₹"), f("oldSalary", "Old Salary", { numeric: true })], [t("₹"), f("newSalary", "New Salary", { numeric: true })]]),
      trow([[t("Annual CTC")], [t("₹"), f("oldCtc", "Old CTC", { numeric: true })], [t("₹"), f("newCtc", "New CTC", { numeric: true })]]),
      trow([[t("Effective Date")], [t("—")], [f("effectiveDate", "Effective Date", { date: true })]]),
      trow([[t("Reporting Manager")], [f("currentManager", "Current Reporting Manager")], [f("newManager", "New Reporting Manager")]]),
    ]),
    heading("Promotion – Terms & Conditions", 2),
    bullets(
      [t("Effective Date: The promotion and revised compensation will be effective from "), f("effectiveDate", "Effective Date", { date: true }), t(". Salary revisions will be applicable from this date unless otherwise specified in writing by the management.")],
      [t("Role & Responsibilities: With the promotion, you will assume the responsibilities, duties, and authority associated with the new position. You may also be assigned additional responsibilities based on business requirements.")],
      [t("Performance Expectations: The promotion reflects your performance to date and is accompanied by an expectation of continued performance, achievement of assigned targets/KPIs, and professional conduct in your new role.")],
      [t("Performance Review: Your performance in the promoted role will continue to be reviewed periodically in accordance with the company’s appraisal and performance-management process.")],
      [t("Company Policies: You will remain bound by all applicable Altus Corp policies, procedures, rules, confidentiality requirements, code of conduct, attendance requirements, and other employment terms.")],
      [t("Reporting & Accountability: You will report to "), f("newManager", "Reporting Manager"), t(" or any other person designated by management and will be accountable for the responsibilities assigned to your position.")],
      [t("Salary & Benefits: The revised salary mentioned in this letter will supersede the previous salary structure from the effective date. Other benefits, allowances, deductions, and statutory contributions will continue to be governed by applicable company policy and law.")],
      [t("No Automatic Future Increment: This promotion and salary revision do not create an entitlement to a further increment or promotion at any particular date. Future revisions will be based on performance, business requirements, company policy, and management decisions.")],
      [t("Probation/Review Period, if Applicable: Where applicable, the employee may be subject to a review period of "), f("reviewMonths", "Review Period (months)", { numeric: true }), t(" months in the new position. Continued placement in the promoted role will be subject to satisfactory performance during this period.")],
      [t("Business Requirements: The company reserves the right to reasonably modify responsibilities, reporting structures, targets, or work assignments in accordance with business requirements and organizational needs.")],
      [t("Confidentiality: The employee is expected to maintain confidentiality regarding company information, client information, business data, salary/compensation information where required by company policy, and other confidential matters.")],
      [t("Acceptance: By signing this letter, you acknowledge and accept the promotion, revised compensation, responsibilities, and terms and conditions applicable to your new role.")],
    ),
    heading("Congratulations", 2),
    para(t("We appreciate your contribution to Altus Corp and recognize your efforts and progress within the organization. We look forward to your continued commitment, growth, and success in your new role.")),
    para(t("Congratulations on your promotion!")),
    spacer("lg"),
    signature({ forEntity: true, esign: false, name: [f("authorizedPerson", "Authorized Person’s Name")], designation: [f("signatoryDesignation", "Designation", { defaultValue: "Human Resources / Management" })] }),
    heading("Employee Acknowledgement", 2),
    para(t("I, "), f("employeeName", "Employee Name"), t(", acknowledge that I have received, read, understood, and accepted this Promotion & Salary Revision Letter, including the terms and conditions applicable to my promoted position.")),
    ...personSignOff({ prefix: "employee", who: "Signed by the employee" }),
    term("New Designation", f("newDesignation", "New Designation")),
  ],
};

export default template;
