/**
 * Official company email derivation — the single source of truth for turning a
 * new joiner's name into their company address. Altus convention (matches every
 * existing employee's login): `{namesurname}.altuscorp@gmail.com` — the name
 * words concatenated (no dot), then a fixed `.altuscorp` local suffix, on gmail.
 * e.g. "Atul Asthana" → `atulasthana.altuscorp@gmail.com`.
 *
 * PURE + CLIENT-SAFE (no db / server imports) so the HR control panel can PREVIEW
 * the address before provisioning, and the server provisioning action can derive
 * the exact same value.
 *
 * Rules:
 *   - lowercase, diacritics stripped, spaces/punctuation removed.
 *   - all name words concatenated (no separator), then ".altuscorp".
 *   - empty / unnamed    → "employee" (never emits a broken address).
 *   - collisions         → append the smallest integer suffix that is free to
 *                          the NAME part (before ".altuscorp"), given the set of
 *                          already-taken local parts / emails.
 */

/** The company email domain. */
export const COMPANY_EMAIL_DOMAIN = "gmail.com";
/** Fixed local-part suffix that precedes the "@": `{name}.altuscorp@...`. */
export const COMPANY_EMAIL_LOCAL_SUFFIX = "altuscorp";

/** Strip diacritics and keep only [a-z0-9], lower-cased. */
function slug(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Concatenated name slug (all words joined, no separators): "Atul Asthana" → "atulasthana". */
export function nameSlug(name: string): string {
  const parts = (name || "").trim().split(/\s+/).map(slug).filter(Boolean);
  if (parts.length === 0) return "employee";
  return parts.join("");
}

/** The full local part (before the @): `{namesurname}.altuscorp`. */
export function officialLocalPart(name: string): string {
  return `${nameSlug(name)}.${COMPANY_EMAIL_LOCAL_SUFFIX}`;
}

/** Normalise a collision set to a set of lower-cased LOCAL parts (accepts full
 *  emails too — anything after "@" is dropped). */
function takenLocalParts(taken?: Iterable<string>): Set<string> {
  const out = new Set<string>();
  if (!taken) return out;
  for (const raw of taken) {
    if (!raw) continue;
    const local = raw.toString().trim().toLowerCase().split("@")[0];
    if (local) out.add(local);
  }
  return out;
}

/**
 * Derive `{namesurname}.altuscorp@gmail.com` for a name. When `taken` is supplied
 * (existing official emails / local parts), a numeric suffix is appended to the
 * NAME part until unique — e.g. `atulasthana.altuscorp`, then
 * `atulasthana2.altuscorp`, `atulasthana3.altuscorp`.
 */
export function deriveOfficialEmail(
  name: string,
  taken?: Iterable<string>,
): string {
  const base = nameSlug(name);
  const used = takenLocalParts(taken);
  const localOf = (n: string) => `${n}.${COMPANY_EMAIL_LOCAL_SUFFIX}`;

  let namePart = base;
  if (used.has(localOf(base))) {
    let n = 2;
    while (used.has(localOf(`${base}${n}`))) n += 1;
    namePart = `${base}${n}`;
  }
  return `${localOf(namePart)}@${COMPANY_EMAIL_DOMAIN}`;
}

export default deriveOfficialEmail;
