import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { renderContractPdf } from "@/lib/onboarding/pdf-contract";
import { renderPackagePdf } from "@/lib/onboarding/pdf-package";
import { uploadPdfToBlob } from "@/lib/onboarding/pdf-storage";

/**
 * GET /api/guards/[id]/onboarding/pdf?which=contract|package[&regen=1]
 *
 * Returns the URL of the requested PDF. If a cached URL already exists
 * on OnboardingData (set by /submit at completion time), returns that
 * unless `regen=1` is passed. Otherwise renders fresh, uploads to
 * Vercel Blob, persists the URL, and returns it.
 *
 * Response: { url: string, regenerated: boolean }
 * The client can then open `url` directly in a new tab.
 *
 * Admins of any role can download; sensitive values in the package
 * PDF are always masked, so this isn't gated on OWNER.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const which = searchParams.get("which");
  const regen = searchParams.get("regen") === "1";

  if (which !== "contract" && which !== "package") {
    return jsonError('which must be "contract" or "package"', 400);
  }

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, latestOnboardingSessionId: true },
  });
  if (!guard?.latestOnboardingSessionId) {
    return jsonError("No onboarding session for this guard.", 404);
  }

  const session = await prisma.onboardingSession.findUnique({
    where: { id: guard.latestOnboardingSessionId },
    include: { data: true, company: { select: { name: true } } },
  });
  if (!session?.data) return jsonError("No onboarding data captured yet.", 404);

  const d = session.data;
  const cached = which === "contract" ? d.generatedContractPdfUrl : d.generatedPackagePdfUrl;
  if (cached && !regen) {
    return NextResponse.json({ url: cached, regenerated: false });
  }

  // Need to render. Common data lookups.
  const [contract, sop, ack] = await Promise.all([
    d.contractTemplateVersionId
      ? prisma.contractTemplate.findUnique({
          where: { id: d.contractTemplateVersionId },
          select: { name: true, version: true, templateContent: true },
        })
      : Promise.resolve(null),
    d.sopVersionId
      ? prisma.sopVersion.findUnique({
          where: { id: d.sopVersionId },
          select: { title: true, version: true },
        })
      : Promise.resolve(null),
    d.sopVersionId
      ? prisma.sopAcknowledgement.findUnique({
          where: {
            guardId_sopVersionId_source: {
              guardId: session.guardId,
              sopVersionId: d.sopVersionId,
              source: "ONBOARDING",
            },
          },
          select: { acknowledgedAt: true, ipAddress: true, userAgent: true },
        })
      : Promise.resolve(null),
  ]);

  let url: string;
  try {
    if (which === "contract") {
      if (!contract) return jsonError("Contract template missing for this session.", 500);
      if (!d.contractSignatureName || !d.contractSignedAt) {
        return jsonError("Contract not signed yet — cannot generate contract PDF.", 400);
      }
      const buffer = await renderContractPdf({
        companyName: session.company.name,
        templateName: contract.name,
        templateVersion: contract.version,
        templateContent: contract.templateContent,
        legalName: d.legalName ?? `${guard.firstName} ${guard.lastName}`,
        dateOfBirth: d.dateOfBirth,
        residentialAddress: d.residentialAddress,
        email: d.email,
        phone: d.mobile ?? guard.phone,
        licenceNumber: d.licenceNumber,
        licenceClass: d.licenceClass,
        licenceExpiry: d.licenceExpiry,
        signatureName: d.contractSignatureName,
        signedAt: d.contractSignedAt,
        signerIp: d.contractSignerIp,
        sessionId: session.id,
      });
      url = await uploadPdfToBlob(session.id, "contract", buffer);
    } else {
      const buffer = await renderPackagePdf({
        companyName: session.company.name,
        guardName: d.legalName ?? `${guard.firstName} ${guard.lastName}`,
        guardId: guard.id,
        sessionId: session.id,
        completedAt: session.completedAt ?? new Date(),
        personal: {
          legalName: d.legalName,
          dateOfBirth: d.dateOfBirth,
          residentialAddress: d.residentialAddress,
          mobile: d.mobile ?? guard.phone,
          email: d.email,
          emergencyContactName: d.emergencyContactName,
          emergencyContactPhone: d.emergencyContactPhone,
        },
        workingRights: {
          status: d.workingRightsStatus,
          visaSubclass: d.visaSubclass,
          visaExpiry: d.visaExpiry,
          visaHoursPerFortnight: d.visaHoursPerFortnight,
        },
        taxBank: {
          tfnMasked: maskTail(d.tfnEncrypted, 3),
          taxFreeThreshold: d.taxFreeThreshold,
          bankAccountName: d.bankAccountName,
          bsbMasked: maskTail(d.bankBsbEncrypted, 3),
          accountNumberMasked: maskTail(d.bankAccountNumberEncrypted, 4),
        },
        licence: {
          number: d.licenceNumber,
          classification: d.licenceClass,
          expiry: d.licenceExpiry,
          frontPhotoUrl: d.licenceFrontPhotoUrl,
          backPhotoUrl: d.licenceBackPhotoUrl,
        },
        sop: {
          title: sop?.title ?? null,
          version: sop?.version ?? null,
          acknowledgedAt: ack?.acknowledgedAt ?? null,
          ipAddress: ack?.ipAddress ?? null,
          userAgent: ack?.userAgent ?? null,
        },
        contract: {
          templateName: contract?.name ?? null,
          templateVersion: contract?.version ?? null,
          signatureName: d.contractSignatureName,
          signedAt: d.contractSignedAt,
          signerIp: d.contractSignerIp,
        },
      });
      url = await uploadPdfToBlob(session.id, "package", buffer);
    }
  } catch (e: unknown) {
    return jsonError(
      e instanceof Error ? `PDF generation failed: ${e.message}` : "PDF generation failed",
      500,
    );
  }

  await prisma.onboardingData.update({
    where: { id: d.id },
    data:
      which === "contract"
        ? { generatedContractPdfUrl: url }
        : { generatedPackagePdfUrl: url },
  });

  return NextResponse.json({ url, regenerated: true });
}

function maskTail(value: string | null | undefined, keepLast: number): string | null {
  if (!value) return null;
  if (value.startsWith("enc:v1:")) return "••••••••";
  const t = value.trim();
  if (t.length <= keepLast) return t;
  return "•".repeat(t.length - keepLast) + t.slice(-keepLast);
}
