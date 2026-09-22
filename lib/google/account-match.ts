/**
 * IS THIS GOOGLE ACCOUNT THE EMPLOYEE'S ALTUS ACCOUNT?
 *
 * DCC and tasks must land in the employee's Altus calendar (account holder,
 * 2026-09-15), so the OAuth callback refuses a Google account whose address is
 * not one of theirs on file. Gmail ignores dots and anything after a "+" in the
 * local part, and googlemail.com is gmail.com — compared the way Google does.
 *
 * Pure, so the rule is tested without a Google round trip.
 */

export function normalizeGoogleEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.split("+")[0]!.replace(/\./gu, "");
  return `${local}@${domain}`;
}

export function isSameGoogleAccount(
  googleEmail: string | null | undefined,
  employeeEmails: ReadonlyArray<string | null | undefined>,
): boolean {
  const g = normalizeGoogleEmail(googleEmail);
  if (!g) return false;
  return employeeEmails.some((e) => normalizeGoogleEmail(e) === g);
}
