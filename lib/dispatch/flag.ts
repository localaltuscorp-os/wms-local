import "server-only";

/**
 * WS-7 Dispatch — master kill-switch.
 *
 * Everything in the WS-7 dispatch slice (quarterly PMS report cron, Monday
 * attendance-confirmation reminders, and the outbound email / WhatsApp sends
 * that carry one-click approve links) is INERT until this flag is flipped on.
 * Default = OFF. The public approve route itself is NOT gated by this flag —
 * it only ever acts on a token, and no token can exist until a gated sender
 * issues one, so the whole surface is naturally dark until DISPATCH_V2=on.
 *
 * Set `DISPATCH_V2=on` (exact, lower-case) in the environment to arm sends.
 * Any other value (unset, "off", "0", "false") leaves the slice dormant.
 *
 * Optional companion `DISPATCH_V2_DRY_RUN=on` lets you arm the crons to build
 * and log payloads (recipients, links) WITHOUT actually calling Resend / Meta —
 * useful for a final pre-flight once Sir wants to verify recipient lists.
 */
export function isDispatchV2On(): boolean {
  return (process.env.DISPATCH_V2 ?? "").trim().toLowerCase() === "on";
}

export function isDispatchV2DryRun(): boolean {
  return (process.env.DISPATCH_V2_DRY_RUN ?? "").trim().toLowerCase() === "on";
}
