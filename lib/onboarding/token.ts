/**
 * Onboarding token helpers — same crypto pattern as lib/guard-auth.ts
 * (random 32 bytes → base64url URL token; SHA-256 hash stored in DB).
 *
 * Default TTL is 7 days; admin can override per-company via the
 * `onboarding.token_ttl_days` Setting.
 */

import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_DAYS = 7;

export interface IssuedToken {
  /** Base64url string to put in the URL — never persisted. */
  token: string;
  /** SHA-256 of the token, stored as OnboardingSession.tokenHash. */
  tokenHash: string;
}

export function generateOnboardingToken(): IssuedToken {
  const raw = randomBytes(32);
  const token = raw.toString("base64url");
  const tokenHash = hashOnboardingToken(token);
  return { token, tokenHash };
}

export function hashOnboardingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Lookup the TTL for a company. Falls back to the default if the
 * Setting isn't set yet.
 */
export async function getTokenTtlMs(companyId: string): Promise<number> {
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: "onboarding.token_ttl_days" } },
  });
  const days = row ? Number.parseInt(row.value, 10) : DEFAULT_TTL_DAYS;
  const effective = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
  return effective * 24 * 60 * 60 * 1000;
}

export async function tokenExpiry(companyId: string): Promise<Date> {
  const ms = await getTokenTtlMs(companyId);
  return new Date(Date.now() + ms);
}
