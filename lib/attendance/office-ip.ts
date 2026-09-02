import "server-only";
import { headers } from "next/headers";

/**
 * Office Wi-Fi gate for attendance. The punch must originate from the office's
 * public IP — something a mock-GPS app on the phone cannot fake (the IP is the
 * network's, decided server-side from the request headers). NULL/empty allowlist
 * = gate OFF (safe rollout: nobody is locked out until an admin captures the IP).
 *
 * Honest limits (documented for whoever maintains this): this proves the request
 * left the office network, not that the human is in the building. It's defeated
 * by a VPN/SSH tunnel into the office, and can false-positive under CGNAT where
 * an ISP shares one IP across buildings. It is NOT native-grade mock detection —
 * that requires the Expo app (isFromMockProvider / Play Integrity). But it does
 * defeat the actual observed attack: marking attendance from home via fake GPS.
 */

/** The real client public IP, from the proxy headers Vercel sets. First hop of
 *  x-forwarded-for is the client; fall back to x-real-ip. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || null;
}

/** IPv4 dotted-quad → 32-bit unsigned int, or null if not a v4 address. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255 || !/^\d+$/.test(p)) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

/** Does `ip` match a single allowlist entry? Supports exact match and IPv4 CIDR
 *  (e.g. "203.0.113.0/24"). IPv6 is matched only exactly (normalised lower). */
function matchesEntry(ip: string, entry: string): boolean {
  const e = entry.trim();
  if (!e) return false;
  if (e.includes("/")) {
    const [net, bitsRaw] = e.split("/");
    const bits = Number(bitsRaw);
    const ipN = ipv4ToInt(ip);
    const netN = net ? ipv4ToInt(net) : null;
    if (ipN == null || netN == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return false;
    }
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipN & mask) === (netN & mask);
  }
  return ip.trim().toLowerCase() === e.toLowerCase();
}

export interface OfficeIpVerdict {
  /** True when an allowlist is configured (gate active). */
  configured: boolean;
  /** True when the request is allowed (gate off, or IP is on the list). */
  allowed: boolean;
  /** The detected client IP (for the admin capture UI + audit). */
  ip: string | null;
}

/** Evaluate the office-Wi-Fi gate for the current request. */
export async function evaluateOfficeIp(
  allowlist: string[] | null | undefined,
): Promise<OfficeIpVerdict> {
  const list = (allowlist ?? []).map((s) => s.trim()).filter(Boolean);
  const ip = await getClientIp();
  if (list.length === 0) return { configured: false, allowed: true, ip };
  const allowed = ip != null && list.some((e) => matchesEntry(ip, e));
  return { configured: true, allowed, ip };
}
