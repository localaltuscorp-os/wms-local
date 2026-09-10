"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAttendanceAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { orgSettings } from "@/db/schema";
import { setDeviceStatus } from "@/lib/attendance/mobile-devices";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_OR_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/* approveDevice REMOVED 2026-09-09. Employees register their own devices and
 * they work immediately, so there is no approval to grant. Revoke (below) is
 * kept: retiring a lost or suspicious device is a real, still-needed power, and
 * it is what frees a capped slot. */

/** Revoke a device (lost / replaced / suspicious) — it can no longer punch. */
export async function revokeDevice(deviceRowId: string): Promise<Result> {
  const me = await requireAttendanceAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(deviceRowId)) return { ok: false, error: "Invalid device." };
  const res = await setDeviceStatus(deviceRowId, "revoked", me.id);
  if (res.ok) revalidatePath("/attendance/devices");
  return res;
}

/**
 * Set the office-network allowlist (public IPs / CIDRs) that WEB attendance must
 * come from — closes the browser "punch from home" bypass. Empty = gate OFF
 * (nobody locked out). Super-admin only: it governs attendance for everyone.
 */
export async function setOfficeIpAllowlist(ips: string[]): Promise<Result> {
  // Was super-admin; now the attendance administrators, per the rule that ONLY
  // they may change attendance settings. Note this is a NARROWING as well as a
  // widening: a super-admin who is not an attendance administrator loses it.
  const me = await requireAttendanceAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = Array.from(new Set((ips ?? []).map((s) => s.trim()).filter(Boolean))).slice(0, 20);
  const bad = clean.find((s) => !IPV4_OR_CIDR.test(s));
  if (bad) return { ok: false, error: `"${bad}" isn't a valid IPv4 address or CIDR.` };

  try {
    await db
      .update(orgSettings)
      .set({ officeIpAllowlist: clean.length ? clean : null, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/attendance/devices");
  return { ok: true };
}
