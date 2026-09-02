import { getServiceAccountToken, GOOGLE_SCOPES } from "./service-account";

/**
 * Read one range of a Google Sheet as a raw matrix (rows of string cells), via
 * the Firebase service account — the same auth the nightly backup uses. The
 * sheet must be shared with FIREBASE_CLIENT_EMAIL (Viewer is enough).
 *
 * Returns [] when the range is empty. Trailing empty cells are NOT padded by
 * the API, so callers must index defensively (the salary mappers already do).
 */
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export async function readSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  return readWithScope(spreadsheetId, range, GOOGLE_SCOPES.sheets);
}

/**
 * Same read, but the access token is minted with the READ-ONLY Sheets scope —
 * least privilege for pure mirrors (e.g. the live salary-breakup sync) that
 * must never be able to write any sheet shared with the service account.
 */
export async function readSheetValuesReadonly(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  return readWithScope(spreadsheetId, range, GOOGLE_SCOPES.sheetsReadonly);
}

async function readWithScope(
  spreadsheetId: string,
  range: string,
  scope: string,
): Promise<string[][]> {
  const token = await getServiceAccountToken([scope]);
  const res = await fetch(
    `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    // Google error bodies contain status/reason only — never the token/key.
    throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}
