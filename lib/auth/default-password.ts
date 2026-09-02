import crypto from "node:crypto";

/**
 * Per-invite password generation. Replaces the old shared default ("Wms@123")
 * — every invite (and every resend) now mints its OWN strong, random password,
 * so a known/guessable default credential can't be used to pre-empt a freshly
 * invited account.
 *
 * 14 chars, drawn with `crypto.randomInt` from an UNAMBIGUOUS alphabet (no
 * 0/O/1/l/I) since the password is emailed and typed by hand. Guaranteed to
 * contain an upper, lower, digit and symbol so it satisfies Firebase Auth and
 * the strength meter. The invite action sets it on the Firebase user and the
 * credentials email displays it — both read the SAME generated value per call.
 */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "@#$%&*!?";
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

function pick(set: string): string {
  return set[crypto.randomInt(set.length)]!;
}

export function generateInvitePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < 14) chars.push(pick(ALL));
  // Fisher–Yates shuffle (crypto-random) so the guaranteed chars aren't fixed.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
