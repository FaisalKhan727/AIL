import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { isEncrypted } from "@/lib/crypto";

/**
 * GET /api/guards/[id]/onboarding
 *
 * Returns the latest OnboardingSession for the guard + the captured
 * data. Sensitive fields (TFN, BSB, account number) are returned
 * MASKED. The plaintext lives behind the OWNER gate on
 * /api/guards/[id]/onboarding/decrypt, which writes an AuditLog row
 * for every reveal.
 *
 * - encrypted column → returns the fixed "•••••" mask so the API
 *   never leaks length or partial content
 * - legacy cleartext column (data captured before encryption deploy
 *   and before the backfill script ran) → falls back to masking the
 *   tail off the cleartext, same as the pre-step-3 behaviour
 */
const ENCRYPTED_MASK = "••••••••";
function maskField(value: string | null | undefined, keepLast: number): string | null {
  if (!value) return null;
  if (isEncrypted(value)) return ENCRYPTED_MASK;
  const trimmed = value.trim();
  if (trimmed.length <= keepLast) return trimmed;
  const last = trimmed.slice(-keepLast);
  return "•".repeat(Math.max(0, trimmed.length - keepLast)) + last;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: {
      id: true,
      onboardingStatus: true,
      onboardingCompletedAt: true,
      latestOnboardingSessionId: true,
    },
  });
  if (!guard) return jsonError("not found", 404);

  if (!guard.latestOnboardingSessionId) {
    return NextResponse.json({
      hasSession: false,
      onboardingStatus: guard.onboardingStatus,
      viewerRole: auth.role,
    });
  }

  const session = await prisma.onboardingSession.findUnique({
    where: { id: guard.latestOnboardingSessionId },
    include: { data: true },
  });
  if (!session) {
    return NextResponse.json({
      hasSession: false,
      onboardingStatus: guard.onboardingStatus,
      viewerRole: auth.role,
    });
  }

  let sopLabel: string | null = null;
  if (session.data?.sopVersionId) {
    const sop = await prisma.sopVersion.findUnique({
      where: { id: session.data.sopVersionId },
      select: { version: true, title: true },
    });
    if (sop) sopLabel = `${sop.title} (v${sop.version})`;
  }

  let contractLabel: string | null = null;
  if (session.data?.contractTemplateVersionId) {
    const c = await prisma.contractTemplate.findUnique({
      where: { id: session.data.contractTemplateVersionId },
      select: { version: true, name: true },
    });
    if (c) contractLabel = `${c.name} (v${c.version})`;
  }

  return NextResponse.json({
    hasSession: true,
    sessionId: session.id,
    status: session.status,
    currentStep: session.currentStep,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.tokenExpiresAt,
    sessionCompletedAt: session.completedAt,
    guardCompletedAt: guard.onboardingCompletedAt,
    onboardingStatus: guard.onboardingStatus,
    viewerRole: auth.role,
    data: session.data
      ? {
          personal: {
            legalName: session.data.legalName,
            dateOfBirth: session.data.dateOfBirth,
            residentialAddress: session.data.residentialAddress,
            mobile: session.data.mobile,
            email: session.data.email,
            emergencyContactName: session.data.emergencyContactName,
            emergencyContactPhone: session.data.emergencyContactPhone,
          },
          workingRights: {
            status: session.data.workingRightsStatus,
            visaSubclass: session.data.visaSubclass,
            visaExpiry: session.data.visaExpiry,
            visaHoursPerFortnight: session.data.visaHoursPerFortnight,
          },
          taxBank: {
            tfnMasked: maskField(session.data.tfnEncrypted, 3),
            tfnEncrypted: isEncrypted(session.data.tfnEncrypted),
            taxFreeThreshold: session.data.taxFreeThreshold,
            bankAccountName: session.data.bankAccountName,
            bankBsbMasked: maskField(session.data.bankBsbEncrypted, 3),
            bankBsbEncrypted: isEncrypted(session.data.bankBsbEncrypted),
            bankAccountNumberMasked: maskField(session.data.bankAccountNumberEncrypted, 4),
            bankAccountNumberEncrypted: isEncrypted(session.data.bankAccountNumberEncrypted),
          },
          licence: {
            number: session.data.licenceNumber,
            class: session.data.licenceClass,
            expiry: session.data.licenceExpiry,
            frontPhotoUrl: session.data.licenceFrontPhotoUrl,
            backPhotoUrl: session.data.licenceBackPhotoUrl,
          },
          sop: {
            versionLabel: sopLabel,
            acknowledgedAt: session.data.sopAcknowledgedAt,
          },
          contract: {
            templateLabel: contractLabel,
            signatureName: session.data.contractSignatureName,
            signedAt: session.data.contractSignedAt,
            signerIp: session.data.contractSignerIp,
            signerUserAgent: session.data.contractSignerUserAgent,
          },
        }
      : null,
  });
}
