/**
 * Index-hub delete rights (2026-08-17).
 *
 * Every admin may ADD, RENAME and REORDER the Index sections and their buttons,
 * but DELETING one is Manan Vasa's call alone — a stray click on a section bin
 * takes every link inside it with it, and there is no undo. Deliberately NOT the
 * `SUPER_ADMIN_EMAILS` list: this is a narrower, one-person gate.
 *
 * Single source of truth: the server actions enforce it and the board hides the
 * bin icons for everyone else.
 */
export const INDEX_HUB_DELETE_EMAILS = ["manan@unleashed.in"] as const;

export function canDeleteIndexHub(email: string | null | undefined): boolean {
  if (!email) return false;
  return INDEX_HUB_DELETE_EMAILS.includes(
    email.trim().toLowerCase() as (typeof INDEX_HUB_DELETE_EMAILS)[number],
  );
}
