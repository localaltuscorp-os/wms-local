import { Eye } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { Chevroned } from "@/components/ui/chevroned-select";
import { localDateString } from "@/lib/format";
import { DEFAULT_GRID } from "@/lib/exec-calendar/grid";
import { buildAllocation } from "@/lib/exec-calendar/analytics";
import {
  isCalendarView,
  periodRange,
  type CalendarView,
} from "@/lib/exec-calendar/period";
import {
  execCalendarReady,
  listExecEvents,
  listDayMarkers,
  listExecOwners,
} from "@/lib/queries/exec-calendar";
import { ExecCalendarWorkspace } from "@/components/exec-calendar/calendar-workspace";
import { ExecAllocationPanel } from "@/components/exec-calendar/allocation-panel";
import { ExecLegend } from "@/components/exec-calendar/legend";
import { ExecOwnerPicker } from "@/components/exec-calendar/owner-picker";
import { ExecYearStrip } from "@/components/exec-calendar/year-strip";

export const dynamic = "force-dynamic";

/**
 * MONTHLY EVENTS MASTER — the room.
 *
 * Four horizons over one set of rows: day, week, month and year. The view and
 * the anchor day are both in the URL (`?view=`, `?day=`), so a particular week
 * of a particular year is a link somebody can send — which is most of what the
 * shared spreadsheet was being used for.
 *
 * EVERYTHING IS VISIBLE TO EVERYONE. The module exists so the team can see each
 * other's schedule; `?owner=` opens a colleague's calendar read-only, and the
 * only restriction is that you cannot EDIT anybody else's blocks (enforced in
 * the WHERE clause of every write, not just hidden in the UI).
 */

export default async function MonthlyEventsMasterPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    day?: string;
    new?: string;
    owner?: string;
    routine?: string;
    import?: string;
  }>;
}) {
  const me = await requireWorkspace("operations");
  const sp = await searchParams;

  // IST, like every other date in this app: a UTC "today" flips a day early
  // every evening and the calendar would jump under the reader.
  const today = localDateString("Asia/Kolkata");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day! : today;
  const view: CalendarView = isCalendarView(sp.view) ? sp.view : "week";

  const owners = await listExecOwners();
  const ownerId = owners.some((o) => o.id === sp.owner) ? sp.owner! : me.id;
  const isOwner = ownerId === me.id;
  const owner = owners.find((o) => o.id === ownerId);
  const canEdit = isOwner || isSuperAdmin(me.email);

  const ready = await execCalendarReady();
  // ONE WINDOW FOR EVERYONE: 06:30–23:00 (asked 2026-09-18). The per-person
  // hours picker was removed; any saved exec_calendar_prefs row is ignored.
  const cfg = DEFAULT_GRID;

  // One range serves the grid AND the stats, so the two can never disagree
  // about what period they are describing.
  const { from, to } = periodRange(view, day);
  // Clients are a fixed list in code now (lib/exec-calendar/clients.ts), so
  // nothing is fetched for the picker.
  const [events, markers] = ready
    ? await Promise.all([listExecEvents(ownerId, from, to), listDayMarkers(ownerId, from, to)])
    : [[], []];

  const report = buildAllocation(
    events.map((e) => ({
      day: e.day,
      categoryKey: e.categoryKey,
      startMin: e.startMin,
      endMin: e.endMin,
      allDay: e.allDay,
    })),
    from,
    to,
    cfg,
  );


  return (
    <PageShell width="wide">
      {/* Title only — red, in the module face, like every other room. */}
      <h1
        className="mb-4 text-[28px] font-extrabold leading-tight"
        style={{ color: "var(--color-altus-red)", fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        Monthly Events Master
      </h1>

      {!ready && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-[12.5px] leading-snug"
          style={{ background: "var(--color-amber-bg)", border: "1px solid var(--color-amber-edge)", color: "var(--color-amber-deep)" }}
        >
          <strong>The calendar tables are not in this database yet.</strong> The grid below is real
          and empty rather than broken — run <code>db/migrations/0231_exec_calendar.sql</code>.
        </div>
      )}

      {!isOwner && (
        <div
          className="mb-4 flex items-start gap-2 rounded-2xl px-4 py-3"
          style={{ background: "var(--color-indigo-bg)", border: "1px solid var(--color-indigo-edge)" }}
        >
          <Eye size={15} className="mt-[2px] shrink-0" style={{ color: "var(--color-indigo-deep)" }} />
          <div className="text-[12.5px] leading-snug" style={{ color: "var(--color-indigo-deep)" }}>
            <strong>{owner?.name}&rsquo;s calendar.</strong> You can read all of it; only they can
            change it.
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <ExecCalendarWorkspace
            view={view}
            day={day}
            events={events}
            markers={markers}
            cfg={cfg}
            today={today}
            ownerId={ownerId}
            isOwner={isOwner}
            canEdit={canEdit}
            draftDay={canEdit && /^\d{4}-\d{2}-\d{2}$/.test(sp.new ?? "") ? sp.new : null}
            openRoutine={canEdit && (sp.routine === "1" || sp.routine === "delete")}
            routineMode={sp.routine === "delete" ? "delete" : "stamp"}
            openImport={canEdit && sp.import === "1"}
          />
        </div>

        <aside className="space-y-4">
          {/* Whose calendar, and the year jump — both belong beside the stats
              they change, not in the toolbar, which is now controls only. */}
          <div className="rounded-2xl border border-hairline bg-surface-card p-3">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
              Calendar
            </span>
            <Chevroned>
              <ExecOwnerPicker owners={owners} ownerId={ownerId} meId={me.id} view={view} day={day} />
            </Chevroned>

            <span className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
              Jump to year
            </span>
            <ExecYearStrip
              thisYear={Number(today.slice(0, 4))}
              selectedYear={Number(day.slice(0, 4))}
              view={view}
              monthDay={day.slice(4)}
              ownerQuery={isOwner ? "" : `&owner=${ownerId}`}
            />
          </div>

          <ExecAllocationPanel report={report} view={view} />
          <ExecLegend />
        </aside>
      </div>
    </PageShell>
  );
}
