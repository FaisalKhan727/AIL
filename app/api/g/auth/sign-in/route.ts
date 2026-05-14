import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  GUARD_SESSION_COOKIE,
  generateSessionToken,
  sessionExpiry,
  verifyPin,
} from "@/lib/guard-auth";

interface SignInBody {
  phone?: string;
  pin?: string;
}

/**
 * Phone + PIN sign-in. Returns a session cookie on success.
 *
 * Looks up GuardIdentity by phone (E.164 globally unique). Verifies PIN
 * against the associated GuardAccount.pinHash.
 *
 * 401 on any auth failure with a generic message — does NOT distinguish
 * "phone not found" from "wrong PIN" to avoid phone enumeration.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as SignInBody | null;
  const phone = body?.phone?.trim();
  const pin = body?.pin;

  if (!phone || !pin) {
    return NextResponse.json({ error: "Phone and PIN are required" }, { status: 400 });
  }
  if (!/^\+\d{8,15}$/.test(phone)) {
    return NextResponse.json({ error: "Phone must be E.164 format" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 6 digits" }, { status: 400 });
  }

  const identity = await prisma.guardIdentity.findUnique({
    where: { phone },
    include: { account: true },
  });

  const account = identity?.account;
  const valid = account?.pinHash ? await verifyPin(pin, account.pinHash) : false;

  if (!identity || !account || !valid) {
    return NextResponse.json(
      { error: "Phone or PIN incorrect" },
      { status: 401 },
    );
  }

  if (account.suspendedAt) {
    return NextResponse.json(
      { error: "Account suspended — contact your roster manager" },
      { status: 403 },
    );
  }

  const { token, tokenHash } = generateSessionToken();
  await prisma.guardSession.create({
    data: {
      guardAccountId: account.id,
      tokenHash,
      expiresAt: sessionExpiry(),
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        null,
    },
  });

  await prisma.guardAccount.update({
    where: { id: account.id },
    data: { lastSeenAt: new Date(), appActivated: true },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GUARD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: sessionExpiry(),
  });
  return response;
}
