import { DUMMY_MODE } from "@/lib/db/dummy-dir";

/**
 * True only for the disposable Sales Demo deployment. `DUMMY_MODE` remains
 * development-only and uses PGlite; a hosted demo uses this flag with its own
 * isolated fixture-data DATABASE_URL. Use only for a public demo deployment,
 * never an employee-production deployment.
 */
export const SALES_DEMO_MODE = process.env.SALES_DEMO_MODE === "true";

/** The one place auth guards consult to decide whether a persona is selected. */
export const DEMO_MODE = DUMMY_MODE || SALES_DEMO_MODE;
