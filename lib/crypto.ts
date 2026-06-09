import crypto from "node:crypto";

/**
 * Field-level encryption for sensitive PII (TFN, BSB, bank account number).
 *
 * Format: `enc:v1:<base64(iv || tag || ciphertext)>`
 * - Algorithm: AES-256-GCM
 * - IV: 12 random bytes per encryption (never reused)
 * - Auth tag: 16 bytes (GCM authenticated tag)
 * - Versioned prefix so future key-rotation / algorithm changes can
 *   coexist with legacy ciphertexts (look for `enc:v2:` etc.)
 *
 * Key: 32 bytes (256 bits), base64-encoded in `ENCRYPTION_KEY` env var.
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Loss of the key = permanent loss of decryption ability. Store it in
 * Vercel encrypted env vars and in 1Password (or your password manager
 * of choice). It is NOT in the repo.
 */

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). Regenerate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

/** True when the value is in the documented `enc:v1:` envelope. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encrypt: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(envelope: string): string {
  if (!isEncrypted(envelope)) {
    throw new Error("decrypt: value is not in the enc:v1: envelope format");
  }
  const key = getKey();
  const raw = Buffer.from(envelope.slice(PREFIX.length), "base64");
  if (raw.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("decrypt: envelope is malformed (too short)");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Encrypts only if the value isn't already encrypted. Use this when
 * re-running ingest paths or backfills against rows that may already
 * be in the new format.
 */
export function encryptIfPlain(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}
