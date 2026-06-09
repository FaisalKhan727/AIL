import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

/**
 * GET  /api/contracts  — list every ContractTemplate for the current
 *                        company, newest first.
 * POST /api/contracts  — publish a new contract template. Body:
 *                        { name, templateContent }. The new row is
 *                        auto-incremented and atomically becomes
 *                        isCurrent=true.
 *
 * Unlike SOP, a published contract change does NOT trigger any guard
 * re-signing. Already-signed contracts remain locked to the version
 * that was current at signing time (the OnboardingData row carries the
 * `contractTemplateVersionId`, and PDF regeneration looks it up by id).
 * Only NEW onboarding submissions pick up the new template.
 */
const publishSchema = z.object({
  name: z.string().trim().min(2, "name required").max(120),
  templateContent: z.string().trim().min(50, "Contract body must be at least 50 characters"),
});

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const versions = await prisma.contractTemplate.findMany({
    where: { companyId: auth.companyId },
    select: {
      id: true,
      version: true,
      name: true,
      templateContent: true,
      effectiveFrom: true,
      isCurrent: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });

  return NextResponse.json({ versions });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = publishSchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { name, templateContent } = parsed.data;

  const next = await prisma.$transaction(async (tx) => {
    const last = await tx.contractTemplate.findFirst({
      where: { companyId: auth.companyId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersionNumber = (last?.version ?? 0) + 1;

    await tx.contractTemplate.updateMany({
      where: { companyId: auth.companyId, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.contractTemplate.create({
      data: {
        companyId: auth.companyId,
        version: nextVersionNumber,
        name,
        templateContent,
        isCurrent: true,
        createdBy: auth.userId,
      },
      select: { id: true, version: true, name: true, isCurrent: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorAdminUserId: auth.userId,
        action: "CONTRACT_TEMPLATE_PUBLISHED",
        entityType: "ContractTemplate",
        entityId: created.id,
        metadata: JSON.stringify({ version: created.version, name: created.name }),
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, version: next });
}
