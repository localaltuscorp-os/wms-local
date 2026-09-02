"use server";

import { revalidatePath } from "next/cache";
import { updateTag } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { authSessions, auditDataExports, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { CACHE_TAGS, PROFILE_CACHE_TAGS } from "@/lib/cache-tags";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isAcceptableAvatarUrl } from "@/lib/avatar-url";
import { revokeToken } from "@/lib/google/calendar";
import { backfillDoerCalendar } from "@/lib/google/sync";

/**
 * Disconnect Google Calendar — revoke the stored refresh token at Google and
 * clear it locally. New tasks for this doer simply stop syncing; existing
 * calendar events stay put (we no longer hold a token to delete them).
 */
export async function disconnectGoogleCalendar(): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const [row] = await db
    .select({ token: employees.googleRefreshToken })
    .from(employees)
    .where(eq(employees.id, me.id))
    .limit(1);
  if (row?.token) await revokeToken(row.token);
  await db
    .update(employees)
    .set({ googleRefreshToken: null, googleEmail: null, googleConnectedAt: null })
    .where(eq(employees.id, me.id));
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * "Sync now" — push all of my active tasks onto my connected Google Calendar.
 * Runs the same backfill that fires automatically on connect, but on demand so
 * you can verify the integration end-to-end and re-seed after any drift.
 */
export async function syncGoogleCalendarNow(): Promise<
  { ok: true; attempted: number; synced: number } | { ok: false; error: string }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const [row] = await db
    .select({ token: employees.googleRefreshToken })
    .from(employees)
    .where(eq(employees.id, me.id))
    .limit(1);
  if (!row?.token) {
    return { ok: false, error: "Connect Google Calendar first." };
  }

  try {
    const { attempted, synced } = await backfillDoerCalendar(me.id);
    return { ok: true, attempted, synced };
  } catch (err) {
    return { ok: false, error: `Sync failed: ${(err as Error).message}` };
  }
}

/**
 * M4 — self-serve per-channel opt-in flags.  Only the two channels the
 * employee can fully control today (email + Slack) are mutable here.
 * WhatsApp opt-in is admin-gated because it requires capturing the
 * employee's phone number, which we ask admins to do on their behalf
 * (DPDP / Meta-policy reasons).  Web Push opt-in lives on the
 * subscription itself (one row per device) — not on this scalar.
 */
const PatchSchema = z
  .object({
    emailOptIn: z.boolean().optional(),
    slackOptIn: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes." });

export type UpdateMyChannelsInput = z.infer<typeof PatchSchema>;

export async function updateMyChannels(
  input: UpdateMyChannelsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = PatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
    };
  }
  try {
    await db.update(employees).set(parsed.data).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Self-serve profile edits — avatar URL only. The display NAME is set by an
 * admin and is final: it's intentionally NOT written here (even if a `name`
 * is supplied), so a user can never rename themselves. Email, department and
 * the admin flag are likewise admin-managed. Avatar URL is just a string;
 * empty string clears it.
 */
const ProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1, "Name can't be empty").max(120),
    avatarUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(
        isAcceptableAvatarUrl,
        "Avatar must be a public image URL, a chosen preset, or empty",
      ),
  })
  .strict();

export type UpdateMyProfileInput = z.infer<typeof ProfilePatchSchema>;

export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = ProfilePatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
    };
  }
  try {
    await db
      .update(employees)
      // Name is admin-managed and final — only the avatar is self-editable.
      .set({
        avatarUrl: parsed.data.avatarUrl === "" ? null : parsed.data.avatarUrl,
      })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
  revalidatePath("/profile");
  revalidatePath("/"); // header avatar reads from the same row
  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Profile v2 — Identity tab autosave actions                              */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Patch the v2 identity fields the user can self-edit. Every field is
 * optional; only supplied keys are written. Autosave-friendly: the form
 * sends one key at a time on every keystroke (debounced) / toggle.
 */
const IdentityPatchSchema = z
  .object({
    bio: z.string().trim().max(280, "Bio is too long").nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
    availability: z
      .enum(["available", "focused", "heads_down", "away"])
      .optional(),
    availabilityAutoRevertAt: z.coerce.date().nullable().optional(),
    // theme intentionally omitted — Altus dashboard is light-only.
    density: z.enum(["cozy", "compact"]).optional(),
    accent: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a 6-digit hex")
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes." });

export type IdentityPatch = z.infer<typeof IdentityPatchSchema>;

export async function patchIdentity(
  input: IdentityPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = IdentityPatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
    };
  }

  try {
    await db.update(employees).set(parsed.data).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  // Touching availability or accent affects how the user shows up to
  // others (avatar status pill, mention chips), so bust the roster too.
  if (parsed.data.availability !== undefined || parsed.data.accent !== undefined) {
    updateTag(CACHE_TAGS.employees);
  }
  return { ok: true };
}

/**
 * Revoke a single auth_sessions row. The user can only revoke their
 * own sessions — the WHERE clause double-gates on employee_id.
 */
const SessionIdSchema = z.string().uuid("Invalid session id");

export async function revokeSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SessionIdSchema.safeParse(sessionId);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  try {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.id, parsed.data),
          eq(authSessions.employeeId, me.id),
          isNull(authSessions.revokedAt),
        ),
      );
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.authSessions(me.id));
  return { ok: true };
}

/**
 * Sign out everywhere: mark all of my sessions revoked AND ask Firebase
 * to invalidate refresh tokens for my UID. Existing __session cookies
 * survive until they re-verify, which middleware does each request —
 * so within ~seconds, every device drops to /login.
 */
export async function revokeAllSessions(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  try {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.employeeId, me.id),
          isNull(authSessions.revokedAt),
        ),
      );

    if (me.firebaseUid) {
      await getFirebaseAdminAuth().revokeRefreshTokens(me.firebaseUid);
    }
  } catch (err) {
    return { ok: false, error: `Auth: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.authSessions(me.id));
  return { ok: true };
}

/**
 * Create a new audit_data_exports row in `pending` state. The cron
 * route /api/cron/data-export picks it up, ZIPs the user's data,
 * stores in the documents bucket, emails the user a signed URL.
 *
 * Rate-limited harder than other writes: one request per 5 minutes.
 */
const DATA_EXPORT_COOLDOWN_MS = 5 * 60 * 1000;

export async function requestDataExport(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Don't queue a new one if there's an in-flight request younger than
  // the cooldown — that just spams the cron with duplicate work.
  const inflight = await db
    .select({ id: auditDataExports.id, requestedAt: auditDataExports.requestedAt })
    .from(auditDataExports)
    .where(
      and(
        eq(auditDataExports.employeeId, me.id),
        eq(auditDataExports.status, "pending"),
      ),
    )
    .limit(1);
  if (inflight[0]) {
    const ageMs = Date.now() - new Date(inflight[0].requestedAt).getTime();
    if (ageMs < DATA_EXPORT_COOLDOWN_MS) {
      return {
        ok: false,
        error: "An export is already being prepared — we'll email you.",
      };
    }
  }

  try {
    const [row] = await db
      .insert(auditDataExports)
      .values({ employeeId: me.id })
      .returning({ id: auditDataExports.id });
    if (!row) {
      return { ok: false, error: "DB: insert returned no row" };
    }
    updateTag(PROFILE_CACHE_TAGS.dataExports(me.id));
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Profile v2 — Notifications tab autosave actions                          */
/* ──────────────────────────────────────────────────────────────────────── */

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  upsertNotificationPref,
  type NotificationChannelKey,
  type NotificationKindKey,
} from "@/lib/profile/notification-prefs";

const NotificationPrefPatchSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
});

export async function setNotificationPref(input: {
  kind: NotificationKindKey;
  channel: NotificationChannelKey;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = NotificationPrefPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  try {
    await upsertNotificationPref(
      me.id,
      parsed.data.kind,
      parsed.data.channel,
      parsed.data.enabled,
    );
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.notificationPrefs(me.id));
  return { ok: true };
}

const DigestPrefsSchema = z.object({
  digestFrequency: z.enum(["off", "daily", "weekly"]).optional(),
  digestTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Time must be HH:MM")
    .optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Time must be HH:MM")
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Time must be HH:MM")
    .nullable()
    .optional(),
  mentionEscalation: z.boolean().optional(),
});

/* ──────────────────────────────────────────────────────────────────────── */
/*  Profile v2 — Workflow tab autosave actions                               */
/* ──────────────────────────────────────────────────────────────────────── */

const OooSchema = z
  .object({
    enabled: z.boolean(),
    oooStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-mm-dd").nullable().optional(),
    oooEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-mm-dd").nullable().optional(),
    oooDelegateId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => {
    if (!v.enabled) return true;
    return !!v.oooStart && !!v.oooEnd;
  }, { message: "Provide both start and end dates when turning OOO on." });

export async function setOoo(
  input: z.infer<typeof OooSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = OooSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }

  const patch = parsed.data.enabled
    ? {
        oooStart: parsed.data.oooStart ?? null,
        oooEnd: parsed.data.oooEnd ?? null,
        oooDelegateId: parsed.data.oooDelegateId ?? null,
      }
    : { oooStart: null, oooEnd: null, oooDelegateId: null };

  if (parsed.data.oooDelegateId && parsed.data.oooDelegateId === me.id) {
    return { ok: false, error: "You can't delegate to yourself." };
  }

  try {
    await db.update(employees).set(patch).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  return { ok: true };
}

const WorkingHoursSchema = z.object({
  timezone: z.string().trim().min(1).max(64).optional(),
  workingHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  workingHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  workingDays: z.array(z.number().int().min(1).max(7)).optional(),
  availabilityAutoRevertAt: z.coerce.date().nullable().optional(),
});

export async function setWorkingHours(
  input: z.infer<typeof WorkingHoursSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = WorkingHoursSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No changes." };
  }

  try {
    await db.update(employees).set(parsed.data).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  return { ok: true };
}

import {
  appendPin,
  removePin,
  reorderPins,
  type PinKind,
} from "@/lib/profile/pinned-items";

const PinKindSchema = z.enum(["task", "project", "document"]);

export async function pinItem(
  kind: PinKind,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsedKind = PinKindSchema.safeParse(kind);
  const parsedId = z.string().uuid().safeParse(itemId);
  if (!parsedKind.success || !parsedId.success) {
    return { ok: false, error: "Invalid pin reference." };
  }

  try {
    await appendPin(me.id, parsedKind.data, parsedId.data);
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.pinnedItems(me.id));
  return { ok: true };
}

export async function unpinItem(
  pinId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z.string().uuid().safeParse(pinId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid pin id." };
  }

  try {
    await removePin(me.id, parsed.data);
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.pinnedItems(me.id));
  return { ok: true };
}

export async function reorderPinnedItems(
  orderedPinIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z.array(z.string().uuid()).safeParse(orderedPinIds);
  if (!parsed.success) {
    return { ok: false, error: "Invalid order list." };
  }

  try {
    await reorderPins(me.id, parsed.data);
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.pinnedItems(me.id));
  return { ok: true };
}

export async function setDigestAndQuietPrefs(
  input: z.infer<typeof DigestPrefsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DigestPrefsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No changes." };
  }

  // If only one of (start, end) is provided, both must coexist or both null.
  const next = parsed.data;
  if (
    (next.quietHoursStart !== undefined || next.quietHoursEnd !== undefined) &&
    (next.quietHoursStart == null) !== (next.quietHoursEnd == null)
  ) {
    return {
      ok: false,
      error: "Provide both quiet-hours start and end, or clear both.",
    };
  }

  try {
    await db.update(employees).set(next).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  return { ok: true };
}
