/**
 * Generate a strong random password for admin-driven resets. Guarantees at
 * least one char from each class (lower/upper/digit/symbol) so it satisfies
 * any reasonable policy, then fills the remainder and shuffles.
 *
 * Uses Web Crypto (`crypto.getRandomValues`), available in both the browser
 * (admin dialog) and the Node server runtime — so this module is isomorphic.
 */
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*-_";
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(set: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return set[buf[0]! % set.length]!;
}

export function generatePassword(length = 16): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest: string[] = [];
  for (let i = required.length; i < length; i++) rest.push(pick(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle with crypto randomness so the required chars aren't
  // always in the first four positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
