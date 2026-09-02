import "server-only";
import { cookies } from "next/headers";

/**
 * Personal | Professional goal SPACE (migration 0150). Admins get a private
 * "personal" goals world alongside the shared "professional" module; non-admins
 * only ever see professional. The active space is remembered in a cookie the
 * sidebar toggle writes; every goals loader filters `goals.scope` by it.
 */

export type GoalsSpace = "professional" | "personal";

export const GOALS_SPACE_COOKIE = "goals_space";

/** Resolve the active space. Non-admins are ALWAYS forced to professional so
 *  their experience is unchanged; admins get whatever the cookie says. */
export async function goalsSpace(isAdmin: boolean): Promise<GoalsSpace> {
  if (!isAdmin) return "professional";
  const v = (await cookies()).get(GOALS_SPACE_COOKIE)?.value;
  return v === "personal" ? "personal" : "professional";
}
