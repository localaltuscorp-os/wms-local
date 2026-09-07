/**
 * Canonical public base URL of this deployment, used for email links,
 * invite/password-reset continue URLs, Slack/WhatsApp callbacks, etc.
 *
 * Hardened against the most common misconfiguration: `NEXT_PUBLIC_SITE_URL`
 * set WITHOUT a scheme (e.g. `os.altuscorp.in`). Firebase's
 * `generatePasswordResetLink` rejects a scheme-less continue URL with
 * "The continue URL must be a valid URL string" (auth/invalid-continue-uri),
 * which silently breaks employee invites. We auto-prepend `https://` and
 * validate the result, falling back to the prod host if it's unusable so a
 * bad env var degrades gracefully instead of bricking the invite flow.
 *
 * Returns a URL with no trailing slash.
 */
const FALLBACK = "https://altus-corp-dashboard.vercel.app";

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const cleaned = withScheme.replace(/\/+$/, "");

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return FALLBACK;
    }
    if (!parsed.hostname) return FALLBACK;
  } catch {
    return FALLBACK;
  }

  return cleaned;
}

/**
 * Re-point a Firebase email action link at THIS deployment's origin.
 *
 * Firebase builds action links on the host in Authentication -> Templates ->
 * "Action URL" (`notification.sendEmail.callbackUri`). That value lives in
 * Firebase, not here. As of 2026-09-07 it is stuck on a host that no longer
 * resolves and cannot be changed: the Admin API rejects the patch with
 * EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED, and the console fails with "An error
 * occurred when updating action URL". Every generated link therefore 404s.
 *
 * The `oobCode` carries the reset; the host only has to serve `/set-password`,
 * which this app does. So we swap the origin and keep path and query
 * byte-for-byte -- oobCode, apiKey, continueUrl and lang are untouched.
 *
 * If the Firebase setting is ever fixed, this becomes a no-op rather than a
 * second source of truth: when the link is already on our origin it is returned
 * unchanged.
 *
 * Never throws. An unparseable link is returned as-is -- a wrong link is better
 * than an exception inside the password-reset flow.
 */
export function rehostActionLink(link: string): string {
  try {
    const u = new URL(link);
    const site = new URL(siteUrl());
    if (u.protocol === site.protocol && u.host === site.host) return link;
    u.protocol = site.protocol;
    u.host = site.host;
    return u.toString();
  } catch {
    return link;
  }
}
