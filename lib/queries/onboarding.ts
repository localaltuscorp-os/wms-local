import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees, designations, candidateIntake } from "@/db/schema";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/db/with-timeout";
import type { OnboardingFileRef } from "@/lib/dossier/onboarding-schema";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/**
 * Has THIS employee's onboarding been submitted? One indexed lookup by the
 * unique `employee_id` — cheap enough to sit on the app-shell path. Fail-open:
 * any DB hiccup returns `submitted: false` (never traps the banner logic, and a
 * spurious banner is a soft nudge, not a gate).
 */
export async function isOnboardingSubmitted(employeeId: string): Promise<boolean> {
  try {
    const row = await db
      .select({ status: onboardingSubmissions.status })
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.employeeId, employeeId))
      .limit(1);
    return row[0]?.status === "submitted";
  } catch {
    return false;
  }
}

/**
 * The current signed-in user's onboarding status, for the soft in-app nudge.
 * Resolves the user internally (React-cached) so callers pass nothing. Returns
 * `submitted: true` for signed-out / error states so the banner stays hidden.
 */
export async function getMyOnboardingStatus(): Promise<{ submitted: boolean }> {
  const me = await getCurrentEmployee();
  if (!me) return { submitted: true };
  // A system service account is not a person and never onboards — never nag it.
  if (me.accountType === "system") return { submitted: true };
  return { submitted: await isOnboardingSubmitted(me.id) };
}

/**
 * Active employees who still need to complete their onboarding (status is not
 * 'submitted' — i.e. no row, or a 'draft' row) AND have an email on file. The
 * recipient set for `sendOnboardingInvites`.
 */
export async function listOnboardingInviteTargets(): Promise<
  Array<{ id: string; name: string; email: string }>
> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      status: onboardingSubmissions.status,
    })
    .from(employees)
    .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
    .where(eq(employees.isActive, true));

  return rows
    .filter((r) => r.status !== "submitted")
    .filter((r) => !!r.email && r.email.includes("@"))
    .map((r) => ({ id: r.id, name: r.name, email: r.email }));
}

export interface OnboardingFileView {
  /** True when this file was carried over from another record (the candidate
   *  intake photo), not attached on this form. */
  carriedOver?: boolean;
  fileName: string;
  mime: string | null;
  size: number | null;
  signedUrl: string | null;
  /** true when this attachment is an external link (Drive/URL), not an upload. */
  isLink: boolean;
}

export interface OnboardingView {
  employee: { id: string; name: string; avatarUrl: string | null; designation: string | null };
  exists: boolean;
  status: "draft" | "submitted" | null;
  submittedAt: string | null;
  fields: Record<string, string>;
  files: Record<string, OnboardingFileView>;
}

export async function getOnboarding(employeeId: string): Promise<OnboardingView | null> {
  const rows = await withRetry(
    () =>
      db
        .select({
          empId: employees.id,
          name: employees.name,
          avatarUrl: employees.avatarUrl,
          designation: designations.name,
          sub: onboardingSubmissions,
          /**
           * The photo this person already gave us as a CANDIDATE, if they came
           * through hiring. Joined here rather than fetched separately because
           * it is one nullable column on a row this query already reaches
           * through `employees.candidate_intake_id`.
           */
          candidatePhotoPath: candidateIntake.photoPath,
        })
        .from(employees)
        .leftJoin(designations, eq(employees.designationId, designations.id))
        .leftJoin(candidateIntake, eq(employees.candidateIntakeId, candidateIntake.id))
        .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
        .where(eq(employees.id, employeeId))
        .limit(1),
    { ...RETRY, label: "onboarding-get" },
  );
  const row = rows[0];
  if (!row) return null;

  const sub = row.sub;
  const rawFiles = (sub?.files as Record<string, OnboardingFileRef> | null) ?? {};
  const paths = Object.values(rawFiles).map((f) => f.path).filter((p): p is string => !!p);

  /**
   * THE SELFIE CARRIES OVER FROM THE INTERVIEW FORM.
   *
   * A candidate uploads their photo on the Candidate Interview Form before
   * they are hired; asking the same person for the same photograph again on
   * day one is a question we already know the answer to.
   *
   * Only when they have NOT attached one here. An uploaded selfie always wins:
   * the carried-over photo is a default, not an override, or editing your own
   * onboarding form would silently revert to the hiring photo.
   *
   * It is signed and shown but NOT copied into `onboarding_submissions.files`.
   * The candidate intake row owns that object, and duplicating the key into a
   * second table would leave two records pointing at one file with nothing
   * saying which may delete it. On submit the employee either keeps what is
   * shown or attaches their own; the stored form is unchanged by merely
   * displaying this.
   */
  const carriedSelfie = row.candidatePhotoPath;
  if (carriedSelfie && !rawFiles.selfie) paths.push(carriedSelfie);

  const signed = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, 3600);
      for (const r of data ?? []) if (r.path && r.signedUrl) signed.set(r.path, r.signedUrl);
    } catch {
      /* leave unsigned — the view shows "unavailable" */
    }
  }

  const files: Record<string, OnboardingFileView> = {};
  for (const [key, f] of Object.entries(rawFiles)) {
    const isLink = !!f.link && !f.path;
    files[key] = {
      fileName: f.fileName ?? f.link ?? "",
      mime: f.mime ?? null,
      size: f.size ?? null,
      signedUrl: f.path ? signed.get(f.path) ?? null : f.link ?? null,
      isLink,
    };
  }

  if (carriedSelfie && !files.selfie) {
    files.selfie = {
      fileName: "Photo from your interview form",
      mime: null,
      size: null,
      signedUrl: signed.get(carriedSelfie) ?? null,
      isLink: false,
      /** Says where it came from, so the form can label it rather than imply
       *  the employee attached it themselves. */
      carriedOver: true,
    };
  }

  return {
    employee: {
      id: row.empId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      designation: row.designation ?? null,
    },
    exists: !!sub,
    status: (sub?.status as "draft" | "submitted" | undefined) ?? null,
    submittedAt: sub?.submittedAt ? String(sub.submittedAt) : null,
    fields: (sub?.fields as Record<string, string> | null) ?? {},
    files,
  };
}
