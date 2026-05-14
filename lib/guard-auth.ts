/**
 * Guard authentication — completely separate from admin (NextAuth).
 *
 * Sessions:
 *   - Opaque random 32-byte token, base64url-encoded.
 *   - Stored hashed (SHA-256) in GuardSession.tokenHash.
 *   - Cookie name: vg_guard_session. httpOnly, sameSite=lax, scope=/, 90-day TTL.
 *   - Each request hits the DB once to validate (token → guardAccountId).
 *
 * PIN:
 *   - 6 digits, hashed with bcrypt (cost 12).
 *
 * Cross-company resource validation:
 *   - Every API endpoint that touches a per-company resource must call
 *     assertGuardOwnsCompanyResource(guardCtx, companyId) before any read/write.
 *     A guard signing in only proves identity — it does NOT grant access to
 *     companies they don't have a Guard row for.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const GUARD_SESSION_COOKIE = "vg_guard_session";
const SESSION_TTL_DAYS = 90;
const PIN_BCRYPT_COST = 12;

export type GuardMembership = {
  guardId: string;
  companyId: string;
  companyName: string;
  companyBrandColour: string | null;
};

export type GuardContext = {
  guardIdentityId: string;
  guardAccountId: string;
  firstName: string;
  lastName: string;
  phone: string;
  memberships: GuardMembership[];
};

// ---------- token helpers ----------

export function generateSessionToken(): { token: string; tokenHash: string } {
  const raw = randomBytes(32);
  const token = raw.toString("base64url");
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ---------- PIN helpers ----------

export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN must be exactly 6 digits");
  }
  return bcrypt.hash(pin, PIN_BCRYPT_COST);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) return false;
  return bcrypt.compare(pin, pinHash);
}

// ---------- session resolution ----------

/**
 * Read the guard session cookie, look up the session in the DB, and return
 * full guard context (identity + all company memberships). Returns null if
 * no session, revoked, expired, or the underlying account is suspended.
 *
 * Updates lastUsedAt and account.lastSeenAt as a side effect (rolling session).
 */
export async function getGuardContext(): Promise<GuardContext | null> {
  const cookieStore = cookies();
  const cookie = cookieStore.get(GUARD_SESSION_COOKIE);
  if (!cookie?.value) return null;

  const tokenHash = hashToken(cookie.value);
  const session = await prisma.guardSession.findUnique({
    where: { tokenHash },
    include: {
      guardAccount: {
        include: {
          guardIdentity: {
            include: {
              employments: {
                where: { active: true },
                include: { company: { select: { name: true, brandColour: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.guardAccount.suspendedAt) return null;

  // Touch session + account so we know they're alive.
  await prisma.$transaction([
    prisma.guardSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    }),
    prisma.guardAccount.update({
      where: { id: session.guardAccountId },
      data: { lastSeenAt: new Date() },
    }),
  ]);

  const identity = session.guardAccount.guardIdentity;
  return {
    guardIdentityId: identity.id,
    guardAccountId: session.guardAccount.id,
    firstName: identity.firstName,
    lastName: identity.lastName,
    phone: identity.phone,
    memberships: identity.employments.map((e) => ({
      guardId: e.id,
      companyId: e.companyId,
      companyName: e.company.name,
      companyBrandColour: e.company.brandColour,
    })),
  };
}

/**
 * For use inside /api/g/* route handlers. Returns either the GuardContext
 * or an early-return NextResponse with the correct error status.
 */
export async function requireGuard(): Promise<
  { ok: true; guard: GuardContext } | { ok: false; response: NextResponse }
> {
  const guard = await getGuardContext();
  if (!guard) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { ok: true, guard };
}

/**
 * Strict tenant guard. Must be called before reading/writing any company-scoped
 * resource. Pass the resource's companyId. Returns 403 if the guard isn't
 * a member of that company.
 */
export function assertGuardOwnsCompany(
  ctx: GuardContext,
  companyId: string,
): NextResponse | null {
  const membership = ctx.memberships.find((m) => m.companyId === companyId);
  if (!membership) {
    return NextResponse.json(
      { error: "Forbidden: guard is not a member of this company" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Same as assertGuardOwnsCompany but takes a Guard row id (company-scoped record).
 * Useful when an endpoint receives a guardId in the request and needs to verify
 * it belongs to the signed-in identity.
 */
export function assertGuardOwnsGuardId(
  ctx: GuardContext,
  guardId: string,
): NextResponse | null {
  if (!ctx.memberships.some((m) => m.guardId === guardId)) {
    return NextResponse.json(
      { error: "Forbidden: guard id does not belong to current identity" },
      { status: 403 },
    );
  }
  return null;
}
