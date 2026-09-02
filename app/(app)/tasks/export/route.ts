import { requireAdmin } from "@/lib/auth/current";
import { parseTaskFilters } from "@/lib/task-filters";
import { listTasksForExport } from "@/lib/queries/tasks";
import {
  csvResponse,
  exportFilename,
  MAX_EXPORT_ROWS,
} from "@/lib/exports/csv";

/**
 * GET /tasks/export
 *
 * Streams the current /tasks (or /archived) view as a CSV download using
 * the unified `csvResponse` helper from `lib/exports/csv`. Query params
 * mirror `parseTaskFilters` exactly — start, end, status, emp, initiator,
 * dept, prio, subj, id — plus an `archived=1` flag for the /archived view.
 *
 * Auth + scoping: any signed-in employee can hit this endpoint. Non-admins
 * are scoped to "assigned to me" by default via `parseTaskFilters`'s
 * `defaultDoerId` option — the same rule the page applies — so a non-admin
 * exporter only ever sees their own filtered task list.
 *
 * Hard cap: reads up to `MAX_EXPORT_ROWS + 1` so `csvResponse` can detect
 * overrun and return 422 `EXPORT_TOO_LARGE` without buffering megabytes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_HEADERS = [
  "short_id",
  "title",
  "subject",
  "status",
  "priority",
  "doer",
  "initiator",
  "department",
  "due_at",
  "created_at",
  "updated_at",
];

const iso = (d: Date | null | undefined): string =>
  d ? d.toISOString() : "";

export async function GET(request: Request): Promise<Response> {
  // Admin-only — UI hides the CSV button for non-admins; this guard
  // prevents direct-URL access. requireAdmin throws if not admin →
  // we re-respond as a clean 403 (matches the XLSX + PDF route shape).
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const archived = sp.archived === "1" || sp.archived === "true";
  const filters = parseTaskFilters(sp, archived, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  // Read one above the cap so csvResponse can detect overrun and return 422.
  const rows = await listTasksForExport(filters, {
    limit: MAX_EXPORT_ROWS + 1,
  });

  return csvResponse({
    filename: exportFilename("tasks"),
    headers: EXPORT_HEADERS,
    rows: rows.map((t) => [
      t.shortId ?? t.id,
      t.title,
      t.subject ?? "",
      t.status,
      t.priority,
      t.doerName ?? "",
      t.initiatorName ?? "",
      t.department ?? "",
      iso(t.dueAt),
      iso(t.createdAt),
      iso(t.updatedAt),
    ]),
  });
}
