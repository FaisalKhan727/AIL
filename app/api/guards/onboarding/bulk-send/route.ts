import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { getSmsAdapter } from "@/lib/sms";
import { generateOnboardingToken, tokenExpiry } from "@/lib/onboarding/token";

/**
 * POST /api/guards/onboarding/bulk-send
 *
 * Sends an onboarding link via SMS to multiple guards at once. Mirrors
 * the single-guard /api/guards/[id]/send-onboarding-link behaviour for
 * each id — abandon prior PENDING/IN_PROGRESS sessions, create a fresh
 * session, SMS the link, write a per-guard AuditLog row.
 *
 * Failures are isolated: one bad SMS does not abort the batch. The
 * response summarises sent vs failed counts plus per-failure detail
 * so the admin can retry or fix the underlying issue.
 */
const bodySchema = z.object({
  guardIds: z.array(z.string().min(1)).min(1, "at least one guardId required").max(200),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());

  const guards = await prisma.guard.findMany({
    where: { id: { in: parsed.data.guardIds }, companyId: auth.companyId },
    include: { company: { select: { name: true } } },
  });
  const foundIds = new Set(guards.map((g) => g.id));
  const missing = parsed.data.guardIds.filter((id) => !foundIds.has(id));

  const baseUrl = process.env.PUBLIC_BASE_URL ?? "";
  const adapter = getSmsAdapter();

  let sent = 0;
  const failed: Array<{ guardId: string; error: string }> = [];

  for (const guard of guards) {
    try {
      const { token, tokenHash } = generateOnboardingToken();
      const expiresAt = await tokenExpiry(auth.companyId);

      const session = await prisma.$transaction(async (tx) => {
        await tx.onboardingSession.updateMany({
          where: { guardId: guard.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
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
          data: { latestOnboardingSessionId: created.id },
        });
        await tx.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorAdminUserId: auth.userId,
            action: "ONBOARDING_LINK_SENT",
            entityType: "Guard",
            entityId: guard.id,
            metadata: JSON.stringify({ sessionId: created.id, expiresAt, bulk: true }),
          },
        });
        return created;
      });

      const link = `${baseUrl}/onboarding/${token}`;
      const body = `Hi ${guard.firstName}, please complete your onboarding for ${guard.company.name} here: ${link} (expires in 7 days).`;
      await adapter.sendSms(guard.phone, body, { guardId: guard.id });
      void session;
      sent += 1;
    } catch (e: unknown) {
      failed.push({
        guardId: guard.id,
        error: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  for (const id of missing) {
    failed.push({ guardId: id, error: "not found" });
  }

  return NextResponse.json({ ok: true, sent, failed });
}
