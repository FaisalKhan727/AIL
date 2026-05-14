import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getSmsAdapter } from "@/lib/sms";
import { generateSessionToken } from "@/lib/guard-auth";

const SETUP_TOKEN_TTL_DAYS = 7;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: {
      company: { select: { name: true } },
      guardIdentity: { include: { account: { select: { appActivated: true } } } },
    },
  });
  if (!guard) return jsonError("not found", 404);
  if (!guard.guardIdentityId) {
    return jsonError(
      "Guard has no GuardIdentity — backfill must run first",
      500,
    );
  }

  const { token, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.setupToken.create({
    data: {
      guardId: guard.id,
      guardIdentityId: guard.guardIdentityId,
      tokenHash,
      expiresAt,
    },
  });

  const baseUrl = process.env.PUBLIC_BASE_URL ?? "";
  const link = `${baseUrl}/g/setup/${token}`;
  const alreadyActivated = guard.guardIdentity?.account?.appActivated ?? false;

  const body = alreadyActivated
    ? `${guard.company.name} has added you. Open the app to see new shifts: ${link}`
    : `${guard.company.name} invited you to install the Vigilo Guards app. Set up here: ${link} (link expires in 7 days)`;

  const adapter = getSmsAdapter();
  try {
    await adapter.sendSms(guard.phone, body, { guardId: guard.id });
    return NextResponse.json({
      ok: true,
      alreadyActivated,
      expiresAt,
    });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : "send failed", 500);
  }
}
