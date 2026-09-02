import { csvResponse, exportFilename } from "@/lib/exports/csv";
import { getBroadcastWithStats } from "@/lib/ecos/queries";
import { RECEIPT_STATUS_LABELS } from "@/lib/ecos/labels";
import { formatDate } from "@/lib/format";

/**
 * GET /communications/[id]/export
 *
 * Streams one broadcast's per-recipient delivery breakdown as a CSV — the BI
 * export for HR. HR-gated: `getBroadcastWithStats` calls `requireHrStaff`, so a
 * non-HR viewer gets a thrown 403 before any data is read. One row per
 * recipient: name, email, receipt status, and the delivered / read /
 * acknowledged dates + which channels reached them.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const data = await getBroadcastWithStats(id);
  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const { broadcast, recipients } = data;
  const headers = [
    "Name",
    "Email",
    "Status",
    "Delivered",
    "Read",
    "Acknowledged",
    "Channels",
  ];
  const rows = recipients.map((r) => [
    r.name,
    r.email,
    RECEIPT_STATUS_LABELS[r.status] ?? r.status,
    r.deliveredAt ? formatDate(r.deliveredAt) : "",
    r.readAt ? formatDate(r.readAt) : "",
    r.acknowledgedAt ? formatDate(r.acknowledgedAt) : "",
    r.deliveredChannels.join(" · "),
  ]);

  // Slugify the title into the filename so multiple exports don't collide.
  const slug = broadcast.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return csvResponse({
    filename: exportFilename(`broadcast-${slug || "recipients"}`),
    headers,
    rows,
  });
}
