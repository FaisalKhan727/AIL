// Encryption for third-party tokens at rest (AES-256-GCM). The key comes from
// INTEGRATIONS_KEY, or NEXTAUTH_SECRET when that isn't set. Rotating the key
// means reconnecting integrations.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const secret = process.env.INTEGRATIONS_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Set INTEGRATIONS_KEY (or NEXTAUTH_SECRET) to store integration tokens.");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

export function decrypt(enc: string): string {
  if (!enc.startsWith("v1:")) throw new Error("Unknown token format");
  const raw = Buffer.from(enc.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

/** Signed, expiring value for OAuth `state`. */
export function signState(payload: string): string {
  const ts = Date.now().toString(36);
  const nonce = randomBytes(9).toString("base64url");
  const body = `${payload}.${ts}.${nonce}`;
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60_000): string | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [payload, ts, nonce, mac] = parts;
  const expect = createHmac("sha256", key()).update(`${payload}.${ts}.${nonce}`).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() - parseInt(ts, 36) > maxAgeMs) return null;
  return payload;
}
