import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature, term } from "../types";
import { personSignOff } from "../sign-off";

/** Source: approved Candidate Pre-employment Training Acceptance Letter PDF. */
const template: LetterTemplate = {
  key: "free-training",
  title: "Candidate Acceptance Letter – Pre-Employment Training & Evaluation",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "acknowledge",
  blurb: "Candidate acceptance of the pre-employment training and evaluation programme.",
  blocks: [
    heading("Candidate Acceptance Letter – Pre-Employment Training & Evaluation", 1),
    term("Date", f("letterDate", "Date", { date: true })),
    term("Candidate Name", f("candidateName", "Candidate Name")),
    term("Position Applied For", f("position", "Position Applied For")),
    term("Department", f("department", "Department", { optionsKey: "departments" })),
    heading("Subject: Acceptance of Pre-Employment Training & Evaluation Program", 2),
    para(t("Dear HR Team,")),
    para(t("I, "), f("candidateName", "Candidate Name"), t(", hereby acknowledge that I have been interviewed for the position of "), f("position", "Position Applied For"), t(" at Altus Corp and have been informed about the company’s 15 working-day Pre-Employment Training & Evaluation Program.")),
    para(t("I hereby confirm my willingness to participate in the training and evaluation program and agree to the following terms:")),
    bullets(
      [t("I understand that the training period will be for 15 working days and is intended to familiarize me with Altus Corp’s work culture, processes, systems, products, and performance expectations.")],
      [t("I understand that this is a pre-employment training and evaluation period and does not constitute confirmation of employment or guarantee the issuance of an Appointment Letter.")],
      [t("I agree to follow all company policies, workplace rules, confidentiality requirements, attendance and punctuality standards, and instructions provided by my Reporting Manager, HR, trainers, or other authorized personnel.")],
      [t("I understand that my performance during the training period will be evaluated on factors including technical knowledge, learning ability, adaptability, attendance, punctuality, discipline, professional conduct, communication, teamwork, and overall suitability for the role.")],
      [t("I understand that my employment status will be reviewed and finalized on the 15th working day of the training period. If I successfully meet the company’s requirements and receive management approval, I may be issued an official Appointment Letter.")],
      [t("I understand and accept that the 15-day training period is unpaid unless I am selected for employment and issued an Appointment Letter. In such a case, Altus Corp will pay me for the entire 15-day training period as per the applicable salary/payroll process.")],
      [t("I understand that if I am not selected after the evaluation, no payment or remuneration will be payable for the training period.")],
      [t("I further understand that if I voluntarily withdraw, discontinue, or choose not to continue with the training before completion of the evaluation process, I will not be entitled to any payment or remuneration for the training period.")],
      [t("I understand that Altus Corp may discontinue my participation in the training program if my performance, conduct, attendance, discipline, or suitability is found to be unsatisfactory.")],
      [t("I understand and acknowledge that Altus Corp reserves the right to amend, extend, shorten, suspend, or discontinue this policy or the Pre-Employment Training & Evaluation Program at its sole discretion, subject to applicable laws.")],
      [t("I agree to maintain strict confidentiality regarding all company information, documents, customer data, business processes, software, intellectual property, and other confidential information that I may have access to during the training period.")],
      [t("I confirm that I have read, understood, and voluntarily accepted the terms and conditions of the Pre-Employment Training & Evaluation Program.")],
    ),
    para(t("I am signing this letter voluntarily and with full understanding of the above terms.")),
    spacer("lg"),
    heading("Candidate Declaration", 2),
    para(t("I, "), f("candidateName", "Candidate Name"), t(", confirm that I have understood the above terms and willingly accept the Pre-Employment Training & Evaluation Program offered by Altus Corp.")),
    ...personSignOff({ prefix: "candidate", who: "Signed by the candidate" }),
    term("Contact Number", f("candidatePhone", "Contact Number")),
    term("Email ID", f("candidateEmail", "Email ID")),
    signature({ forEntity: true, esign: false, name: [f("hrRepresentative", "HR Representative")], designation: [t("Human Resources")], showDate: true }),
  ],
};

export default template;
