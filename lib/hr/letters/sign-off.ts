/**
 * THE PERSON'S SIGN-OFF — the last three lines of every letter somebody signs.
 *
 * ONE definition, used by every such template, because this is a rule about how
 * the firm takes a signature and not a per-letter design choice: a printed name
 * ALONE is not a signature, so each of these documents ends with
 *
 *   1. Print your name
 *   2. Date        (seeded with today, in the module's DD-MMM-YYYY form)
 *   3. Attach your signature
 *
 * in that order. Before this, each letter ended its own way - one had
 * "Employee name / Employee sign", another a four-row term table, the
 * undertaking four underscore rules - so what a signature consisted of depended
 * on which document you happened to be holding.
 *
 * ── WHY THE SIGNATURE IS AN ATTACHED IMAGE ───────────────────────────────
 * A typed name proves only that somebody could type. The signature image is the
 * mark the person actually makes, and it is what the candidate policy flow
 * already collects and stores (see lib/hr/candidate/policy-signing.ts). These
 * letters state the same requirement on the page so the document and the system
 * ask for the same thing.
 *
 * PURE + CLIENT-SAFE, like every other letter module.
 */

import { type Block, t, f, para, heading, spacer } from "./types";

/**
 * The three-line tail.
 *
 * `prefix` namespaces the field ids so one letter can carry more than one
 * sign-off - the minor-intern undertaking is signed by the intern AND their
 * guardian, and two sign-offs sharing field ids would have each typing into the
 * other's box.
 *
 * `who` titles the block ("Signed by the employee" / "…the intern"), because on
 * a document with several sign-offs "Print your name" three times says nothing
 * about whose name goes where.
 */
export function personSignOff(opts: { prefix: string; who: string }): Block[] {
  const { prefix, who } = opts;
  return [
    spacer("lg"),
    heading(who, 2),
    para(
      t("Print your name: "),
      f(`${prefix}PrintName`, "Print your name", { placeholder: "Full name" }),
    ),
    para(
      t("Date: "),
      f(`${prefix}SignDate`, "Date", { date: true, todayDefault: true }),
    ),
    para(t("Attach your signature: ")),
    // The blank the signature image occupies. A spacer rather than a rule of
    // underscores: the letter is also exported as a PDF and printed, and an
    // underscore rule and a pasted image fight for the same line.
    spacer("lg"),
  ];
}
