import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { listExecEvents, listExecOwners, execCalendarReady } from "@/lib/queries/exec-calendar";
import { periodRange } from "@/lib/exec-calendar/period";
import { buildMonthExportHtml } from "@/lib/exec-calendar/export-html";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

const Body = z.object({
  ownerId: z.string().uuid(),
  /** Any day inside the month to export. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["pdf", "jpg"]),
});

/**
 * POST /api/events/export — the Executive Master Calendar's "Export" button.
 * Renders the Month view (whichever month `day` falls in) for `ownerId` to a
 * downloadable PDF or JPG, via headless Chromium (lib/pdf/chromium.ts) — the
 * same renderer the HR letters module uses for its "rich" letters.
 *
 * Read-only, so the module's own rule applies unchanged: everyone can export
 * everyone's calendar (the WHOLE module is "everyone sees everything, only the
 * owner edits") — this is not a write, so no extra ownership check is needed
 * beyond being signed in.
 */
export async function POST(req: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  // The MODULE gate — a route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking Operations/the calendar would
  // hide the page while this export endpoint kept answering.
  const denial = await apiViewDenial(req);
  if (denial) return denial;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return new Response("Too many requests", { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { ownerId, day, format } = parsed.data;

  const ready = await execCalendarReady();
  if (!ready) return new Response("The calendar tables are not set up yet.", { status: 409 });

  const owners = await listExecOwners();
  const owner = owners.find((o) => o.id === ownerId);
  if (!owner) return new Response("Unknown calendar owner.", { status: 404 });

  const { from, to } = periodRange("month", day);
  const events = await listExecEvents(ownerId, from, to);
  const html = buildMonthExportHtml({ ownerName: owner.name, anchor: day, events });

  const stem = `${owner.name.replace(/[^a-zA-Z0-9._-]/g, "-")}-${day.slice(0, 7)}`;

  try {
    if (format === "pdf") {
      const { renderHtmlToPdf } = await import("@/lib/pdf/chromium");
      const pdf = await renderHtmlToPdf(html);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${stem}.pdf"`,
        },
      });
    }
    const { renderHtmlToJpeg } = await import("@/lib/pdf/chromium");
    const jpeg = await renderHtmlToJpeg(html, { width: 1400, height: 1000 });
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "content-type": "image/jpeg",
        "content-disposition": `attachment; filename="${stem}.jpg"`,
      },
    });
  } catch {
    return new Response("Could not render the export.", { status: 500 });
  }
}
