import "server-only";
import { cookies, headers } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { webauthnCredentials } from "@/db/schema";

/**
 * WebAuthn plumbing for the biometric attendance punch. One challenge at a
 * time per browser, carried in a short-lived httpOnly cookie — the server
 * action sets it when minting options and consumes it on verify, so replays
 * and cross-session swaps fail closed.
 */

const CHALLENGE_COOKIE = "att_wa_chal";
const RP_NAME = "Altus Corp WMS";

async function rpContext(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return { rpID: host.split(":")[0]!, origin: `${proto}://${host}` };
}

async function setChallenge(challenge: string): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });
}

/** Read-and-burn the pending challenge — each one is single-use. */
async function consumeChallenge(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(CHALLENGE_COOKIE)?.value ?? null;
  if (value) jar.delete(CHALLENGE_COOKIE);
  return value;
}

export async function listCredentials(employeeId: string) {
  return db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.employeeId, employeeId));
}

export async function mintRegistrationOptions(me: {
  id: string;
  name: string;
  email: string;
}) {
  const { rpID } = await rpContext();
  const existing = await listCredentials(me.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(me.id),
    userName: me.email,
    userDisplayName: me.name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      // Platform = the device's own fingerprint/Face-ID sensor.
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  });
  await setChallenge(options.challenge);
  return options;
}

export async function verifyAndStoreRegistration(
  employeeId: string,
  response: RegistrationResponseJSON,
  deviceLabel: string | null,
): Promise<
  | { ok: true; isNewDevice: boolean; deviceCount: number }
  | { ok: false; error: string }
> {
  const expectedChallenge = await consumeChallenge();
  if (!expectedChallenge) {
    return { ok: false, error: "Setup expired — try again." };
  }
  const { rpID, origin } = await rpContext();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return { ok: false, error: `Could not verify this device: ${(err as Error).message}` };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "Device verification failed." };
  }
  const cred = verification.registrationInfo.credential;
  // `.returning()` is empty when the credential already existed (re-submit of
  // the same device) — lets the caller distinguish a genuinely new device,
  // which is the signal worth alerting admins on.
  const inserted = await db
    .insert(webauthnCredentials)
    .values({
      employeeId,
      credentialId: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString("base64url"),
      counter: cred.counter,
      transports: cred.transports?.join(",") ?? null,
      deviceLabel,
    })
    .onConflictDoNothing({ target: webauthnCredentials.credentialId })
    .returning({ id: webauthnCredentials.id });
  const deviceCount = (await listCredentials(employeeId)).length;
  return { ok: true, isNewDevice: inserted.length > 0, deviceCount };
}

export async function mintPunchOptions(employeeId: string) {
  const { rpID } = await rpContext();
  const creds = await listCredentials(employeeId);
  if (creds.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: parseTransports(c.transports),
    })),
  });
  await setChallenge(options.challenge);
  return options;
}

export async function verifyPunchAssertion(
  employeeId: string,
  response: AuthenticationResponseJSON,
): Promise<{ ok: true; credentialId: string } | { ok: false; error: string }> {
  const expectedChallenge = await consumeChallenge();
  if (!expectedChallenge) {
    return { ok: false, error: "Biometric check expired — punch again." };
  }
  const creds = await listCredentials(employeeId);
  const cred = creds.find((c) => c.credentialId === response.id);
  if (!cred) {
    return { ok: false, error: "This device isn't registered for biometric punch." };
  }
  const { rpID, origin } = await rpContext();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: cred.counter,
        transports: parseTransports(cred.transports),
      },
    });
  } catch (err) {
    return { ok: false, error: `Biometric verification failed: ${(err as Error).message}` };
  }
  if (!verification.verified) {
    return { ok: false, error: "Biometric verification failed." };
  }
  await db
    .update(webauthnCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: sql`now()`,
    })
    .where(eq(webauthnCredentials.id, cred.id));
  return { ok: true, credentialId: cred.credentialId };
}

function parseTransports(
  raw: string | null,
): AuthenticatorTransportFuture[] | undefined {
  return raw ? (raw.split(",") as AuthenticatorTransportFuture[]) : undefined;
}
