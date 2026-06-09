import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getSmsAdapter } from "@/lib/sms";
import { generateOnboardingToken, tokenExpiry } from "@/lib/onboarding/token";

/**
 * POST /api/guards/[id]/send-onboarding-link
 *
 * Creates a fresh OnboardingSession + SMSes the guard the link. Any
 * prior PENDING / IN_PROGRESS session for the same guard is marked
 * ABANDONED so the status column on Guard reflects only the latest
 * intent.
 *
 * Logs an "ONBOARDING_LINK_SENT" AuditLog row with the actor admin.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    include: { company: { select: { name: true } } },
  });
  if (!guard) return jsonError("not found", 404);

  const { token, tokenHash } = generateOnboardingToken();
  const expiresAt = await tokenExpiry(auth.companyId);

  // Mark any older active sessions for this guard as ABANDONED first,
  // then create the new session — all in one transaction so the
  // status column stays accurate.
  const newSession = await prisma.$transaction(async (tx) => {
    await tx.onboardingSession.updateMany({
      where: {
        guardId: guard.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: { status: "ABANDONED" },
    });
    const created = await tx.onboardingSession.create({
      data: {
        companyId: auth.companyId,
        guardId: guard.id,
        tokenHash,
        tokenExpiresAt: expiresAt,
        status: "PENDING",
        currentStep: 1,
      },
    });
    await tx.guard.update({
      where: { id: guard.id },
      data: {
        latestOnboardingSessionId: created.id,
        // Don't change onboardingStatus yet — that flips to IN_PROGRESS
        // when the guard first opens the link, or COMPLETE on submit.
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorAdminUserId: auth.userId,
        action: "ONBOARDING_LINK_SENT",
        entityType: "Guard",
        entityId: guard.id,
        metadata: JSON.stringify({ sessionId: created.id, expiresAt }),
      },
    });
    return created;
  });

  const baseUrl = process.env.PUBLIC_BASE_URL ?? "";
  const link = `${baseUrl}/onboarding/${token}`;
  const body = `Hi ${guard.firstName}, please complete your onboarding for ${guard.company.name} here: ${link} (expires in 7 days).`;

  const adapter = getSmsAdapter();
  try {
    await adapter.sendSms(guard.phone, body, { guardId: guard.id });
  } catch (e: unknown) {
    return jsonError(
      e instanceof Error ? `SMS dispatch failed: ${e.message}` : "SMS dispatch failed",
      500,
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId: newSession.id,
    expiresAt,
  });
}
