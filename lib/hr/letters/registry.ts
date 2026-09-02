/**
 * HR LETTERS — the registry. Maps a letter `key` → its `LetterTemplate`.
 *
 * EVERY authored letter lives in its OWN file under ./templates/<key>.ts (a
 * default-exported LetterTemplate). This module is the single index: it imports
 * each template and exposes the lookup helpers. Nothing is wired per-letter — the
 * generic page (`/hr/letters/<key>`), the index, the PDF export and the issue
 * flow all read from here.
 *
 * ADDING A LETTER = author ./templates/<newKey>.ts, then add its default import
 * to the LETTERS map below. The template's own `key` must equal `<newKey>`.
 *
 * PURE + CLIENT-SAFE (imports only ./types + entities via the templates): the
 * client editor, the server PDF renderer and the issue action all read the
 * registry. Load-neutral.
 */

import {
  type LetterTemplate,
  type HrCategory,
  type LetterSignature,
  CATEGORY_LABELS,
  HR_CATEGORIES,
} from "./types";

// Recruitment & Interns
import selection from "./templates/selection";
import rejection from "./templates/rejection";
import nextRound from "./templates/next-round";
import assignment from "./templates/assignment";
// Appointment & Agreements
// Acceptance Letter is UNREGISTERED per product — it duplicated the Selection
// Letter. The template file (./templates/acceptance) is left on disk, just not
// imported/registered so it no longer appears as an option.
// import acceptance from "./templates/acceptance";
import appointment from "./templates/appointment";
import confirmation from "./templates/confirmation";
import freeTraining from "./templates/free-training";
// Compensation
import ctcBreakup from "./templates/ctc-breakup";
import appraisalRevisedCtc from "./templates/appraisal-revised-ctc";
import promotionRevisedCtc from "./templates/promotion-revised-ctc";
import increment from "./templates/increment";
import promotion from "./templates/promotion";
// Milestones & Recognition
import employeeOfTheMonth from "./templates/employee-of-the-month";
import birthday from "./templates/birthday";
// Separation
import ffs from "./templates/ffs";
import ffsAcknowledgement from "./templates/ffs-acknowledgement";
import relieving from "./templates/relieving";
import letterOfRecommendation from "./templates/letter-of-recommendation";
import experienceLetter from "./templates/experience-letter";
import resignationRejection from "./templates/resignation-rejection";
// Interns
import minorInternshipUndertaking from "./templates/minor-internship-undertaking";
import internAppointment from "./templates/intern-appointment";

/* ================================================================== */
/* The registry                                                         */
/* ================================================================== */

/**
 * key → LetterTemplate. Add a letter by authoring ./templates/<key>.ts and
 * adding its default import here. Insertion order here also drives the order
 * within each category on the index.
 */
export const LETTERS: Record<string, LetterTemplate> = {
  // Recruitment & Interns
  selection,
  rejection,
  "next-round": nextRound,
  assignment,
  "minor-internship-undertaking": minorInternshipUndertaking,
  // Appointment & Agreements
  // acceptance,  // ← unregistered: duplicated the Selection Letter
  appointment,
  "intern-appointment": internAppointment,
  confirmation,
  "free-training": freeTraining,
  // Compensation
  "ctc-breakup": ctcBreakup,
  "appraisal-revised-ctc": appraisalRevisedCtc,
  "promotion-revised-ctc": promotionRevisedCtc,
  increment,
  promotion,
  // Milestones & Recognition
  "employee-of-the-month": employeeOfTheMonth,
  birthday,
  // Separation
  ffs,
  "ffs-acknowledgement": ffsAcknowledgement,
  relieving,
  "letter-of-recommendation": letterOfRecommendation,
  "experience-letter": experienceLetter,
  "resignation-rejection": resignationRejection,
};

/** Ordered list of every authored letter (index / iteration). */
export const LETTER_LIST: LetterTemplate[] = Object.values(LETTERS);

/** Look up a letter template by key (undefined if not yet authored). */
export function getLetter(key: string): LetterTemplate | undefined {
  return LETTERS[key];
}

/** True when `key` is an authored letter. */
export function isLetterKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(LETTERS, key);
}

/** Authored letters grouped by category, in canonical category order. */
export function lettersByCategory(): Array<{
  category: HrCategory;
  label: string;
  letters: LetterTemplate[];
}> {
  return HR_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    letters: LETTER_LIST.filter((l) => l.category === category),
  })).filter((g) => g.letters.length > 0);
}

/* ------------------------------------------------------------------ */
/* Compatibility shim for the e-signing module                          */
/* ------------------------------------------------------------------ */

/**
 * Minimal doc-type view derived from a letter template. The DigiLocker e-signing
 * flow (app/(app)/documents/sign) looks up an issued document_instances row's
 * type to show a title + decide its signing kind — it only needs these fields,
 * so we derive them from the registry (single source of truth) instead of a
 * separate taxonomy table. Returns undefined for keys not (yet) authored — the
 * caller already tolerates that.
 */
export function getDocType(
  typeKey: string,
): { typeKey: string; title: string; category: HrCategory; signature: LetterSignature } | undefined {
  const l = LETTERS[typeKey];
  if (!l) return undefined;
  return {
    typeKey: l.key,
    title: l.title,
    category: l.category,
    signature: l.signature ?? "none",
  };
}
