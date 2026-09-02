/**
 * THE CHECKOUT CLOSE-OUT GATE — its destination and its wording.
 *
 * These two constants lived in `app/(app)/attendance/actions.ts` until they
 * broke the build: that file carries the `"use server"` directive, and such a
 * module may export ONLY async functions. Next enforces it at compile time —
 * "Only async functions are allowed to be exported in a 'use server' file" —
 * so a plain `export const` beside the actions is a hard build failure, not a
 * lint warning. The values were always ordinary data, so they belong in an
 * ordinary module.
 *
 * Being here also delivers what the original comment promised. A `"use server"`
 * module cannot be imported by a client component for its constants, so the
 * punch card could never actually have shared them; this file can be imported
 * from either side.
 *
 * WHY THE DESTINATION IS A VALUE AND NOT A STRING MATCH: the punch card already
 * routes two other ritual gates by sniffing the error text for "Goals › Commit"
 * / "Goals › Approve". That works until someone rewords a message, at which
 * point the deep link silently stops happening and nobody notices. The gate
 * returns this destination explicitly on the refusal, so a copy edit can never
 * break the navigation.
 */

/** Where a blocked checkout sends you — the Daily Goals close-out. */
export const CLOSEOUT_REDIRECT_TO = "/my-day";

/** What the refusal says. Safe to reword; nothing branches on the text. */
export const CLOSEOUT_BLOCK_MESSAGE =
  "Please finish your day before checking out. Review your day and click Finish My Day to complete checkout.";
