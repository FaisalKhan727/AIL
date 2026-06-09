import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

/**
 * POST /api/guards/[id]/dispatch-override
 *
 * Enables or clears the dispatch override for a guard. With override
 * ON, the guard can be assigned to shifts and alarms even when their
 * onboarding isn't complete — useful for emergency staffing where you
 * trust the guard but the paperwork is still being processed.
 *
 * Body when enabling:
 *   { enable: true, reason: string (10..500), reviewAt: "YYYY-MM-DD" }
 * Body when clearing:
 *   { enable: false }
 *
 * Every transition writes a DISPATCH_OVERRIDE_TOGGLED AuditLog row
 * with actor, prior state, new state, reason, and review date.
 */
const enableSchema = z.object({
  enable: z.literal(true),
  reason: z
    .string()
    .trim()
    .min(10, "reason must be at least 10 characters")
    .max(500, "reason is too long"),
  reviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "reviewAt must be yyyy-mm-dd"),
});
const disableSchema = z.object({
  enable: z.literal(false),
});
const bodySchema = z.union([enableSchema, disableSchema]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const data = parsed.data;

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: auth.companyId },
    select: {
      id: true,
      dispatchOverride: true,
      dispatchOverrideReason: true,
      dispatchOverrideAt: true,
      dispatchOverrideReviewAt: true,
      onboardingStatus: true,
    },
  });
  if (!guard) return jsonError("guard not found", 404);

  const now = new Date();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  if (data.enable) {
    const reviewAtDate = new Date(`${data.reviewAt}T00:00:00Z`);
    if (Number.isNaN(reviewAtDate.getTime())) {
      return jsonError("reviewAt is not a valid date", 400);
    }
    if (reviewAtDate <= now) {
      return jsonError("reviewAt must be in the future", 400);
    }

    await prisma.$transaction([
      prisma.guard.update({
        where: { id: guard.id },
        data: {
          dispatchOverride: true,
          dispatchOverrideReason: data.reason,
          dispatchOverrideBy: auth.userId,
          dispatchOverrideAt: now,
          dispatchOverrideReviewAt: reviewAtDate,
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorAdminUserId: auth.userId,
          action: "DISPATCH_OVERRIDE_TOGGLED",
          entityType: "Guard",
          entityId: guard.id,
          metadata: JSON.stringify({
            transition: guard.dispatchOverride ? "REFRESHED" : "ENABLED",
            priorOnboardingStatus: guard.onboardingStatus,
            reason: data.reason,
            reviewAt: reviewAtDate.toISOString(),
          }),
          ipAddress: ip,
          userAgent: ua,
        },
      }),
    ]);
  } else {
    if (!guard.dispatchOverride) {
      return jsonError("no override is currently active", 409);
    }

    await prisma.$transaction([
      prisma.guard.update({
        where: { id: guard.id },
        data: {
          dispatchOverride: false,
          dispatchOverrideReason: null,
          dispatchOverrideBy: null,
          dispatchOverrideAt: null,
          dispatchOverrideReviewAt: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorAdminUserId: auth.userId,
          action: "DISPATCH_OVERRIDE_TOGGLED",
          entityType: "Guard",
          entityId: guard.id,
          metadata: JSON.stringify({
            transition: "CLEARED",
            priorReason: guard.dispatchOverrideReason,
            priorReviewAt: guard.dispatchOverrideReviewAt?.toISOString() ?? null,
          }),
          ipAddress: ip,
          userAgent: ua,
        },
      }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
