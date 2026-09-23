/**
 * THE WEEKLY GOALS BULK-IMPORT COLUMNS — one manifest, two readers.
 *
 * The built-in template (lib/templates/weekly-goals.ts) writes these headers,
 * and app/(app)/weekly-goals/actions.ts recognises them in `mapHeader`. Keeping
 * them in one list is what stops the "template downloads one schema, the
 * importer expects another" failure: change a header here and both move.
 *
 * PURE. No `server-only`, no DB — the upload dialog imports it to show the
 * column helper next to the dropzone.
 */

export interface WeeklyGoalsColumn {
  /** The header cell on the entry grid, matched (fuzzily) by the importer. */
  header: string;
  /** A filled-in cell for the worked example sheet. */
  example: string;
  /** One line for the "How to use" sheet and the dialog's helper. */
  help: string;
}

export const WEEKLY_GOALS_COLUMNS: readonly WeeklyGoalsColumn[] = [
  { header: "Client", example: "Acme Corp", help: "Client the goal belongs to" },
  { header: "Subject", example: "Onboarding", help: "Short subject / workstream" },
  { header: "Priority", example: "Important", help: "Critical / Important / Urgent / Normal" },
  { header: "Target Date", example: "2026-06-20", help: "YYYY-MM-DD or DD-MMM-YYYY" },
  { header: "Incentive", example: "Yes", help: "Yes / No — is this goal incentivised" },
  { header: "KPI", example: "Yes", help: "Yes / No — is this a KPI" },
  {
    header: "Target",
    example: "Ship v2 portal & train the client team",
    help: "The goal itself (required)",
  },
  { header: "% Done", example: "0", help: "0–100. Blank = the goal's own Actuals decide" },
  { header: "Explanation", example: "", help: "Why this matters / how it will be done" },
  { header: "Notes", example: "Kickoff is Monday", help: "Planning notes" },
  { header: "Link", example: "https://docs.example.com/plan", help: "Proof / reference URL" },
  {
    header: "Employee",
    example: "ananya@altuscorp.com",
    help: "Name or email. Admins only — lets one file fan out across people",
  },
];
