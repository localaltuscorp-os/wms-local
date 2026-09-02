/**
 * HR LETTER — Next Round Invitation.
 *
 * Invites a candidate who cleared the first interview round to the next round,
 * with a structured "Interview Details" block (Date / Time / Venue) as editable
 * term rows. Authored against the declarative model in ../types.
 *
 * PURE + CLIENT-SAFE (imports only ../types): the client editor, the server PDF
 * renderer and the issue action all read this template. Load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, term, signature } from "../types";

const template: LetterTemplate = {
  key: "next-round",
  title: "Next Round Invitation",
  category: "recruitment",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Invite a shortlisted candidate to the next round of the interview.",
  blocks: [
    para(t("Dear "), f("candidateName", "Candidate Name", { placeholder: "Full name" }), t(",")),
    para(
      t("Thank you for attending the first round of the Interview for the position of "),
      f("jobTitle", "Job Title", { placeholder: "e.g. Accounts Executive" }),
      t("."),
    ),
    para(
      t(
        "We are pleased to inform you that you have been shortlisted for the second round of the interview. We would like to invite you to discuss your opportunities with our firm.",
      ),
    ),
    heading("Interview Details:", 3),
    term("Date", f("date", "Date", { placeholder: "e.g. 25 July 2026", date: true })),
    term("Time", f("time", "Time", { placeholder: "e.g. 11:00 AM" })),
    term("Venue", f("venue", "Venue", { placeholder: "Location / Online Meeting Link" })),
    para(t("Kindly confirm your availability by replying to this email.")),
    para(t("We look forward to meeting you.")),
    para(t("Warm Regards,")),
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
