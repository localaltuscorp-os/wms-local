import "server-only";

/**
 * Google Calendar per-user sync — OAuth + Calendar REST, plain fetch (no SDK).
 *
 * Each doer connects their own Google account (personal Gmail or Workspace);
 * we keep their long-lived refresh token and exchange it for short-lived
 * access tokens on demand to create/update/delete events on their primary
 * calendar. All calls are best-effort: a calendar failure must never block a
 * task save.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID not set");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET not set");
  return v;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Build the consent-screen URL. `redirectUri` must be registered in the
 *  OAuth client. `access_type=offline` + `prompt=consent` guarantee a refresh
 *  token even on re-connect. */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

/** Exchange an auth code for tokens (after the consent redirect). */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

/** Refresh-token → short-lived access token. */
export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as TokenResponse;
  return json.access_token;
}

/** The connected account's email (for display). */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

// ─── Task → Google event mapping ──────────────────────────────────────────

export interface CalendarTask {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  client: string | null;
  dueAt: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  recurrenceRule: string | null;
}

function ymdUTC(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function plusDaysUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** Reformat our RRULE's `UNTIL=yyyy-mm-dd` into the form Google expects. */
function toGoogleRecurrence(rule: string, allDay: boolean): string[] {
  const fixed = rule.replace(/UNTIL=(\d{4})-(\d{2})-(\d{2})/i, (_m, y, mo, d) =>
    allDay ? `UNTIL=${y}${mo}${d}` : `UNTIL=${y}${mo}${d}T235959Z`,
  );
  return [`RRULE:${fixed}`];
}

const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://wms.mananvasa.com").replace(/\/+$/, "");

/** Build the Calendar API event body from a task. */
export function taskToEvent(task: CalendarTask): Record<string, unknown> {
  const meta = [
    task.description?.trim(),
    task.client ? `Client: ${task.client}` : null,
    task.subject ? `Subject: ${task.subject}` : null,
    `Open in WMS: ${APP_URL}/tasks/${task.id}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const timed = !task.allDay && task.startsAt;
  let start: Record<string, string>;
  let end: Record<string, string>;
  if (timed && task.startsAt) {
    const s = task.startsAt;
    const e = task.endsAt && task.endsAt > s ? task.endsAt : new Date(s.getTime() + 60 * 60 * 1000);
    start = { dateTime: s.toISOString() };
    end = { dateTime: e.toISOString() };
  } else {
    // All-day on the start date (or the due date). Google all-day `end.date`
    // is exclusive, so it's the day after.
    const day = task.startsAt ?? task.dueAt;
    start = { date: ymdUTC(day) };
    end = { date: ymdUTC(plusDaysUTC(day, 1)) };
  }

  const body: Record<string, unknown> = {
    summary: task.title,
    description: meta,
    start,
    end,
    source: { title: "Altus WMS", url: `${APP_URL}/tasks/${task.id}` },
  };
  if (task.recurrenceRule) {
    body.recurrence = toGoogleRecurrence(task.recurrenceRule, !timed);
  }
  return body;
}

// ─── Event CRUD ───────────────────────────────────────────────────────────

/** Create an event, returning its id. Throws on API error. */
export async function createEvent(refreshToken: string, task: CalendarTask): Promise<string> {
  const accessToken = await accessTokenFromRefresh(refreshToken);
  const res = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(taskToEvent(task)),
  });
  if (!res.ok) throw new Error(`createEvent failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function updateEvent(
  refreshToken: string,
  eventId: string,
  task: CalendarTask,
): Promise<void> {
  const accessToken = await accessTokenFromRefresh(refreshToken);
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(taskToEvent(task)),
  });
  if (!res.ok) throw new Error(`updateEvent failed: ${res.status} ${await res.text()}`);
}

export async function deleteEvent(refreshToken: string, eventId: string): Promise<void> {
  const accessToken = await accessTokenFromRefresh(refreshToken);
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 410 = already gone; treat as success.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`deleteEvent failed: ${res.status} ${await res.text()}`);
  }
}
