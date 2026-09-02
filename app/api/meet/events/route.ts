import { NextResponse } from "next/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, workSessions, employees } from "@/lib/db";

/**
 * Google Meet participant webhook — Phase-2 "project / remote work sessions",
 * MEET HOURS path. Google Workspace Events API publishes
 * `google.workspace.meet.participant.v2.joined` / `.left` CloudEvents to a Cloud
 * Pub/Sub topic; a Pub/Sub PUSH subscription POSTs them here. We turn joins into
 * an OPEN work_sessions row and leaves into a CLOSED one with minutes.
 *
 * No feature flag: until a Pub/Sub subscription is pointed at this URL no
 * requests ever arrive, so the route is inert by construction — nothing to
 * switch on.
 *
 * Auth: Pub/Sub push carries a Google-signed OIDC bearer token in the
 * `Authorization` header, with `aud` = the endpoint URL configured on the
 * subscription. We check the token is PRESENT and (best-effort, without a JWKS
 * dependency) that its `aud` claim equals `MEET_PUBSUB_AUDIENCE`. Set
 * `MEET_PUBSUB_VERIFY=false` to skip this in local/dev. A genuine auth failure
 * returns 401; everything we successfully handle (or safely ignore) returns 200
 * so Pub/Sub does not redeliver in a hot loop.
 *
 * NOTE: full cryptographic verification of the OIDC token (fetching Google's
 * JWKS and validating the RS256 signature) is intentionally deferred — the
 * subscription itself is a private, authenticated push endpoint and the audience
 * check rejects tokens minted for anything else. Harden to full JWKS validation
 * before this path books anything payroll-affecting.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOINED_SUFFIX = "participant.v2.joined";
const LEFT_SUFFIX = "participant.v2.left";

interface PubSubEnvelope {
  message?: { data?: string; attributes?: Record<string, string>; messageId?: string };
  subscription?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  // Verify the caller is Google's Pub/Sub push (OIDC bearer + audience). Until a
  // Pub/Sub subscription is wired to this endpoint no requests arrive, so this
  // route is naturally inert — no on/off flag needed.
  const auth = verifyPubSubAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) Parse the Pub/Sub envelope → CloudEvent.
  let envelope: PubSubEnvelope;
  try {
    envelope = (await request.json()) as PubSubEnvelope;
  } catch {
    // Malformed body: ack (200) so Pub/Sub stops retrying an un-parseable msg.
    return NextResponse.json({ ok: true, ignored: "unparseable-body" });
  }

  const cloudEvent = decodeCloudEvent(envelope, request);
  if (!cloudEvent) {
    return NextResponse.json({ ok: true, ignored: "no-cloudevent" });
  }

  const type = String(cloudEvent.type ?? "");
  const payload = cloudEvent.payload;

  try {
    if (type.endsWith(JOINED_SUFFIX)) {
      await handleJoined(payload);
      return NextResponse.json({ ok: true, handled: "joined" });
    }
    if (type.endsWith(LEFT_SUFFIX)) {
      await handleLeft(payload);
      return NextResponse.json({ ok: true, handled: "left" });
    }
    // Some other Meet event we don't act on — ack it.
    return NextResponse.json({ ok: true, ignored: type || "unknown-type" });
  } catch (err) {
    console.error("[api/meet/events] handler failed", err);
    // 500 → Pub/Sub will redeliver with backoff, which is what we want for a
    // transient DB hiccup (the join/leave upserts below are idempotent).
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ auth --- */

function verifyPubSubAuth(request: Request): { ok: boolean } {
  if (process.env.MEET_PUBSUB_VERIFY === "false") return { ok: true };

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return { ok: false };
  const token = header.slice("Bearer ".length).trim();
  if (!token) return { ok: false };

  const expectedAud = process.env.MEET_PUBSUB_AUDIENCE;
  // If no expected audience is configured we still require a bearer token to be
  // present (checked above) but cannot compare the claim — accept its presence.
  if (!expectedAud) return { ok: true };

  const claims = decodeJwtClaims(token);
  if (!claims) return { ok: false };
  return { ok: claims.aud === expectedAud };
}

/** Best-effort, signature-less decode of a JWT's claim set (audience check only). */
function decodeJwtClaims(token: string): { aud?: string } | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as { aud?: string };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- event parsing --- */

interface DecodedCloudEvent {
  type?: string;
  payload: Record<string, unknown>;
}

/**
 * Unwrap the Pub/Sub envelope into a CloudEvent. The event JSON lives in
 * `message.data` (base64). We read its `type`/`eventType` and its data body,
 * falling back to the Pub/Sub message attributes for the type when present.
 */
function decodeCloudEvent(
  envelope: PubSubEnvelope,
  request: Request,
): DecodedCloudEvent | null {
  const data = envelope.message?.data;
  let body: Record<string, unknown> = {};
  if (data) {
    try {
      body = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      body = {};
    }
  }

  const attrs = envelope.message?.attributes ?? {};
  const type =
    (typeof body.type === "string" && body.type) ||
    (typeof body.eventType === "string" && (body.eventType as string)) ||
    attrs["ce-type"] ||
    attrs["eventType"] ||
    request.headers.get("ce-type") ||
    undefined;

  // CloudEvents may be structured (data nested under `data`) or already flat.
  const payload =
    (body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body) ?? {};

  if (!type && Object.keys(payload).length === 0) return null;
  return { type: type ?? undefined, payload };
}

interface MeetRefs {
  conferenceRecord?: string;
  participant?: string;
  participantSession?: string;
  startTime?: string;
  endTime?: string;
  email?: string;
}

/**
 * Pull the identifiers we need out of a Meet participant event payload. Meet
 * resource names look like
 * `conferenceRecords/{c}/participants/{p}/participantSessions/{s}` and may appear
 * on several keys (`participantSession.name`, `participant.name`, `resourceName`,
 * `resource.name`) depending on the delivery shape, so we scan the whole payload
 * for the first resource-name-looking string and parse ids out of it. Times and
 * any email are likewise probed defensively (Meet often omits the email for
 * privacy — then we store the participant and leave employee unresolved).
 */
function extractMeetRefs(payload: Record<string, unknown>): MeetRefs {
  const refs: MeetRefs = {};
  const resourceName = findResourceName(payload);
  if (resourceName) {
    refs.conferenceRecord = matchSegment(resourceName, "conferenceRecords");
    refs.participant = matchSegment(resourceName, "participants");
    refs.participantSession = matchSegment(resourceName, "participantSessions");
  }
  refs.startTime = findString(payload, ["startTime", "start_time", "joinTime"]);
  refs.endTime = findString(payload, ["endTime", "end_time", "leaveTime"]);
  refs.email = findEmail(payload);
  return refs;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function matchSegment(resourceName: string, collection: string): string | undefined {
  const m = resourceName.match(new RegExp(`${collection}/([^/]+)`));
  return m ? m[1] : undefined;
}

/** Depth-first search for the first string that names a Meet conference resource. */
function findResourceName(obj: unknown, depth = 0): string | undefined {
  if (depth > 6 || obj == null) return undefined;
  if (typeof obj === "string") {
    return obj.includes("conferenceRecords/") ? obj : undefined;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findResourceName(v, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const found = findResourceName(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** First string value found under any of `keys` (shallow-to-deep search). */
function findString(
  obj: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (depth > 6 || obj == null || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (typeof rec[k] === "string" && rec[k]) return rec[k] as string;
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") {
      const found = findString(v, keys, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Depth-first search for the first email-looking string anywhere in the payload. */
function findEmail(obj: unknown, depth = 0): string | undefined {
  if (depth > 6 || obj == null) return undefined;
  if (typeof obj === "string") return EMAIL_RE.test(obj) ? obj : undefined;
  if (typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  // Prefer an explicit email-named key when present.
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === "string" && /email/i.test(k) && EMAIL_RE.test(v)) return v;
  }
  for (const v of Object.values(rec)) {
    const found = findEmail(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/* ------------------------------------------------------ employee mapping --- */

/**
 * Resolve a Meet participant's Google email to an employee id. Matches on
 * `employees.google_email` first (the column dedicated to Workspace identity),
 * then falls back to the primary `employees.email`, both case-insensitively.
 * Returns null when there is no email or no match — the session is still stored,
 * just unattributed, so reconcile/manager review can fix it later.
 */
async function resolveEmployeeId(email?: string): Promise<string | null> {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      or(
        eq(sql`lower(${employees.googleEmail})`, needle),
        eq(sql`lower(${employees.email})`, needle),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/* --------------------------------------------------------------- handlers -- */

async function handleJoined(payload: Record<string, unknown>): Promise<void> {
  const refs = extractMeetRefs(payload);
  const employeeId = await resolveEmployeeId(refs.email);
  const startedAt = refs.startTime ? new Date(refs.startTime) : new Date();

  // Idempotency: if an OPEN row already exists for this participant session,
  // don't create a duplicate (Pub/Sub is at-least-once).
  if (refs.participantSession) {
    const existing = await db
      .select({ id: workSessions.id })
      .from(workSessions)
      .where(
        and(
          eq(workSessions.source, "meet"),
          eq(workSessions.meetParticipant, refs.participantSession),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
  }

  // We can only insert with a real employee (employee_id is NOT NULL). When the
  // participant email didn't resolve, skip the write rather than guess — the
  // event is acked so Pub/Sub won't retry; unattributed Meet minutes are simply
  // not booked (deliberate: payroll data is never attached to a guessed person).
  if (!employeeId) return;

  await db.insert(workSessions).values({
    employeeId,
    startedAt,
    source: "meet",
    meetConferenceRecord: refs.conferenceRecord ?? null,
    // Store the participantSession resource name (unique per join) so the
    // matching leave and the idempotency check above can find this exact row.
    meetParticipant: refs.participantSession ?? refs.participant ?? null,
    status: "open",
  });
}

async function handleLeft(payload: Record<string, unknown>): Promise<void> {
  const refs = extractMeetRefs(payload);
  const endedAt = refs.endTime ? new Date(refs.endTime) : new Date();
  const marker = refs.participantSession ?? refs.participant;
  if (!marker) return;

  // Find the OPEN session this leave closes (by the participant-session marker).
  const open = await db
    .select({ id: workSessions.id, startedAt: workSessions.startedAt })
    .from(workSessions)
    .where(
      and(
        eq(workSessions.source, "meet"),
        eq(workSessions.meetParticipant, marker),
        eq(workSessions.status, "open"),
      ),
    )
    .limit(1);
  const row = open[0];
  if (!row) return;
  const minutes = Math.max(
    0,
    (endedAt.getTime() - new Date(row.startedAt).getTime()) / 60000,
  );

  await db
    .update(workSessions)
    .set({
      endedAt,
      status: "closed",
      totalMinutes: minutes.toFixed(2),
      updatedAt: new Date(),
    })
    .where(and(eq(workSessions.id, row.id), isNull(workSessions.endedAt)));
}
