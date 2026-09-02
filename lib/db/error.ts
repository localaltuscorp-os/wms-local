/**
 * READABLE DATABASE ERRORS.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * drizzle-orm wraps every failed statement in a `DrizzleQueryError` whose
 * `.message` is only ever this, and never anything else:
 *
 *     Failed query: <the sql>
 *     params: <the parameters>
 *
 * The reason the statement failed — Postgres' SQLSTATE and its own sentence
 * about what went wrong — is hung on `.cause`, which the near-universal
 * `err instanceof Error ? err.message : String(err)` never reads. The operator
 * is handed a message naming the TABLE and withholding the PROBLEM.
 *
 * That is not hypothetical. On 2026-08-30 the attendance airstrike failed with
 *
 *     DB: Failed query: delete from "attendance_week_ack" params:
 *
 * and the one sentence that would have diagnosed it in a second — `relation
 * "attendance_week_ack" does not exist`, i.e. a migration that never reached
 * this database — was thrown away before it reached the screen or the logs.
 *
 * ── WHAT IT PRODUCES ────────────────────────────────────────────────────────
 * The cause FIRST, because that is the part somebody can act on, with the
 * failing statement kept after it for context:
 *
 *     relation "attendance_week_ack" does not exist [42P01] · while running:
 *     delete from "attendance_week_ack"
 *
 * ── WHAT IT DELIBERATELY OMITS ──────────────────────────────────────────────
 * The bound PARAMETERS. They routinely carry salaries, phone numbers and names,
 * and this string is written to logs and shown in a toast. The statement text
 * alone identifies the failure; the values are not needed to fix it.
 */

/** How far to follow `.cause`. Deep enough for driver→drizzle→app, bounded so
 *  a malformed chain cannot stall the request that was only reporting it. */
const MAX_CAUSE_DEPTH = 10;

/** drizzle's own message shape — recognisable, and never worth showing alone. */
const DRIZZLE_BOILERPLATE = /^Failed query:/;

/**
 * postgres.js copies Postgres' error-response fields onto the thrown error
 * verbatim, which means the wire protocol's snake_case (`table_name`, not
 * `tableName`). Typed loosely: this runs inside a `catch`, where assuming a
 * shape is how the reporting path becomes the second bug.
 */
type PostgresErrorFields = {
  code?: unknown;
  detail?: unknown;
  hint?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Walk to the deepest `cause` — the driver's error, under whatever wrapped it.
 * Cycle-guarded and depth-capped: an error whose cause points back at itself
 * must not hang the handler trying to describe it.
 */
function rootCause(err: unknown): unknown {
  const seen = new Set<unknown>([err]);
  let current: unknown = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!(current instanceof Error)) break;
    const next: unknown = current.cause;
    if (next == null || seen.has(next)) break;
    seen.add(next);
    current = next;
  }

  return current;
}

/** The SQL drizzle recorded on the wrapper, when it was drizzle that threw. */
function failingStatement(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  const query = text((err as { query?: unknown }).query);
  if (query) return query;

  // No `.query` property (an older drizzle, or a re-thrown copy): recover the
  // statement from the boilerplate message, which is the only other place it
  // appears.
  const message = err instanceof Error ? err.message : "";
  const match = /^Failed query:\s*([\s\S]*?)(?:\nparams:|$)/.exec(message);
  return text(match?.[1]);
}

/**
 * One line an operator can act on. Safe to show in a toast and to log.
 */
export function dbErrorMessage(err: unknown): string {
  const root = rootCause(err);
  const fields: PostgresErrorFields =
    typeof root === "object" && root !== null ? (root as PostgresErrorFields) : {};

  let reason = root instanceof Error ? text(root.message) : text(String(root ?? ""));
  // Boilerplate is not a reason. If that is all we were given, say so plainly
  // rather than echoing drizzle's wrapper back at the reader.
  if (!reason || DRIZZLE_BOILERPLATE.test(reason)) reason = "";

  const parts: string[] = [];

  const code = text(fields.code);
  parts.push(reason ? (code ? `${reason} [${code}]` : reason) : "Database error");

  const detail = text(fields.detail);
  if (detail) parts.push(detail);

  const hint = text(fields.hint);
  if (hint) parts.push(hint);

  const statement = failingStatement(err);
  if (statement) parts.push(`while running: ${statement.replace(/\s+/g, " ")}`);

  return parts.join(" · ");
}

/**
 * Put the full error in the server log, where a stack trace is useful and a
 * toast is not. Call it alongside returning `dbErrorMessage` to the client:
 * production incidents get diagnosed from logs, not from screenshots.
 */
export function logDbError(scope: string, err: unknown): void {
  const root = rootCause(err);
  console.error(`[${scope}] ${dbErrorMessage(err)}`, {
    // Named separately so log search can pivot on the SQLSTATE alone.
    code: typeof root === "object" && root !== null ? (root as PostgresErrorFields).code : undefined,
    statement: failingStatement(err),
    stack: root instanceof Error ? root.stack : undefined,
  });
}
