import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/guard-auth";

/**
 * Validates a setup link token. Returns enough info for the setup page to know
 * whether to show "new PIN" or "sign in with existing PIN".
 *
 * No side effects — does not consume the token. The token is consumed only
 * when /api/g/setup/complete succeeds.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const setupToken = await prisma.setupToken.findUnique({
    where: { tokenHash },
    include: {
      guardIdentity: { include: { account: { select: { id: true, appActivated: true } } } },
      guard: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          company: { select: { id: true, name: true, brandColour: true } },
        },
      },
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
    return NextResponse.json(
      { error: "Setup link expired — ask admin for a new one" },
      { status: 410 },
    );
  }

  const identity = setupToken.guardIdentity;
  const hasAccount = Boolean(identity?.account);

  return NextResponse.json({
    invitingCompany: setupToken.guard.company,
    identity: {
      firstName: identity?.firstName ?? setupToken.guard.firstName,
      lastName: identity?.lastName ?? setupToken.guard.lastName,
      phone: identity?.phone ?? setupToken.guard.phone,
      hasAccount,
      appActivated: identity?.account?.appActivated ?? false,
    },
  });
}
