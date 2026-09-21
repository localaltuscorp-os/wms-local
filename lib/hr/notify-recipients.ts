import "server-only";
import { hrDeskEmail } from "@/lib/hr/firm";

/**
 * WHO IS TOLD WHAT — the named recipients of HR's automatic notifications, in
 * one place so a change of person is a one-line edit rather than a hunt.
 *
 * The HR desk address comes from `hrDeskEmail()` (HR_DESK_EMAIL, falling back to
 * hr.altuscorp@gmail.com) so a staging deploy can point it elsewhere.
 */

export const RUTVISHA_EMAIL = "rutvishamehta.altuscorp@gmail.com";
export const MANAN_EMAIL = "manan@unleashed.in";

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = e.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A candidate submits their Candidate Form for the FIRST time. */
export function candidateFormSubmittedRecipients(): string[] {
  return unique([RUTVISHA_EMAIL, hrDeskEmail(), MANAN_EMAIL]);
}

/** A candidate edits (re-submits) a form they had already submitted. */
export function candidateFormEditedRecipients(): string[] {
  return unique([hrDeskEmail()]);
}

/** Someone has signed every policy they were asked to sign. */
export function policiesSignedRecipients(): string[] {
  return unique([hrDeskEmail(), MANAN_EMAIL]);
}
