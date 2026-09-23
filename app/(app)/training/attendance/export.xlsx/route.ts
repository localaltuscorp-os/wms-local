import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth/current";
import { apiViewDenial } from "@/lib/permissions/api-guard";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canTrain } from "@/lib/training/roles";
import { listSessions } from "@/lib/queries/training-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /training/attendance/export.xlsx — the attendance list as a workbook. */
export async function GET(request: Request): Promise<Response> {
  const denial = await apiViewDenial(request);
  if (denial) return denial;

  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  // Trainers / admins / supers may export attendance (never a plain employee's
  // team-wide data).
  const allowed = me.isAdmin || isSuperAdmin(me.email) || (await canTrain(me));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const scope = me.isAdmin || isSuperAdmin(me.email)
    ? ({ kind: "all", meId: me.id } as const)
    : ({ kind: "downline", meId: me.id } as const);
  const sessions = await listSessions({ scope });

  const rows = sessions
    .filter((s) => s.status !== "cancelled")
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .map((s) => ({
      Training: s.topic,
      Trainer: s.trainerName ?? "",
      When: new Date(s.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      Attended: s.attendedCount,
      Invited: s.attendeeCount,
      Status: s.status,
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Training-Attendance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
