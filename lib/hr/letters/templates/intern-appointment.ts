/**
 * Intern Appointment Letter.
 *
 * Placed on the Appointment card. Offers an internship — role, reporting
 * manager, start date, location and stipend, plus a structured brief of
 * responsibilities and gains. Red editable fields: date, internName, position
 * (reused so the offer line, details row and role overview stay in sync),
 * reportingManager, startDate, location, stipend, plus the signatory
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
  term,
  bullets,
  signature,
} from "../types";

const template: LetterTemplate = {
  key: "intern-appointment",
  title: "Intern Appointment Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Offer an internship with role, stipend, responsibilities and terms.",
  blocks: [
    para(t("Date: "), f("date", "Date", { placeholder: "DD/MM/YYYY", date: true })),
    para(t("Dear "), f("internName", "Intern Name", { placeholder: "Full name" }), t(",")),
    para(
      t("We are pleased to offer you an internship opportunity with {firm} for the role of "),
      f("position", "Position", { placeholder: "e.g. Business Analyst Intern" }),
      t(
        ". We were impressed by your profile and believe you will be a valuable addition to our team.",
      ),
    ),
    heading("Internship Details", 3),
    term("Position", f("position", "Position", { placeholder: "e.g. Business Analyst Intern" })),
    term("Reporting Manager", f("reportingManager", "Reporting Manager", { placeholder: "e.g. Mr. Rohan Choudhary" })),
    term("Start Date", f("startDate", "Start Date", { placeholder: "e.g. 9th December 2025", date: true })),
    term("Location", f("location", "Location", { placeholder: "e.g. On site, Goregaon, Mumbai" })),
    term("Stipend", f("stipend", "Stipend", { placeholder: "e.g. Rs. 7500/- per month" })),
    heading("Role Overview", 3),
    para(
      t("As a "),
      f("position", "Position", { placeholder: "e.g. Business Analyst Intern" }),
      t(
        ", you will work closely with our core team on high-impact operational systems and data-driven processes that directly influence business decisions and client outcomes.",
      ),
    ),
    heading("Key Responsibilities", 3),
    bullets(
      [t("Build and manage real-time business dashboards using tools such as Altus Dashboards and other systems")],
      [t("Create and maintain highly organized digital ecosystems within Google Drive for seamless collaboration")],
      [t("Structure, clean, and optimize scattered data into scalable and efficient systems")],
      [t("Assist in driving operational clarity that supports measurable business growth")],
      [t("Work on live client performance dashboards and execution tracking systems")],
      [t("Review and monitor participant tools used by business owners in active programs")],
      [t("Ensure data accuracy, structured reporting, and timely system updates")],
      [t("Support large-scale consulting and workshop operations by maintaining smooth backend processes")],
    ),
    heading("What You Will Gain", 3),
    bullets(
      [t("Hands-on experience working on live business systems and client-facing dashboards")],
      [t("Exposure to operational strategy and scalable system design")],
      [t("Practical understanding of how structured operations drive business performance")],
      [t("Opportunity to work in a fast-paced, growth-oriented environment")],
    ),
    heading("Terms & Conditions", 3),
    para(
      t(
        "This internship is subject to firm policies, confidentiality agreements, and satisfactory performance throughout the duration. Further details will be shared during onboarding.",
      ),
    ),
    para(t("Please confirm your acceptance of this offer by signing below.")),
    para(
      t(
        "We are excited about the possibility of you joining our team and contributing to our growth journey.",
      ),
    ),
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
