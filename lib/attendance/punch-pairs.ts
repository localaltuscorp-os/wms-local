/**
 * Attendance sessions are alternating check-in/check-out events. An employee
 * may start up to three sessions on a calendar day. This helper pairs those
 * events in time order and assigns every completed minute to the employee's
 * local calendar day, including sessions which pass midnight.
 */

export type AttendancePunchEvent = {
  kind: "in" | "out";
  loggedAt: Date;
  source?: string | null;
  reason?: string | null;
  recordedById?: string | null;
};

export type DailyPunchSessions = {
  firstInAt: string | null;
  lastOutAt: string | null;
  workedMinutes: number;
  openInAt: string | null;
  autoClosed: boolean;
};

function dateInTimeZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function timeInTimeZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

function addCalendarDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** UTC instant corresponding to 00:00 on `ymd` in the supplied timezone. */
function localMidnight(ymd: string, timeZone: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const wallAsUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const probe = new Date(wallAsUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = value("hour") === 24 ? 0 : value("hour");
  const displayedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
  return new Date(wallAsUtc - (displayedAsUtc - wallAsUtc));
}

function emptyDay(): DailyPunchSessions {
  return { firstInAt: null, lastOutAt: null, workedMinutes: 0, openInAt: null, autoClosed: false };
}

function isAutoClosed(event: AttendancePunchEvent): boolean {
  return event.source === "admin" && event.reason === "forgot" && !event.recordedById;
}

/**
 * Pair complete sessions and allocate their duration by local calendar date.
 * An unmatched check-in remains open; its running duration is deliberately not
 * included here, because the attendance grader supplies its own reference time.
 */
export function foldPunchSessions(
  events: readonly AttendancePunchEvent[],
  timeZone: string,
): Map<string, DailyPunchSessions> {
  const byDay = new Map<string, DailyPunchSessions>();
  const dayFor = (date: string) => {
    let value = byDay.get(date);
    if (!value) {
      value = emptyDay();
      byDay.set(date, value);
    }
    return value;
  };
  const ordered = [...events].sort((left, right) => left.loggedAt.getTime() - right.loggedAt.getTime());
  let open: AttendancePunchEvent | null = null;

  for (const event of ordered) {
    const eventDay = dateInTimeZone(event.loggedAt, timeZone);
    const slot = dayFor(eventDay);
    if (event.kind === "in") {
      // A later in-punch cannot silently replace an open session. The write
      // layer refuses this state; retaining the first event protects reporting
      // for any historical malformed data.
      if (!open) {
        open = event;
        if (!slot.firstInAt) slot.firstInAt = timeInTimeZone(event.loggedAt, timeZone);
      }
      continue;
    }

    slot.lastOutAt = timeInTimeZone(event.loggedAt, timeZone);
    if (!open || event.loggedAt <= open.loggedAt) continue;

    let cursor = open.loggedAt;
    while (cursor < event.loggedAt) {
      const day = dateInTimeZone(cursor, timeZone);
      const boundary = localMidnight(addCalendarDays(day, 1), timeZone);
      const end = boundary < event.loggedAt ? boundary : event.loggedAt;
      const minutes = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / 60_000));
      dayFor(day).workedMinutes += minutes;
      cursor = end;
    }
    if (isAutoClosed(event)) dayFor(dateInTimeZone(open.loggedAt, timeZone)).autoClosed = true;
    open = null;
  }

  if (open) {
    const slot = dayFor(dateInTimeZone(open.loggedAt, timeZone));
    slot.openInAt = timeInTimeZone(open.loggedAt, timeZone);
  }
  return byDay;
}
