/**
 * THE LOG EVENT VOCABULARY.
 *
 * One name per kind of activity, used by both the server audit logger
 * (`lib/logs/audit.ts`) and the client activity tracker. Adding an event type
 * here makes it appear in the Logs filter dropdown; a type not listed here is
 * rejected by the ingest route, so a typo at a call site is a compile error or
 * a 400 rather than a silent empty log.
 *
 * PURE — no `server-only`, no DB, so the client tracker can import it.
 */

export const LOG_EVENT_TYPES = [
  // Session lifecycle.
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "SESSION_EXPIRED",
  "INACTIVITY_TIMEOUT",
  "FORCED_LOGOUT",
  "NOT_RECORDED",
  // Navigation / browsing (client tracker, low-risk, batched).
  "MODULE_VISIT",
  "PAGE_VISIT",
  "VIEW_RECORD",
  "SEARCH",
  "FILTER_APPLIED",
  // Data mutation (server-authoritative).
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "PUBLISH",
  "REVERSE",
  "UPLOAD",
  "IMPORT",
  "PAYMENT",
  // Data egress.
  "EXPORT",
  "DOWNLOAD",
  // Security / configuration.
  "ACCESS_DENIED",
  "CONFIG_CHANGE",
  "SYSTEM",
] as const;

export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

export function isLogEventType(v: string): v is LogEventType {
  return (LOG_EVENT_TYPES as readonly string[]).includes(v);
}

/** Human label for the filter dropdown and the detail panel. */
export const LOG_EVENT_LABELS: Record<LogEventType, string> = {
  LOGIN: "Login",
  LOGIN_FAILED: "Failed login",
  LOGOUT: "Logout",
  SESSION_EXPIRED: "Session expired",
  INACTIVITY_TIMEOUT: "Inactivity timeout",
  FORCED_LOGOUT: "Forced logout",
  NOT_RECORDED: "End of day (no logout)",
  MODULE_VISIT: "Module visit",
  PAGE_VISIT: "Page visit",
  VIEW_RECORD: "Record view",
  SEARCH: "Search",
  FILTER_APPLIED: "Filter applied",
  CREATE: "Create",
  UPDATE: "Update",
  DELETE: "Delete",
  ARCHIVE: "Archive",
  RESTORE: "Restore",
  SUBMIT: "Submit",
  APPROVE: "Approve",
  REJECT: "Reject",
  PUBLISH: "Publish",
  REVERSE: "Reverse",
  UPLOAD: "Upload",
  IMPORT: "Import",
  PAYMENT: "Payment",
  EXPORT: "Export",
  DOWNLOAD: "Download",
  ACCESS_DENIED: "Access denied",
  CONFIG_CHANGE: "Configuration change",
  SYSTEM: "System",
};

/** Event types that count as an ACTION on the daily-session rollup. */
const ACTION_EVENTS = new Set<LogEventType>([
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "RESTORE",
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "PUBLISH",
  "REVERSE",
  "UPLOAD",
  "IMPORT",
  "PAYMENT",
  "EXPORT",
  "DOWNLOAD",
  "CONFIG_CHANGE",
  "ACCESS_DENIED",
]);

/** Is this event an action (as opposed to a passive visit/view/search)? */
export function isActionEvent(type: string): boolean {
  return ACTION_EVENTS.has(type as LogEventType);
}

/** Is this event a record view (counts records_viewed on the session)? */
export function isRecordView(type: string): boolean {
  return type === "VIEW_RECORD";
}

/** Is this event a page visit (counts pages_visited)? */
export function isPageVisit(type: string): boolean {
  return type === "PAGE_VISIT";
}

/** Is this event a module visit (counts modules_visited)? */
export function isModuleVisit(type: string): boolean {
  return type === "MODULE_VISIT";
}
