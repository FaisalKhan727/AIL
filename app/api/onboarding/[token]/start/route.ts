import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashOnboardingToken } from "@/lib/onboarding/token";

/**
 * GET /api/onboarding/[token]/start
 *
 * Verifies the token, returns the session's current state, any data
 * captured so far, and the SOP + contract template content needed
 * later in the flow. No mutation on read; the first step submission
 * flips status to IN_PROGRESS.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const tokenHash = hashOnboardingToken(params.token);
  const session = await prisma.onboardingSession.findUnique({
    where: { tokenHash },
    include: {
      guard: {
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, licenceNumber: true, licenceExpiry: true, companyId: true },
      },
      company: { select: { id: true, name: true } },
      data: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Invalid onboarding link" }, { status: 404 });
  }
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed", status: "COMPLETED" }, { status: 410 });
  }
  if (session.tokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This onboarding link has expired. Please ask your admin to send a new one." },
      { status: 410 },
    );
  }

  // Lookup the current SOP + contract template for the company.
  const [sop, contract] = await Promise.all([
    prisma.sopVersion.findFirst({
      where: { companyId: session.companyId, isCurrent: true },
      select: { id: true, version: true, title: true, body: true },
    }),
    prisma.contractTemplate.findFirst({
      where: { companyId: session.companyId, isCurrent: true },
      select: { id: true, version: true, name: true, templateContent: true },
    }),
  ]);

  return NextResponse.json({
    session: {
      id: session.id,
      currentStep: session.currentStep,
      status: session.status,
      tokenExpiresAt: session.tokenExpiresAt,
    },
    guard: {
      firstName: session.guard.firstName,
      lastName: session.guard.lastName,
      phone: session.guard.phone,
      email: session.guard.email,
      licenceNumber: session.guard.licenceNumber,
      licenceExpiry: session.guard.licenceExpiry,
    },
    company: session.company,
    data: session.data ?? null,
    sop,
    contract,
  });
}
