// lib/auth/founder.ts
/** The single founder. The "Founder / Management" bucket on the Manager
 *  Initiator dashboard is keyed off THIS, never `manager_id IS NULL` (managers
 *  currently have no manager assigned and must not count as founders). */
export const FOUNDER_EMAIL = "manan@unleashed.in";

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FOUNDER_EMAIL;
}
