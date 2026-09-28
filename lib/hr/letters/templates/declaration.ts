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

import { type LetterTemplate, t, f, para, heading, bullets, spacer, signature } from "../types";
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
 * NOT here, deliberately:
 *   - "Acceptance Letter" - unregistered (lib/hr/letters/registry.ts) because it
 *     duplicated the Selection Letter. Nobody can truthfully declare they read a
 *     document the firm never issued.
 *   - The formal title of the Free Training Letter ("Pre-Employment Training &
 *     Evaluation") - one word away from the policy of nearly the same name, so
 *     the list would read as though it named the same thing twice.
 */
const JOINING_DOCUMENTS = [
  "the Candidate Interview Form I completed",
  "the Free Training Letter",
  "the Assignment Needed Letter",
  "the Selection Letter (offer letter) issued to me",
] as const;

const template: LetterTemplate = {
  key: "declaration",
  title: "Declaration Letter",
  category: "appointment",
  entityDefault: "altus-corp",
  // "acknowledge": the employee signs it, and nothing is e-signed on issue -
  // matching how the other joiner-signed letters in this category behave.
  signature: "acknowledge",
  blurb: "The employee's own declaration - information given is true, they are free to join, and they will keep the firm's information confidential.",
  blocks: [
    heading("Declaration by the Employee", 1),

    para(t("I, "), f("employeeName", "Employee Name", { placeholder: "Full name" }), t(", holding the position of "), f("designation", "Designation", { placeholder: "Designation" }), t(" at {firm}, with effect from "), f("dateOfJoining", "Date of Joining", { date: true }), t(", declare as follows:")),

    spacer("md"),

    heading("1. Information and documents", 2),
    bullets(
      [t("All information I have provided to the firm - in my interview form, my onboarding form and in person - is true and complete to the best of my knowledge.")],
      [t("Every document and certificate I have submitted is genuine and relates to me.")],
      [t("I understand that any information found to be false or withheld may lead to withdrawal of my appointment or termination of my employment, at any stage.")],
    ),

    heading("2. Freedom to take this employment", 2),
    bullets(
      [t("I am not under any subsisting contract, bond, non-compete or other obligation to a previous employer that prevents or restricts me from taking up this employment.")],
      [t("I have no pending criminal proceedings against me that I have not disclosed to the firm.")],
    ),

    heading("3. Confidentiality", 2),
    para(
      t(
        "I understand that in the course of my employment I will have access to the firm's confidential information - customer data, business processes, pricing, software, intellectual property and internal records. I will not disclose, copy or use any of it for any purpose other than my work for the firm, either during my employment or after it ends.",
      ),
    ),

    heading("4. Documents and policies I have read", 2),
    para(
      t(
        "I confirm that I have been given, have fully read and have understood each of the following, and that I hereby agree to abide by them:",
      ),
    ),
    heading("The documents issued to me", 3),
    bullets(...JOINING_DOCUMENTS.map((d) => [t(d)])),
    heading("The firm's policies", 3),
    // Derived from the registry - see this file's header.
    bullets(...readyPolicies().map((p) => [t(p.title)])),
    para(
      t(
        "Where any of these is revised, I understand the revised version applies to me from the date the firm publishes it, and that I am responsible for reading it.",
      ),
    ),

    heading("5. Conduct", 2),
    para(
      t(
        "I will comply with the firm's policies and with the lawful instructions of my reporting manager. I will keep my personal details, contact number and address current in the firm's records.",
      ),
    ),

    spacer("lg"),
    para(t("Place: "), f("place", "Place", { placeholder: "City" })),
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
