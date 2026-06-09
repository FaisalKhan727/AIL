import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

/**
 * GET  /api/sop  — list every SopVersion for the current company,
 *                  newest first.
 * POST /api/sop  — publish a brand-new SOP version. Body: { title, body }.
 *                  The new row is auto-incremented and atomically becomes
 *                  isCurrent=true; the previously-current row flips to
 *                  isCurrent=false. Every guard who already completed
 *                  onboarding now needs to re-acknowledge.
 *
 * We deliberately conflate "create" and "publish": admins authoring SOPs
 * in this codebase have no draft workflow, and an unpublished version
 * would be invisible to everything else.
 */
const publishSchema = z.object({
  title: z.string().trim().min(2, "title required").max(120),
  body: z.string().trim().min(20, "SOP body must be at least 20 characters"),
});

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const versions = await prisma.sopVersion.findMany({
    where: { companyId: auth.companyId },
    select: {
      id: true,
      version: true,
      title: true,
      body: true,
      effectiveFrom: true,
      isCurrent: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });

  // Count guards who would need to re-ack right now (i.e. completed
  // onboarding but never ack'd the current version). The settings UI
  // surfaces this so admins know the impact of publishing.
  let pendingReackCount = 0;
  const current = versions.find((v) => v.isCurrent);
  if (current) {
    const ackedGuardIds = await prisma.sopAcknowledgement.findMany({
      where: { companyId: auth.companyId, sopVersionId: current.id },
      select: { guardId: true },
    });
    const ackedSet = new Set(ackedGuardIds.map((a) => a.guardId));
    const completed = await prisma.guard.findMany({
      where: { companyId: auth.companyId, onboardingStatus: "COMPLETE", active: true },
      select: { id: true },
    });
    pendingReackCount = completed.filter((g) => !ackedSet.has(g.id)).length;
  }

  return NextResponse.json({ versions, pendingReackCount });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = publishSchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { title, body } = parsed.data;

  const next = await prisma.$transaction(async (tx) => {
    const last = await tx.sopVersion.findFirst({
      where: { companyId: auth.companyId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersionNumber = (last?.version ?? 0) + 1;

    await tx.sopVersion.updateMany({
      where: { companyId: auth.companyId, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.sopVersion.create({
      data: {
        companyId: auth.companyId,
        version: nextVersionNumber,
        title,
        body,
        isCurrent: true,
        createdBy: auth.userId,
      },
      select: { id: true, version: true, title: true, isCurrent: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorAdminUserId: auth.userId,
        action: "SOP_PUBLISHED",
        entityType: "SopVersion",
        entityId: created.id,
        metadata: JSON.stringify({ version: created.version, title: created.title }),
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, version: next });
}
