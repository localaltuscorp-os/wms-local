/**
 * Naming and redaction rules for the module backup — pure, so a test can import
 * them. (The files that use them are `server-only`, which vitest cannot load.)
 */

/**
 * COLUMNS THAT NEVER LEAVE THE BUILDING, whatever a module declares.
 *
 * Every match is a live credential: the encrypted portal passwords in the
 * Accounts vault and the vendor list, Google refresh tokens, and the hashes
 * standing in for a signature link, a device, a delegated session or a sign-in
 * code. An export is a file that gets emailed around; none of this travels
 * with it.
 *
 * Matched on the column NAME, so a table added next year with a column called
 * `password_enc` is covered without anybody remembering this file exists.
 */
const NEVER_EXPORT = [
  /password/i,
  /token/i,
  /secret/i,
  /public_key/i,
  /credential/i,
  /_enc$/i,
];

export function isSecretColumn(name: string): boolean {
  return NEVER_EXPORT.some((re) => re.test(name));
}

/** Excel refuses a sheet name over 31 characters, or containing : \ / ? * [ ] */
export function safeSheetName(name: string, taken: Set<string>): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  if (!taken.has(cleaned)) {
    taken.add(cleaned);
    return cleaned;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** File names inside one folder must be unique, whatever the rows called them. */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "file";
  if (!taken.has(clean)) {
    taken.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/**
 * The dated folder inside a module's folder: "2026-09-21 03-05".
 *
 * IST, not UTC: the run starts at 03:05 IST, which is the previous day in UTC,
 * and a folder named with yesterday's date for tonight's save would be read
 * wrong by everyone who opens it.
 */
export function folderNameFor(until: Date): string {
  const ist = new Date(until.getTime() + (5 * 60 + 30) * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}-${p(ist.getUTCMinutes())}`;
}
