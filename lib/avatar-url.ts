/**
 * Whether a value is acceptable to store as `employees.avatar_url`.
 *
 * The avatar can be:
 *  - "" (empty) — clears the avatar, falls back to initials.
 *  - an absolute http(s) URL — a pasted public CDN/Gravatar link.
 *  - a root-relative same-origin path — the built-in preset characters
 *    (`/avatars/preset-01.svg`) and uploaded avatars served from our own
 *    routes. These are rendered only as `<img src>`, so same-origin
 *    relative paths are safe.
 *
 * Protocol-relative URLs (`//evil.com/x.png`) are rejected: they look
 * relative but resolve to an external origin.
 */
export function isAcceptableAvatarUrl(value: string): boolean {
  if (value === "") return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return false;
}
