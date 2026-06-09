import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashOnboardingToken } from "@/lib/onboarding/token";
import { renderContractPdf } from "@/lib/onboarding/pdf-contract";
import { renderPackagePdf } from "@/lib/onboarding/pdf-package";
import { uploadPdfToBlob } from "@/lib/onboarding/pdf-storage";
import { getSmsAdapter } from "@/lib/sms";

/**
 * POST /api/onboarding/[token]/submit
 *
 * Marks the session COMPLETED, stamps Guard.onboardingStatus = COMPLETE,
 * writes a SopAcknowledgement row, then renders the signed contract +
 * complete-package PDFs to Vercel Blob and stores the URLs on
 * OnboardingData. The guard receives an SMS with the contract URL as
 * their personal copy. PDF/SMS failures don't roll back the submit —
 * admins can regenerate via /api/guards/[id]/onboarding/pdf?regen=1.
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

  // Post-commit: render PDFs and SMS the guard the contract link.
  // Wrapped in try/catch so any failure is logged but doesn't fail
  // the submit (admins can regen later from the view panel).
  let contractUrl: string | null = null;
  let packageUrl: string | null = null;
  try {
    const [company, contract, sop, ack] = await Promise.all([
      prisma.company.findUnique({
        where: { id: session.companyId },
        select: { name: true },
      }),
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

    if (contract) {
      const contractPdf = await renderContractPdf({
        companyName: company?.name ?? "Vigilo",
        templateName: contract.name,
        templateVersion: contract.version,
        templateContent: contract.templateContent,
        legalName: d.legalName ?? `${session.guard.firstName} ${session.guard.lastName}`,
        dateOfBirth: d.dateOfBirth,
        residentialAddress: d.residentialAddress,
        email: d.email,
        phone: d.mobile ?? session.guard.phone,
        licenceNumber: d.licenceNumber,
        licenceClass: d.licenceClass,
        licenceExpiry: d.licenceExpiry,
        signatureName: d.contractSignatureName!,
        signedAt: d.contractSignedAt!,
        signerIp: d.contractSignerIp,
        sessionId: session.id,
      });
      contractUrl = await uploadPdfToBlob(session.id, "contract", contractPdf);
    }

    const packagePdf = await renderPackagePdf({
      companyName: company?.name ?? "Vigilo",
      guardName: d.legalName ?? `${session.guard.firstName} ${session.guard.lastName}`,
      guardId: session.guardId,
      sessionId: session.id,
      completedAt: now,
      personal: {
        legalName: d.legalName,
        dateOfBirth: d.dateOfBirth,
        residentialAddress: d.residentialAddress,
        mobile: d.mobile ?? session.guard.phone,
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
        // Stored PDFs only ever contain masked tax/bank values. OWNER-
        // reveal goes through the dashboard (logged to audit) and never
        // bakes plaintext into a downloadable artefact.
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
    packageUrl = await uploadPdfToBlob(session.id, "package", packagePdf);

    if (contractUrl || packageUrl) {
      await prisma.onboardingData.update({
        where: { id: d.id },
        data: {
          generatedContractPdfUrl: contractUrl ?? d.generatedContractPdfUrl,
          generatedPackagePdfUrl: packageUrl ?? d.generatedPackagePdfUrl,
        },
      });
    }

    // SMS the guard their personal copy of the contract. Fire-and-forget
    // — submit already succeeded, this is informational.
    if (contractUrl) {
      try {
        const adapter = getSmsAdapter();
        await adapter.sendSms(
          d.mobile ?? session.guard.phone,
          `Welcome to ${company?.name ?? "Vigilo"}. Your signed employment contract is attached: ${contractUrl}`,
          { guardId: session.guardId },
        );
      } catch (smsErr) {
        console.warn("[onboarding/submit] contract SMS failed:", smsErr);
      }
    }
  } catch (pdfErr) {
    // The submit response stays 200 — admins can regenerate via the
    // GET /api/guards/[id]/onboarding/pdf?regen=1 endpoint.
    console.warn("[onboarding/submit] PDF generation failed:", pdfErr);
  }

  return NextResponse.json({ ok: true, contractUrl, packageUrl });
}

function maskTail(value: string | null | undefined, keepLast: number): string | null {
  if (!value) return null;
  // For encrypted values (the new normal post-step-3) we don't know the
  // underlying length, so emit a fixed-width mask rather than guessing.
  if (value.startsWith("enc:v1:")) return "••••••••";
  const t = value.trim();
  if (t.length <= keepLast) return t;
  return "•".repeat(t.length - keepLast) + t.slice(-keepLast);
}
