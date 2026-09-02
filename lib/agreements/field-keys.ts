/**
 * The editable fill-in fields persisted in agreements.field_values. Keys map 1:1
 * to AgreementInput (lib/agreements/templates.ts), excluding the three columns
 * stored on their own (type, entity, employeeName). The sign agent + PDF route
 * MUST rely on exactly these keys.
 *
 * Lives in a plain module (NOT the "use server" actions file) because a
 * "use server" file may only export async functions — a value export like this
 * one breaks the production build's page-data collection.
 */
export const FIELD_VALUE_KEYS = [
  "designation",
  "department",
  "letterDate",
  "place",
  "joiningDate",
  "ctcAmount",
  "ctcBreakup",
  "probationMonths",
  "reportingTo",
  "workLocation",
  "noticePeriod",
  "confidentialityYears",
  "extraClauses",
] as const;
