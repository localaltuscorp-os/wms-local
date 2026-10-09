import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature, term } from "../types";
import { personSignOff } from "../sign-off";

const template: LetterTemplate = {
  key: "policy-acknowledgement",
  title: "Policy Acknowledgement Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb: "Acknowledgement and acceptance of the company policies provided to an employee.",
  blocks: [
    heading("Policy Acknowledgement Letter", 1),
    term("Date", f("letterDate", "Date", { date: true })),
    term("Employee Name", f("employeeName", "Employee Name")),
    term("Employee ID", f("employeeId", "Employee ID")),
    term("Designation", f("designation", "Designation")),
    term("Department", f("department", "Department", { optionsKey: "departments" })),
    heading("Subject: Acknowledgement and Acceptance of Company Policies", 2),
    para(t("I hereby confirm that I have read, understood, and reviewed the policies and guidelines of Altus Corp applicable to my employment and responsibilities. The policies are as below:")),
    bullets(
      [t("Prevention of Sexual Harassment")],
      [t("Anti Harassment and Non Discrimination Policy")],
      [t("Pre-Employment Training & Evaluation Policy")],
      [t("Prevention & Management of Employee Separation (Exit Policy)")],
      [t("Incentive Clash Policy")],
      [t("Attendance Policy")],
      [t("Company Asset Management Policy")],
      [t("Employee Travel and Railway Pass Policy")],
    ),
    para(t("I understand that these policies have been established to maintain a professional, disciplined, respectful, and productive work environment. I agree to abide by and comply with all applicable company policies, rules, procedures, and instructions during my association with Altus Corp.")),
    para(t("I understand that it is my responsibility to remain aware of and comply with the policies applicable to me. In case of any non-compliance, violation, or breach of company policy, I understand that Management reserves the right to review the matter and take appropriate action or make an appropriate decision in accordance with the applicable policy and company rules, subject to applicable law.")),
    para(t("I acknowledge that any action taken by Management in relation to a policy violation may include disciplinary measures, where applicable.")),
    para(t("By signing below, I confirm that I have read and understood the company policies and agree to abide by them throughout my employment with Altus Corp.")),
    spacer("lg"),
    heading("Employee Acknowledgement", 2),
    ...personSignOff({ prefix: "employee", who: "Signed by the employee" }),
    signature({ forEntity: true, esign: false, name: [f("companyRepresentative", "Company Representative")], designation: [t("Human Resources")] }),
  ],
};

export default template;
