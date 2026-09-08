/**
 * Canonical public base URL of this deployment, used for email links,
 * invite/password-reset continue URLs, Slack/WhatsApp callbacks, etc.
 *
 * Hardened against the most common misconfiguration: `NEXT_PUBLIC_SITE_URL`
 * set WITHOUT a scheme (e.g. `wms.mananvasa.com`). Firebase's
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
