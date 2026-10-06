/**
 * Approved HR letter catalogue.
 *
 * This is metadata only: it controls the user-visible code, name, grouping and
 * availability of each approved letter. Authored templates stay in the registry
 * so historical issued documents remain resolvable, but only this catalogue is
 * used for the HR letter navigation and library.
 */

export type ApprovedLetterSectionId =
  | "post-interview"
  | "post-appointment"
  | "during-employment"
  | "appraisal-letters"
  | "exit";

export type ApprovedLetterAvailability = "ready" | "content-pending";

export interface ApprovedLetterEntry {
  /** Stable route segment. For ready entries this is also the template key. */
  key: string;
  /** The number/code approved for this letter. */
  code: string;
  /** Exact approved display name. */
  title: string;
  availability: ApprovedLetterAvailability;
  /** Short UI-only description; never legal letter content. */
  blurb: string;
}

export interface ApprovedLetterSection {
  id: ApprovedLetterSectionId;
  title: string;
  letters: readonly ApprovedLetterEntry[];
}

export const APPROVED_LETTER_CATALOGUE: readonly ApprovedLetterSection[] = [
  {
    id: "post-interview",
    title: "Post Interview",
    letters: [
      { key: "selection", code: "1A", title: "Selection Letter", availability: "ready", blurb: "Selection decision for the candidate." },
      { key: "rejection", code: "1B", title: "Rejection Letter", availability: "ready", blurb: "Interview outcome communication." },
      { key: "assignment", code: "1C", title: "Assignment Needed", availability: "ready", blurb: "Assignment request for the candidate." },
      { key: "next-round", code: "1D", title: "Next Round of Interview", availability: "ready", blurb: "Invitation to the next interview round." },
      { key: "free-training", code: "1E", title: "Pre Employment Training Letter", availability: "ready", blurb: "Candidate acceptance for pre-employment training and evaluation." },
    ],
  },
  {
    id: "post-appointment",
    title: "Post Appointment",
    letters: [
      { key: "declaration", code: "2", title: "Employee Compliance and Acknowledgment Letter", availability: "ready", blurb: "Employee compliance and acknowledgement declaration." },
      { key: "policy-acknowledgement", code: "3", title: "Policy Signature Letter", availability: "ready", blurb: "Acknowledgement and acceptance of company policies." },
      { key: "minor-internship-undertaking", code: "4", title: "Undertaking Minor Letter", availability: "ready", blurb: "Undertaking for a minor intern." },
      { key: "appointment", code: "5", title: "Appointment Letter", availability: "ready", blurb: "Formal appointment letter." },
      { key: "declaration-letter", code: "6", title: "Declaration Letter", availability: "content-pending", blurb: "Content Pending / Not Provided." },
      { key: "confirmation", code: "7", title: "End of Probation Period", availability: "ready", blurb: "Completion of probation period." },
      { key: "ctc-breakup", code: "8", title: "CTC Breakup Letter", availability: "ready", blurb: "Compensation breakup." },
    ],
  },
  {
    id: "during-employment",
    title: "During Employment",
    letters: [
      { key: "employee-of-the-month", code: "9", title: "Employee of the Month", availability: "ready", blurb: "Recognition for a standout performer." },
      { key: "birthday", code: "10", title: "Birthday", availability: "ready", blurb: "Birthday communication." },
      { key: "work-anniversary", code: "11", title: "Work Anniversary", availability: "content-pending", blurb: "Content Pending / Not Provided." },
      { key: "resignation-rejection", code: "12", title: "Resignation Rejection Letter", availability: "ready", blurb: "Response declining a resignation." },
      { key: "resignation-acceptance", code: "13", title: "Resignation Acceptance Letter", availability: "ready", blurb: "Formal acceptance of a resignation." },
    ],
  },
  {
    id: "appraisal-letters",
    title: "Appraisal Letters",
    letters: [
      { key: "promotion", code: "14", title: "Promotion Letter", availability: "ready", blurb: "Promotion communication." },
      { key: "increment", code: "15", title: "Salary Revision Letter", availability: "ready", blurb: "Salary revision communication." },
      { key: "promotion-revised-ctc", code: "16", title: "Appraisal + Promotion Letter", availability: "ready", blurb: "Promotion and salary revision communication." },
    ],
  },
  {
    id: "exit",
    title: "Exit",
    letters: [
      { key: "ffs", code: "17", title: "FFS", availability: "ready", blurb: "Full and final settlement." },
      { key: "ffs-acknowledgement", code: "18", title: "FFS Acknowledgement Letter", availability: "ready", blurb: "Acknowledgement of full and final settlement." },
      { key: "relieving", code: "19", title: "Relieving Letter", availability: "ready", blurb: "Relieving confirmation." },
      { key: "letter-of-recommendation", code: "20", title: "Letter of Recommendation", availability: "ready", blurb: "Recommendation for an employee." },
      { key: "experience-letter", code: "21", title: "Experience Letter", availability: "ready", blurb: "Employment experience confirmation." },
    ],
  },
] as const;

const CATALOGUE_BY_KEY = new Map(
  APPROVED_LETTER_CATALOGUE.flatMap((section) => section.letters.map((letter) => [letter.key, letter] as const)),
);

export function approvedLetterByKey(key: string): ApprovedLetterEntry | undefined {
  return CATALOGUE_BY_KEY.get(key);
}
