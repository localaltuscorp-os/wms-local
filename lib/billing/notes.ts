/**
 * THE NOTE BLOCK ON A BILLING DOCUMENT.
 *
 * A document's remarks are stored as ONE text with one note per line — the
 * create form's "Add field" button appends a box, and the boxes are joined with
 * newlines on save (see document-form.tsx). That storage is deliberate: the
 * document, its PDF and its email all take a single string and nothing had to
 * learn about a list.
 *
 * What it did not carry was the NUMBERING. Two notes printed as one "Note :"
 * label followed by two lines, which reads as one note that happens to wrap —
 * so a second note could be missed entirely, and there was no way to refer to
 * "the third note" on a document that plainly has three.
 *
 * So one note stays "Note :", exactly as the reference template has it, and two
 * or more become "Note 1 :", "Note 2 :", … . The rule lives here rather than in
 * each renderer because the screen, the PDF and the email must agree: a note
 * numbered differently in the email from the attachment is worse than no
 * numbering at all.
 *
 * PURE — no DB, no server-only imports, no pdfkit. The invoice view (client),
 * the email builder (server) and the PDF writer all import it.
 */

export interface DocumentNote {
  /** "Note" for a lone note, "Note 1" / "Note 2" / … when there are several. */
  label: string;
  /** The note itself, trimmed. Never empty. */
  text: string;
}

/**
 * Split a document's stored remarks into its numbered notes.
 *
 * Blank lines are dropped rather than numbered — a stray newline is not a note,
 * and numbering one would push every note after it up by one.
 */
export function documentNotes(remarks: string | null | undefined): DocumentNote[] {
  const parts = (remarks ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  if (parts.length === 1) return [{ label: "Note", text: parts[0]! }];
  return parts.map((text, i) => ({ label: `Note ${i + 1}`, text }));
}
