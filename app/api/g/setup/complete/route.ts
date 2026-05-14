import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  GUARD_SESSION_COOKIE,
  generateSessionToken,
  hashPin,
  hashToken,
  sessionExpiry,
  verifyPin,
} from "@/lib/guard-auth";

interface CompleteBody {
  token?: string;
  pin?: string;
  termsAccepted?: boolean;
  backupEmail?: string;
}

/**
 * Completes setup OR signs in an already-activated identity that received a
 * new invite from a second company.
 *
 * - New identity (no GuardAccount yet): requires `pin` + `termsAccepted`.
 *   Creates GuardAccount, GuardPreferences, and CompanyAppDispatch for the
 *   inviting Guard. Sets appActivated=true.
 * - Existing identity (has GuardAccount): requires `pin` matching the existing
 *   pinHash. Creates a CompanyAppDispatch for the inviting Guard if missing.
 *
 * On success: consumes the setup token, creates a GuardSession, sets the
 * vg_guard_session cookie (90 days).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CompleteBody | null;
  const token = body?.token;
  const pin = body?.pin;
  if (!token || !pin) {
    return NextResponse.json({ error: "Missing token or pin" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 6 digits" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const setupToken = await prisma.setupToken.findUnique({
    where: { tokenHash },
    include: {
      guardIdentity: { include: { account: true } },
      guard: true,
    },
  });

  if (!setupToken) {
    return NextResponse.json({ error: "Invalid setup link" }, { status: 404 });
  }
  if (setupToken.consumedAt) {
    return NextResponse.json(
      { error: "This setup link has already been used" },
      { status: 410 },
    );
  }
  if (setupToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Setup link expired" }, { status: 410 });
  }
  if (!setupToken.guardIdentityId || !setupToken.guardIdentity) {
    return NextResponse.json(
      { error: "Setup token has no GuardIdentity — contact admin" },
      { status: 500 },
    );
  }

  const identity = setupToken.guardIdentity;
  let guardAccountId: string;

  if (!identity.account) {
    // First-time activation — require T&C
    if (!body?.termsAccepted) {
      return NextResponse.json(
        { error: "You must accept the Terms & Privacy to set up the app" },
        { status: 400 },
      );
    }
    const pinHash = await hashPin(pin);
    const now = new Date();
    const account = await prisma.guardAccount.create({
      data: {
        guardIdentityId: identity.id,
        pinHash,
        backupEmail: body.backupEmail?.trim() || null,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        appActivated: true,
        activatedAt: now,
        lastSeenAt: now,
        preferences: { create: {} },
      },
    });
    guardAccountId = account.id;
  } else {
    // Identity already has an account — verify PIN, don't reset it.
    if (!identity.account.pinHash) {
      return NextResponse.json(
        { error: "Account exists but has no PIN — contact admin" },
        { status: 500 },
      );
    }
    const ok = await verifyPin(pin, identity.account.pinHash);
    if (!ok) {
      return NextResponse.json({ error: "PIN incorrect" }, { status: 401 });
    }
    guardAccountId = identity.account.id;
    // Refresh appActivated + lastSeen in case a previous fall-back cleared it
    await prisma.guardAccount.update({
      where: { id: guardAccountId },
      data: { appActivated: true, lastSeenAt: new Date() },
    });
  }

  // Ensure CompanyAppDispatch exists for the inviting Guard (default enabled).
  await prisma.companyAppDispatch.upsert({
    where: { guardId: setupToken.guardId },
    create: { guardId: setupToken.guardId, enabled: true },
    update: {},
  });

  // Mark setup token consumed.
  await prisma.setupToken.update({
    where: { id: setupToken.id },
    data: { consumedAt: new Date() },
  });

  // Create session.
  const { token: sessionToken, tokenHash: sessionTokenHash } = generateSessionToken();
  await prisma.guardSession.create({
    data: {
      guardAccountId,
      tokenHash: sessionTokenHash,
      expiresAt: sessionExpiry(),
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        null,
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GUARD_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: sessionExpiry(),
  });
  return response;
}
