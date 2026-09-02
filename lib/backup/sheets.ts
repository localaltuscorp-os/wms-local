import { GOOGLE_SCOPES, getServiceAccountToken } from "@/lib/google/service-account";
import { dumpTable, listBackupTables } from "./export";

/**
 * Writes every table into the backup Google Sheet — one tab per table, cleared
 * and rewritten each run. BATCHED to stay under Sheets' 60-writes/min quota:
 * one structural batchUpdate adds all missing tabs, one values:batchClear wipes
 * them, and the data goes out in a few values:batchUpdate calls (chunked by
 * cell count to respect the request-size limit). 429s back off and retry.
 */
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_CELL = 49_000; // Sheets allows 50k chars/cell — stay just under
const MAX_CELLS_PER_BATCH = 150_000; // keep each batchUpdate well under 10MB

interface SheetMeta {
  sheets?: { properties: { title: string } }[];
}
interface ValueRange {
  range: string;
  values: string[][];
}

function quoteTab(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retriable = /\b429\b|RESOURCE_EXHAUSTED|rate limit|\b503\b/i.test(msg);
      if (i < attempts - 1 && retriable) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30_000);
        continue;
      }
      throw err;
    }
  }
}

async function sheetsApi<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SHEETS}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Sheets ${init?.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function backupDatabaseToSheet(
  spreadsheetId: string,
): Promise<{ tables: number; rows: number }> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);

  const meta = await withRetry(() =>
    sheetsApi<SheetMeta>(token, `${spreadsheetId}?fields=sheets.properties(title)`),
  );
  const existing = new Set((meta.sheets ?? []).map((s) => s.properties.title));

  const tables = await listBackupTables();
  const titles = tables.map((t) => t.slice(0, 95)); // Sheets tab-title cap is 100

  // 1 write: add every missing tab in a single structural batchUpdate.
  const toAdd = titles.filter((t) => !existing.has(t));
  if (toAdd.length > 0) {
    await withRetry(() =>
      sheetsApi(token, `${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: toAdd.map((title) => ({ addSheet: { properties: { title } } })),
        }),
      }),
    );
  }

  // 1 write: clear all tabs at once (so a shrunk table leaves no stale rows).
  await withRetry(() =>
    sheetsApi(token, `${spreadsheetId}/values:batchClear`, {
      method: "POST",
      body: JSON.stringify({ ranges: titles.map(quoteTab) }),
    }),
  );

  // Dump every table, accumulate value ranges, flush in cell-bounded batches.
  let totalRows = 0;
  let batch: ValueRange[] = [];
  let pendingCells = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const data = batch;
    batch = [];
    pendingCells = 0;
    await withRetry(() =>
      sheetsApi(token, `${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      }),
    );
  };

  for (let i = 0; i < tables.length; i++) {
    const dump = await dumpTable(tables[i]!);
    totalRows += dump.rowCount;
    const matrix = [dump.headers, ...dump.rows].map((row) =>
      row.map((c) => (c.length > MAX_CELL ? c.slice(0, MAX_CELL) + "…[truncated]" : c)),
    );
    const cells = matrix.reduce((n, r) => n + r.length, 0);
    if (pendingCells > 0 && pendingCells + cells > MAX_CELLS_PER_BATCH) {
      await flush();
    }
    batch.push({ range: `${quoteTab(titles[i]!)}!A1`, values: matrix });
    pendingCells += cells;
  }
  await flush();

  return { tables: tables.length, rows: totalRows };
}
