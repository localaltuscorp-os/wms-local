import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listSessions, type SessionListRow } from "@/lib/queries/training-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Field = { label: string; value: string };
type Row = { title: string; subtitle: string | null; link: string | null; fields: Field[] };
type Section = { title: string; subtitle: string; stats: Field[]; rows: Row[] };

const kv = (label: string, value: string | null | undefined): Field | null =>
  value && String(value).trim() ? { label, value: String(value).trim() } : null;
const fields = (...xs: (Field | null)[]): Field[] => xs.filter(Boolean) as Field[];

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  });
}

function sessionRow(s: SessionListRow): Row {
  const when = fmtDateTime(s.scheduledAt);
  const modeLabel = s.mode === "online" ? "Online" : "In person";
  const where = s.mode === "online" ? (s.meetingUrl || "Online") : (s.location || "—");
  const statusLabel = s.status.charAt(0).toUpperCase() + s.status.slice(1);
  return {
    title: s.topic,
    subtitle: [when, s.trainerName].filter(Boolean).join(" · ") || null,
    link: s.mode === "online" ? s.meetingUrl : null,
    fields: fields(
      kv("Subject", s.subject),
      kv("Mode", modeLabel),
      kv("Where", where),
      kv("Duration", s.durationMin ? `${s.durationMin} min` : null),
      kv("Status", statusLabel),
      kv("Attendance", `${s.attendedCount}/${s.attendeeCount}`),
    ),
  };
}

/**
 * GET /api/mobile/section/[slug] — a normalized cross-module record section
 * ({ title, subtitle, stats[], rows[] }), rendered by the same native section
 * screen as the Accounts registers. Each slug reuses the web module's own query
 * so the phone and the web page never diverge.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { slug } = await ctx.params;
  const admin = me.isAdmin || isSuperAdmin(me.email);

  let section: Section | null = null;

  if (slug === "training-calendar") {
    const rows = await listSessions({ scope: admin ? { kind: "all", meId: me.id } : { kind: "downline", meId: me.id } });
    const scheduled = rows.filter((r) => r.status === "scheduled").length;
    const done = rows.filter((r) => r.status === "done").length;
    section = {
      title: "Training Calendar",
      subtitle: admin ? "All sessions" : "My team's sessions",
      stats: fields(
        kv("Sessions", String(rows.length)),
        kv("Scheduled", String(scheduled)),
        kv("Completed", String(done)),
      ),
      rows: rows.map(sessionRow),
    };
  }

  if (!section) {
    return NextResponse.json({ error: "unknown-section" }, { status: 404, headers: MOBILE_CORS });
  }
  return NextResponse.json(section, { headers: MOBILE_CORS });
}
