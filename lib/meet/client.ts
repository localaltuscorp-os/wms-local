import "server-only";
import crypto from "node:crypto";

/**
 * Google Meet REST client — "project / remote work sessions", the MEET HOURS
 * path (join/leave time only; screen-share is a SEPARATE capture layer and is
 * not touched here). No feature flag: every entry point throws a clear "not
 * configured" error when its Google Workspace env is missing, so the integration
 * is naturally inert until a human completes the activation steps — then it just
 * works, no switch to flip.
 *
 * No `googleapis` dependency: we mint the service-account access token by signing
 * a JWT locally with node:crypto (same fetch-only style as
 * lib/google/service-account.ts) and call the Meet v2 REST endpoints with raw
 * fetch.
 *
 * Auth model: a Google Workspace service account (JSON in `GOOGLE_MEET_SA_JSON`)
 * with domain-wide delegation, optionally impersonating a Workspace user via
 * `GOOGLE_MEET_SUBJECT`. Scope: meetings.space.created.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MEET_BASE = "https://meet.googleapis.com/v2";

/** OAuth scope required to create/read Meet spaces + conference records. */
export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";

/** Thrown when the Meet integration env is absent — the normal dormant state. */
export class MeetNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetNotConfiguredError";
  }
}

interface ServiceAccountJson {
  client_email?: string;
  private_key?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function loadServiceAccount(): ServiceAccountJson {
  const raw = process.env.GOOGLE_MEET_SA_JSON;
  if (!raw) {
    throw new MeetNotConfiguredError(
      "GOOGLE_MEET_SA_JSON not set — Meet integration is dormant (see activation steps).",
    );
  }
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new MeetNotConfiguredError("GOOGLE_MEET_SA_JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new MeetNotConfiguredError(
      "GOOGLE_MEET_SA_JSON is missing client_email / private_key.",
    );
  }
  return parsed;
}

/**
 * Mint a Google access token for the Meet service account via the standard
 * JWT-bearer OAuth grant. When `GOOGLE_MEET_SUBJECT` is set the JWT carries a
 * `sub` claim so the SA impersonates that Workspace user (domain-wide delegation)
 * — required because a Meet space is owned by a real user, not the SA itself.
 */
export async function getMeetAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  // `private_key` in a Google SA JSON already contains real newlines, but a key
  // pasted through env tooling may have them escaped — normalise defensively.
  const privateKey = sa.private_key!.replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_MEET_SUBJECT;
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: MEET_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      ...(subject ? { sub: subject } : {}),
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    // Error bodies from Google carry status/reason only — never the key/JWT.
    throw new Error(`Meet token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in Meet token response");
  return json.access_token;
}

/** A Meet space, as returned by spaces.create. */
export interface MeetSpace {
  /** Resource name, e.g. "spaces/abc123". */
  name?: string;
  /** Short code, e.g. "abc-defg-hjk". */
  meetingCode?: string;
  /** Full https://meet.google.com/... URL. */
  meetingUri?: string;
}

/**
 * Create a fresh Meet space (a reusable meeting URL). The owning/impersonated
 * user becomes the space host. Used to hand a project participant a Meet link
 * that our Events subscription is watching.
 */
export async function createMeetSpace(): Promise<MeetSpace> {
  const token = await getMeetAccessToken();
  const res = await fetch(`${MEET_BASE}/spaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Meet createSpace failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as MeetSpace;
}

/** One participant session (a single join→leave interval) from the Meet REST API. */
export interface ParticipantSession {
  /** Resource name, ".../participants/{p}/participantSessions/{s}". */
  name?: string;
  /** RFC3339 join time. */
  startTime?: string;
  /** RFC3339 leave time (absent while the participant is still in the call). */
  endTime?: string;
}

/**
 * List the participant sessions recorded for a conference. Each session has a
 * startTime/endTime pair we sum into authoritative minutes during reconcile.
 *
 * `conferenceRecord` may be either the bare id or the full
 * "conferenceRecords/{id}" resource name. When `participant` is given (bare id
 * or ".../participants/{id}" resource name) only that participant's sessions are
 * returned — the reconcile job passes the participant we stored on the row, which
 * is both cheaper and the exact interval we want. When it is omitted, every
 * participant in the conference is walked and their sessions concatenated.
 */
export async function listParticipantSessions(
  conferenceRecord: string,
  participant?: string,
): Promise<ParticipantSession[]> {
  const token = await getMeetAccessToken();
  const conf = normaliseId(conferenceRecord, "conferenceRecords");

  const participantIds = participant
    ? [normaliseId(participant, "participants")]
    : await listParticipantIds(conf, token);

  const all: ParticipantSession[] = [];
  for (const pid of participantIds) {
    all.push(...(await fetchSessionsForParticipant(conf, pid, token)));
  }
  return all;
}

/** Extract the trailing id from a `{collection}/{id}` resource name (or pass id through). */
function normaliseId(value: string, collection: string): string {
  const marker = `${collection}/`;
  const idx = value.indexOf(marker);
  const tail = idx >= 0 ? value.slice(idx + marker.length) : value;
  // A full session/participant name can have further segments — keep the first.
  return tail.split("/")[0] ?? tail;
}

async function listParticipantIds(confId: string, token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${MEET_BASE}/conferenceRecords/${confId}/participants`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Meet listParticipants failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      participants?: { name?: string }[];
      nextPageToken?: string;
    };
    for (const p of json.participants ?? []) {
      if (p.name) ids.push(normaliseId(p.name, "participants"));
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return ids;
}

async function fetchSessionsForParticipant(
  confId: string,
  participantId: string,
  token: string,
): Promise<ParticipantSession[]> {
  const sessions: ParticipantSession[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `${MEET_BASE}/conferenceRecords/${confId}/participants/${participantId}/participantSessions`,
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(
        `Meet listParticipantSessions failed: ${res.status} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as {
      participantSessions?: ParticipantSession[];
      nextPageToken?: string;
    };
    sessions.push(...(json.participantSessions ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return sessions;
}
