/**
 * Gender-aware pronoun + salutation engine for HR letters.
 *
 * A candidate's gender is captured once on the intake form
 * (data["personal.gender"]) and, from then on, letters resolve their gendered
 * words automatically — his/her, him/her, he/she, Mr./Ms., Sir/Madam — so HR
 * never hand-edits them per letter.
 *
 * Templates express the gendered word as a TOKEN in their prose, e.g.
 *   t("Dear {title} "), f("candidateName", …)
 *   t("We were impressed by {his} performance and look forward to {him} joining.")
 * and every renderer (on-screen, the "Edit freely" seed, pdfkit, Chromium) runs
 * the resolved text through applyPronouns(text, gender).
 *
 * PURE — no imports, client- and server-safe. Load-neutral.
 *
 * Tokens (case matters — capitalise the token to capitalise the word):
 *   {title}   → Mr.        / Ms.        / Mr./Ms.
 *   {he}      → he         / she        / they
 *   {him}     → him        / her        / them
 *   {his}     → his        / her        / their      (possessive adjective)
 *   {hisOwn}  → his        / hers       / theirs      (possessive pronoun)
 *   {himself} → himself    / herself    / themselves
 *   {sir}     → Sir        / Madam      / Sir/Madam
 */

export type Gender = "male" | "female" | "neutral";

/** Map any stored/loose gender string to the canonical Gender. Unknown / empty /
 *  "prefer not to say" → neutral (renders the inclusive "Mr./Ms." forms). */
export function normalizeGender(raw?: string | null): Gender {
  const g = (raw ?? "").trim().toLowerCase();
  if (g === "male" || g === "m" || g === "man") return "male";
  if (g === "female" || g === "f" || g === "woman") return "female";
  return "neutral";
}

/** The full lowercase word set for a gender (capitalised variants derived). */
export interface PronounSet {
  title: string; // Mr. / Ms.
  he: string; // subject
  him: string; // object
  his: string; // possessive adjective
  hisOwn: string; // possessive pronoun
  himself: string; // reflexive
  sir: string; // formal address
}

const SETS: Record<Gender, PronounSet> = {
  male: { title: "Mr.", he: "he", him: "him", his: "his", hisOwn: "his", himself: "himself", sir: "Sir" },
  female: { title: "Ms.", he: "she", him: "her", his: "her", hisOwn: "hers", himself: "herself", sir: "Madam" },
  neutral: {
    title: "Mr./Ms.",
    he: "they",
    him: "them",
    his: "their",
    hisOwn: "theirs",
    himself: "themselves",
    sir: "Sir/Madam",
  },
};

/** The pronoun set for a gender. */
export function pronouns(gender: Gender): PronounSet {
  return SETS[gender];
}

/** Capitalise the first letter (leaves "Mr./Ms." → "Mr./Ms."). */
function cap(s: string): string {
  const first = s[0];
  return first ? first.toUpperCase() + s.slice(1) : s;
}

/**
 * Replace pronoun/salutation tokens in `text` with the words for `gender`.
 * A capitalised token (e.g. {He}, {His}, {Title}) yields a capitalised word.
 * Unknown tokens are left untouched.
 */
export function applyPronouns(text: string, gender: Gender): string {
  if (!text || text.indexOf("{") === -1) return text;
  const set = SETS[gender];
  return text.replace(/\{([A-Za-z]+)\}/g, (whole, token: string) => {
    const key = token.toLowerCase() as keyof PronounSet;
    const word = set[key];
    if (word == null) return whole; // not a pronoun token — leave as-is
    // Capitalise if the token's first letter was uppercase.
    const first = token[0];
    return first && first === first.toUpperCase() ? cap(word) : word;
  });
}
