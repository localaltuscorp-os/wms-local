/**
 * READ-ONLY: inspect the migration source sheets. No DB, no writes.
 * Run: pnpm exec tsx scripts/inspect-sheets.ts
 */
import * as XLSX from "xlsx";

function inspect(path: string) {
  console.log(`\n========== ${path} ==========`);
  const wb = XLSX.readFile(path);
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false,
    }) as unknown[][];
    console.log(`\n  Sheet "${name}" — ${rows.length} rows`);
    // find the header row (first row with >2 non-null cells)
    const headerIdx = rows.findIndex(
      (r) => r.filter((c) => c != null && String(c).trim() !== "").length > 2,
    );
    if (headerIdx >= 0) {
      console.log(`    header(row ${headerIdx}): ${JSON.stringify(rows[headerIdx])}`);
      const sample = rows[headerIdx + 1];
      if (sample) console.log(`    sample:           ${JSON.stringify(sample)}`);
    }
  }
}

inspect("data/Work To Employee new.xlsx");
inspect("data/Work To Interns new.xlsx");
