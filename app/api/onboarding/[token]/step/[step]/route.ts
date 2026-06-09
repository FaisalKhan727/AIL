import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashOnboardingToken } from "@/lib/onboarding/token";
import { STEP_SCHEMAS } from "@/lib/onboarding/validation";

/**
 * POST /api/onboarding/[token]/step/[step]
 *
 * Validates the submitted slice of data for the requested step,
 * persists it to OnboardingData, advances currentStep on the session.
 * Idempotent: re-posting the same step overwrites the prior values
 * for that step's columns. Other steps' data is preserved.
 *
 * Step 6 (SOP) also writes a SopAcknowledgement row.
 */
export async function POST(req: Request, { params }: { params: { token: string; step: string } }) {
  const tokenHash = hashOnboardingToken(params.token);
  const stepNum = Number.parseInt(params.step, 10);

  if (!Number.isFinite(stepNum) || stepNum < 2 || stepNum > 7) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  const session = await prisma.onboardingSession.findUnique({
    where: { tokenHash },
    include: { data: true },
  });
  if (!session) return NextResponse.json({ error: "Invalid onboarding link" }, { status: 404 });
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed" }, { status: 410 });
  }
  if (session.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const raw = await req.json().catch(() => null);
  const schema = STEP_SCHEMAS[stepNum];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data as Record<string, unknown>;

  // Build the per-step column patch.
  const patch: Record<string, unknown> = {};
  if (stepNum === 2) {
    patch.legalName = data.legalName;
    patch.dateOfBirth = new Date(data.dateOfBirth as string);
    patch.residentialAddress = data.residentialAddress;
    // mobile is pre-filled from Guard.phone, displayed read-only on the
    // client, and not submitted — so there's nothing to write here.
    patch.email = data.email;
    patch.emergencyContactName = data.emergencyContactName;
    patch.emergencyContactPhone = data.emergencyContactPhone;
  }
  if (stepNum === 3) {
    patch.workingRightsStatus = data.workingRightsStatus;
    patch.visaSubclass = data.visaSubclass ?? null;
    patch.visaExpiry = data.visaExpiry ? new Date(data.visaExpiry as string) : null;
    patch.visaHoursPerFortnight = data.visaHoursPerFortnight ?? null;
  }
  if (stepNum === 4) {
    // NOTE: stored in clear during step 2 of the build. Encryption
    // lands in step 3, after which the same wire format will be
    // routed through lib/crypto.ts before persistence.
    patch.tfnEncrypted = data.tfn;
    patch.taxFreeThreshold = data.taxFreeThreshold;
    patch.bankAccountName = data.bankAccountName;
    patch.bankBsbEncrypted = (data.bankBsb as string).replace("-", "");
    patch.bankAccountNumberEncrypted = data.bankAccountNumber;
  }
  if (stepNum === 5) {
    patch.licenceNumber = data.licenceNumber;
    patch.licenceClass = data.licenceClass;
    patch.licenceExpiry = new Date(data.licenceExpiry as string);
    patch.licenceFrontPhotoUrl = data.licenceFrontPhotoUrl || null;
    patch.licenceBackPhotoUrl = data.licenceBackPhotoUrl || null;
  }
  if (stepNum === 6) {
    const sop = await prisma.sopVersion.findFirst({
      where: { companyId: session.companyId, isCurrent: true },
      select: { id: true },
    });
    if (!sop) {
      return NextResponse.json({ error: "No current SOP version for this company" }, { status: 500 });
    }
    patch.sopVersionId = sop.id;
    patch.sopAcknowledgedAt = new Date();
  }
  if (stepNum === 7) {
    const contract = await prisma.contractTemplate.findFirst({
      where: { companyId: session.companyId, isCurrent: true },
      select: { id: true },
    });
    if (!contract) {
      return NextResponse.json({ error: "No current contract template for this company" }, { status: 500 });
    }
    patch.contractTemplateVersionId = contract.id;
    patch.contractSignatureName = data.contractSignatureName;
    patch.contractSignedAt = new Date();
    patch.contractSignerIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    patch.contractSignerUserAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  }

  // Strip undefineds so they don't overwrite existing values.
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete patch[k];
  }

  // Upsert OnboardingData + advance the session's currentStep.
  const nextStep = Math.max(session.currentStep, Math.min(stepNum + 1, 7));
  const newStatus = session.status === "PENDING" ? "IN_PROGRESS" : session.status;

  await prisma.$transaction([
    prisma.onboardingData.upsert({
      where: { onboardingSessionId: session.id },
      create: {
        onboardingSessionId: session.id,
        guardId: session.guardId,
        companyId: session.companyId,
        ...patch,
      },
      update: patch,
    }),
    prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        currentStep: nextStep,
        status: newStatus,
        lastSeenAt: new Date(),
      },
    }),
    prisma.guard.update({
      where: { id: session.guardId },
      data: { onboardingStatus: "IN_PROGRESS" },
    }),
  ]);

  return NextResponse.json({ ok: true, currentStep: nextStep });
}
