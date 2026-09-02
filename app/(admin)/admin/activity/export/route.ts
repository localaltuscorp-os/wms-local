import { listAllActivity } from "@/lib/queries/activity";
import { parseActivityFilters } from "@/lib/transforms/activity";
import { csvResponse, exportFilename, MAX_EXPORT_ROWS } from "@/lib/exports/csv";
import { requireAdmin } from "@/lib/auth/current";

/**
 * GET /admin/activity/export
 *
 * Streams the current /admin/activity view as a CSV download using the
 * unified `csvResponse` helper from `lib/exports/csv` (T19 pattern).
 * Admin-only — `requireAdmin` throws for non-admins.
 *
 * Honours every filter param the page understands (actor, kind, src, from,
 * to) via `parseActivityFilters` — the same parser the page uses — so the
 * exported rows match whatever the admin currently sees on screen.  The
 * `before` cursor is intentionally NOT honoured: an export should always
 * start from "now" and walk back, not from an arbitrary pagination point.
 *
 * Hard cap: pulls up to `MAX_EXPORT_ROWS`.  If matching rows exceed the
 * cap we slice at the cap rather than 422 (close enough for M5.2 — the
 * activity feed grows linearly, so 10k rows is months of history).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await requireAdmin();

  const url = new URL(request.url);
  const sp: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of url.searchParams) sp[k] = v;
  const filters = parseActivityFilters(sp);

  const page = await listAllActivity({
    actorIds: filters.actorIds.length ? filters.actorIds : undefined,
    kinds: filters.kinds.length ? filters.kinds : undefined,
    source: filters.source.length ? filters.source : undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    limit: MAX_EXPORT_ROWS,
  });

  return csvResponse({
    filename: exportFilename("activity"),
    headers: [
      "created_at",
      "source",
      "actor",
      "event_type",
      "task_short_id",
      "target_employee",
      "setting_key",
      "from_value",
      "to_value",
      "note",
    ],
    rows: page.events.map((e) => [
      e.createdAt.toISOString(),
      e.source,
      e.actorName ?? "",
      e.eventType,
      e.taskSubject ?? "",
      e.targetEmployeeName ?? "",
      e.settingScope
        ? `${e.settingScope}${e.settingTargetId ? `:${e.settingTargetId}` : ""}`
        : "",
      e.fromValue !== null && e.fromValue !== undefined ? JSON.stringify(e.fromValue) : "",
      e.toValue !== null && e.toValue !== undefined ? JSON.stringify(e.toValue) : "",
      e.note ?? "",
    ]),
  });
}
