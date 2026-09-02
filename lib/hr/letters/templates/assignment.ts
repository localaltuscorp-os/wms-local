/**
 * HR LETTER — Assignment Needed Letter (pre-hire take-home task).
 *
 * Authored against the declarative letter model in ../types. Sent to a
 * shortlisted candidate to invite them to the next step: a short take-home
 * assignment that lets us assess their practical, hands-on skills before the
 * final decision. Warm and professional, matched to the selection / rejection
 * seeds. Signed by the Founder.
 *
 * PURE + CLIENT-SAFE: imports only ../types (no db / node / server-only).
 */

import { type LetterTemplate, t, f, para, heading, bullets, signature } from "../types";

const template: LetterTemplate = {
  key: "assignment",
  title: "Assignment Needed Letter",
  category: "recruitment",
  entityDefault: "altus-corp",
  signature: "none",
  blurb: "Invite a shortlisted candidate to a short take-home assignment.",
  blocks: [
    para(t("Dear "), f("candidateName", "Candidate Name", { placeholder: "Full name" }), t(",")),
    para(
      t("Thank you for the time you have invested with us so far. We were genuinely impressed by our conversations, and we are pleased to move you forward to the next step for the "),
      f("position", "Position Title", { placeholder: "e.g. Accounts Executive" }),
      t(" role at "),
      f("company", "Firm / Entity", { defaultValue: "Altus Corp" }),
      t("."),
    ),
    para(
      t(
        "As part of our process, we would like to see how you approach real work. To that end, we are sharing a short take-home assignment. It is designed to be practical rather than exhaustive — a chance for you to show us your thinking, your craft and your attention to detail.",
      ),
    ),
    heading("Your assignment", 2),
    para(
      f("assignmentBrief", "Assignment Brief", {
        placeholder:
          "Describe the task clearly — what to build/prepare, any data or context provided, the expected deliverable(s), and how it will be evaluated.",
        multiline: true,
      }),
    ),
    heading("Submission", 2),
    para(
      t(
        "Please treat this as a guided exercise, not a test with a single right answer — we care most about how you reason and how you present your work.",
      ),
    ),
    bullets(
      [t("Kindly submit your completed assignment by "), f("submissionDeadline", "Submission Deadline", { placeholder: "e.g. 5 August 2026, 6:00 PM IST" }), t(".")],
      [t("Share your submission via "), f("submissionMethod", "How to Submit", { placeholder: "e.g. reply to this email with the file attached" }), t(".")],
    ),
    para(
      t(
        "If anything in the brief is unclear, please do reach out — asking thoughtful questions is very much welcome. We are excited to see what you come up with, and we look forward to the next conversation.",
      ),
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
