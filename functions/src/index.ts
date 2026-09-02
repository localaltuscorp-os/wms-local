import * as admin from "firebase-admin";
import { beforeUserCreated } from "firebase-functions/v2/identity";

admin.initializeApp();

/**
 * Sets the `role: "authenticated"` custom claim on every new Firebase user.
 * This claim is REQUIRED for Supabase Third-Party Auth to treat the user as
 * non-anonymous — without it every RLS policy fails silently.
 *
 * Triggered automatically by Firebase Auth before user creation.
 */
export const setAuthClaim = beforeUserCreated(async (event) => {
  return {
    customClaims: { role: "authenticated" },
  };
});
