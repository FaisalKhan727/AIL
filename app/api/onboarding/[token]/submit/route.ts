import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashOnboardingToken } from "@/lib/onboarding/token";

/**
 * POST /api/onboarding/[token]/submit
 *
 * Marks the session COMPLETED, stamps Guard.onboardingStatus = COMPLETE,
 * writes a SopAcknowledgement row, and (in step 6 of the build) will
 * trigger PDF generation. For now PDFs are deferred — the data is all
 * captured and the guard's onboarding state flips.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const tokenHash = hashOnboardingToken(params.token);
  const session = await prisma.onboardingSession.findUnique({
    where: { tokenHash },
    include: { data: true, guard: true },
  });
  if (!session) return NextResponse.json({ error: "Invalid onboarding link" }, { status: 404 });
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed" }, { status: 410 });
  }
  if (session.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  if (!session.data) {
    return NextResponse.json({ error: "No data captured yet" }, { status: 400 });
  }

  // Sanity: every required field across all steps must be present.
  const d = session.data;
  const required: Record<string, unknown> = {
    legalName: d.legalName,
    dateOfBirth: d.dateOfBirth,
    residentialAddress: d.residentialAddress,
    email: d.email,
    emergencyContactName: d.emergencyContactName,
    emergencyContactPhone: d.emergencyContactPhone,
    workingRightsStatus: d.workingRightsStatus,
    tfn: d.tfnEncrypted,
    bankAccountName: d.bankAccountName,
    bankBsb: d.bankBsbEncrypted,
    bankAccountNumber: d.bankAccountNumberEncrypted,
    licenceNumber: d.licenceNumber,
    licenceClass: d.licenceClass,
    licenceExpiry: d.licenceExpiry,
    sopAcknowledgedAt: d.sopAcknowledgedAt,
    contractSignatureName: d.contractSignatureName,
    contractSignedAt: d.contractSignedAt,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => v === null || v === undefined || v === "")
    .map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const now = new Date();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  await prisma.$transaction([
    prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        currentStep: 7,
      },
    }),
    prisma.guard.update({
      where: { id: session.guardId },
      data: {
        onboardingStatus: "COMPLETE",
        onboardingCompletedAt: now,
        latestOnboardingSessionId: session.id,
        // Copy licence details onto the canonical Guard record so
        // existing /api/guards reads pick them up.
        licenceNumber: d.licenceNumber,
        licenceExpiry: d.licenceExpiry,
        email: d.email ?? session.guard.email,
      },
    }),
    // SopAcknowledgement (idempotent via the (guardId, sopVersionId, source)
    // unique constraint — re-completing onboarding will silently no-op).
    prisma.sopAcknowledgement.upsert({
      where: {
        guardId_sopVersionId_source: {
          guardId: session.guardId,
          sopVersionId: d.sopVersionId!,
          source: "ONBOARDING",
        },
      },
      create: {
        companyId: session.companyId,
        guardId: session.guardId,
        sopVersionId: d.sopVersionId!,
        ipAddress: ip,
        userAgent: ua,
        source: "ONBOARDING",
      },
      update: { acknowledgedAt: now, ipAddress: ip, userAgent: ua },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
