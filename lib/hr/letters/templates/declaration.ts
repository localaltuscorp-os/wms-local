/**
 * DECLARATION LETTER — the joiner's own declaration, signed on day one.
 *
 * Sits FIRST in During Employment, before Induction: it is the thing a new
 * employee signs before they are walked through the firm, and the induction
 * record is the step that follows it.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────
 * It declares what only the employee can state: that the information and
 * documents they gave us are true, that they are free to take this employment,
 * that they will keep the firm's information confidential, and - added
 * 2026-09-21 - that they have READ the joining documents and the firm's
 * policies and agree to abide by them.
 *
 * That last clause is a PHYSICAL COUNTERSIGNATURE, not the policy ledger.
 * `policy_compliance` remains the record of which policy a person signed, at
 * which version, and when; it is per-policy and it resets when a policy is
 * republished. This letter is one sheet, signed by hand once, filed in a
 * cabinet. Neither replaces the other, and this one must never be read as
 * evidence that a specific policy version was acknowledged - only that the
 * person put their name to the set as it stood on the day they signed.
 *
 * ── THE POLICY LIST IS DERIVED, NEVER TYPED ──────────────────────────────
 * The policies below come from `readyPolicies()` in lib/hr/policies/registry,
 * the same pure selector the server-only `requiredPolicyKeys()` now delegates
 * to. Typing the six names here would mean a seventh policy could be made
 * compulsory while this letter still swore there were six.
 *
 * KNOWN LIMIT: the Policy CMS (lib/hr/policies/load-db.ts) can override a
 * policy's title at runtime, and this module is pure + client-safe so it cannot
 * read the database. The letter therefore prints the REGISTRY titles. A CMS
 * retitle needs the letter re-issued to match.
 *
 * Authored with the span/block builders - PURE + CLIENT-SAFE, load-neutral.
 *
 * The wording is a first draft in the firm's register: every clause is plain
 * enough to be corrected in place by HR, and "Edit freely" on the letter page
 * allows exactly that.
 */

import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature, term } from "../types";
import { personSignOff } from "../sign-off";
import { readyPolicies } from "@/lib/hr/policies/registry";

/**
 * THE WORDING'S VERSION.
 *
 * Bumping this is what makes everyone sign again: `declaration_compliance` rows
 * are keyed on it, so a re-worded declaration leaves the old rows behind at the
 * previous version and the tracker shows the whole firm as outstanding. Change
 * it whenever a clause changes in a way a signatory would care about - adding a
 * document to the list, or altering what is being agreed to. Do NOT bump it for
 * a typo.
 */
export const DECLARATION_VERSION = "1.0";

/**
 * The joining documents this declaration covers, by the names people actually
 * use for them in this app.
 *
 * NOT the formal title of the Free Training Letter ("Pre-Employment Training &
 * Evaluation") - one word away from the policy of nearly the same name, so the
 * list would read as though it named the same thing twice.
 */
const JOINING_DOCUMENTS = [
  "Free Training Letter / Pre-Employment Training Letter (if applicable)",
  "Assignment Needed Letter / Assignment Submission Letter (if applicable)",
  "Pre-Employment Training Acceptance Letter",
  "Offer Letter (Selection Letter)",
  "CTC Breakup Letter",
] as const;

const template: LetterTemplate = {
  key: "declaration",
  title: "Declaration Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  // "acknowledge": the employee signs it, and nothing is e-signed on issue -
  // matching how the other joiner-signed letters in this category behave.
  signature: "acknowledge",
  blurb: "The employee's compliance & acknowledgment declaration - that every joining document and firm policy has been read, understood and will be complied with.",
  blocks: [
    heading("Employee Compliance & Acknowledgment Declaration", 1),

    para(
      t("I, "),
      f("employeeName", "Employee Name", { placeholder: "Full name" }),
      t(", hereby confirm that I have fully read, understood, completed, and reviewed all the documents, letters, and policies provided to me by {firm} in connection with my employment, training, onboarding, and responsibilities."),
    ),

    spacer("md"),

    heading("Documents Acknowledged", 2),
    para(t("I confirm that I have submitted correct information in the Onboarding Form.")),
    para(t("I confirm that I have read, understood, and agree to abide by the following documents:")),
    bullets(...JOINING_DOCUMENTS.map((d) => [t(d)])),

    heading("Policies Acknowledged", 2),
    para(t("I further confirm that I have read, understood, and agree to comply with all the following {firm} policies:")),
    // The policy names are DERIVED from the registry, never typed - see this
    // file's header. "Company Asset Document" is a document, not a
    // registered policy, so it is appended as one extra fixed item.
    bullets(...readyPolicies().map((p) => [t(p.title)]), [t("Company Asset Document")]),

    heading("Employee Declaration", 2),
    para(t("I hereby declare and acknowledge that:")),
    bullets(
      [t("I have read and fully understood all the above-mentioned documents, letters, and policies and have had the opportunity to seek clarification wherever required.")],
      [t("All information, documents, declarations, and details provided by me to {firm} are true, complete, accurate, and genuine to the best of my knowledge.")],
      [t("I agree to comply with all applicable company policies, procedures, rules, instructions, confidentiality requirements, and professional standards communicated to me by {firm} from time to time.")],
      [t("I understand that providing false, misleading, inaccurate, incomplete, or fabricated information, or concealing any material information, may constitute a serious violation of company requirements.")],
      [t("I understand that any violation of the above-mentioned policies, documents, company rules, or other applicable requirements may result in disciplinary action, up to and including termination of employment with immediate effect, where permitted under applicable law.")],
      [t("I understand that if my actions, misconduct, negligence, misrepresentation, policy violation, or unauthorized use or handling of company assets results in any actual financial loss, damage, or other legally recoverable loss to the Company, I may be held responsible for such loss to the extent permitted under applicable law.")],
      [t("I acknowledge that all Company assets provided to me, including but not limited to equipment, devices, documents, access credentials, files, materials, and other property, are to be used responsibly and in accordance with the Company's policies and instructions. I agree to return all Company assets upon request or at the time of separation from the Company.")],
      [t("I understand that the Company reserves the right to take appropriate action in case of any breach of the above documents, policies, or obligations, subject to applicable law.")],
    ),

    heading("Final Acknowledgment", 2),
    para(
      t(
        "By signing below, I confirm that I have voluntarily read, understood, completed, and accepted the above documents and policies and agree to abide by them throughout my association with {firm}. I understand that this acknowledgment forms part of my employment records.",
      ),
    ),

    spacer("lg"),
    term("Employee ID", f("employeeId", "Employee ID", { placeholder: "e.g. ALT-0042" })),
    term("Designation", f("designation", "Designation", { placeholder: "e.g. Business Development Manager" })),
    term("Department", f("department", "Department", { placeholder: "Select a department", optionsKey: "departments" })),

    ...personSignOff({ prefix: "employee", who: "Signed by the employee" }),

    spacer("lg"),
    signature({
      forEntity: true,
      esign: false,
      name: [t("HR Team")],
      designation: [t("Human Resources")],
    }),
  ],
};

export default template;
