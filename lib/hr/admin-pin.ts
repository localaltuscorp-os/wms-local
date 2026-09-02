import "server-only";

/**
 * Secondary Admin PIN — a scrypt-hashed org-level PIN required to confirm
 * sensitive actions (publishing a policy edit). Stored in org_settings.admin_pin_hash.
 * Server-only (node crypto + db). Never returns or logs the PIN or the hash.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings } from "@/db/schema";

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${dk}`;
}

function verifyHash(pin: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, dk] = parts as [string, string, string];
  const orig = Buffer.from(dk, "hex");
  const calc = scryptSync(pin, salt, 32);
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

export async function setAdminPin(pin: string): Promise<void> {
  await db.update(orgSettings).set({ adminPinHash: hashPin(pin) }).where(eq(orgSettings.id, 1));
}

export async function hasAdminPin(): Promise<boolean> {
  const [row] = await db
    .select({ h: orgSettings.adminPinHash })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return Boolean(row?.h);
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (!pin) return false;
  const [row] = await db
    .select({ h: orgSettings.adminPinHash })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  if (!row?.h) return false;
  return verifyHash(pin, row.h);
}
