import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * AES-256-GCM encryption for CA-Handover credentials (passwords are stored
 * ENCRYPTED at rest — never plaintext). Stored format: `v1:iv:tag:ciphertext`
 * (each part base64). Decryption is server-only and gated behind a reveal action.
 *
 * Key: prefer a dedicated `ACCOUNTS_ENC_KEY` (32 bytes, hex or base64). If absent,
 * derive one deterministically from `COOKIE_SECRET_CURRENT` (already set in prod)
 * via scrypt — so encryption works out of the box. Set ACCOUNTS_ENC_KEY to rotate
 * independently of the cookie secret.
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ACCOUNTS_ENC_KEY;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
  }
  const secret = process.env.COOKIE_SECRET_CURRENT;
  if (!secret) throw new Error("No encryption key: set ACCOUNTS_ENC_KEY or COOKIE_SECRET_CURRENT.");
  cachedKey = scryptSync(secret, "altus-accounts-ca-handover-v1", 32);
  return cachedKey;
}

/** Encrypt a plaintext secret. Empty/blank → null (nothing to store). */
export function encryptSecret(plain: string | null | undefined): string | null {
  const v = (plain ?? "").toString();
  if (!v) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(v, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a stored secret. Returns "" for null/blank; throws on tampering. */
export function decryptSecret(enc: string | null | undefined): string {
  if (!enc) return "";
  const parts = enc.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    // Tolerate any legacy plaintext that predates encryption rather than throwing.
    return enc;
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, "base64")), decipher.final()]).toString("utf8");
}
