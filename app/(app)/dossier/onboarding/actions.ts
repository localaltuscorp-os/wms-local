"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";
import { listOnboardingInviteTargets, getMyOnboardingStatus } from "@/lib/queries/onboarding";
import { sendOnboardingInviteEmail } from "@/lib/email/onboarding-email";
import { siteUrl } from "@/lib/site-url";
import { rateLimitOrError } from "@/lib/rate-limit";
import { saveOnboardingSubmission, mintOnboardingUploadUrl } from "@/lib/dossier/onboarding-submit";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function isAdmin(me: Employee) {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Save (or submit) an employee's onboarding form — the SIGNED-IN door. Self fills
 * their own; admins and HR staff fill anyone's. The form rules themselves live in
 * lib/dossier/onboarding-submit.ts, shared with the candidate no-login door
 * (app/c/onboarding/actions.ts).
 */
export async function submitOnboarding(form: FormData): Promise<Result<{ status: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Missing employee." };
  // WHOSE form is decided by the posted `employeeId`, never by the session — the
  // whole point is that HR fills and corrects OTHER people's forms. The session
  // only decides whether they are ALLOWED to.
  if (employeeId !== me.id && !isAdmin(me) && !(await isHrStaff(me).catch(() => false))) {
    return { ok: false, error: "Forbidden" };
  }

  return saveOnboardingSubmission(form, { employeeId, actorId: me.id });
}

/**
 * Signed upload URL for one onboarding attachment. Authorization mirrors
 * submitOnboarding exactly: self, admin, or HR staff, for the named employee only.
 */
export async function createOnboardingUploadUrl(input: {
  employeeId: string;
  key: string;
  fileName: string;
  mime?: string | null;
  size?: number;
}): Promise<Result<{ path: string; token: string; bucket: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(input.employeeId ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Missing employee." };
  if (employeeId !== me.id && !isAdmin(me) && !(await isHrStaff(me).catch(() => false))) {
    return { ok: false, error: "Forbidden" };
  }
  return mintOnboardingUploadUrl(employeeId, input);
}

/**
 * Email EVERY active employee whose onboarding is NOT yet submitted a warm
 * branded "Complete your Onboarding Form" invite (button → the hardcoded public
 * prod URL + the document checklist). HR-staff / admin gated. Per-recipient
 * try/catch so one bad address never aborts the run; employees with no email are
 * skipped upstream. Safe to re-run (idempotent nudge).
 */
export async function sendOnboardingInvites(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  error?: string;
}> {
  const me = await requireUser();
  if (!(await isHrStaff(me)) && !isAdmin(me)) {
    return { ok: false, sent: 0, skipped: 0, error: "Forbidden" };
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, sent: 0, skipped: 0, error: limited.error };

  let targets: Array<{ id: string; name: string; email: string }>;
  try {
    targets = await listOnboardingInviteTargets();
  } catch (err) {
    return { ok: false, sent: 0, skipped: 0, error: err instanceof Error ? err.message : "Could not load recipients." };
  }

  const base = siteUrl();
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const res = await sendOnboardingInviteEmail({ recipient: { email: t.email, name: t.name }, siteUrl: base });
      if (res.error) skipped += 1;
      else sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { ok: true, sent, skipped };
}

/**
 * Client-callable status for the app-wide onboarding nudge banner. Kept OFF the
 * SSR/dashboard load path — the banner calls this after mount (and only when the
 * session isn't dismissed), so it never adds a blocking query to page render.
 */
export async function getMyOnboardingStatusAction(): Promise<{ submitted: boolean }> {
  return getMyOnboardingStatus();
}
