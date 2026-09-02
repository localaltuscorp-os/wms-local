// Manual on-demand backup: dumps every table into the Altus Backup Google Sheet
// (one tab per table). Run it yourself from your own terminal — it uses your
// .env.local credentials and writes to your Google Sheet:
//
//   pnpm tsx --env-file=.env.local scripts/backup-to-google.ts
//
// The nightly automated version (cron + admin "Back up now" button) runs the
// same lib/backup code server-side on Vercel. Set BACKUP_SHEET_ID to override
// the target sheet.
import { runFullBackup } from "@/lib/backup/run";

async function main() {
  console.log("Backing up: database → Google Sheet, Storage files → Shared Drive …");
  const t0 = Date.now();
  const { sheet, files } = await runFullBackup();
  console.log(
    `✓ Backup complete in ${Math.round((Date.now() - t0) / 1000)}s\n` +
      `  Sheet: ${sheet.tables} tables, ${sheet.rows} rows\n` +
      `  Drive: ${files.uploaded} files uploaded, ${files.skipped} already present (${files.total} total)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
