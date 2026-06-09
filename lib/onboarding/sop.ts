import { prisma } from "@/lib/prisma";

/**
 * Returns the SopVersion the guard still needs to acknowledge for a given
 * company, if any. Returns null when the guard is already up-to-date with
 * the current SOP, or when there is no current SOP for that company.
 *
 * Re-acknowledgement is only relevant for guards who completed onboarding —
 * they ack'd an older version. Guards mid-onboarding (or with no Guard
 * record yet) will ack the CURRENT version at step 6 of their flow, so
 * they don't need a banner pushed at them now.
 */
export async function getPendingReackForGuard(
  guardId: string,
  companyId: string,
): Promise<{ id: string; title: string; body: string; version: number } | null> {
  const guard = await prisma.guard.findUnique({
    where: { id: guardId },
    select: { onboardingStatus: true },
  });
  if (!guard || guard.onboardingStatus !== "COMPLETE") return null;

  const current = await prisma.sopVersion.findFirst({
    where: { companyId, isCurrent: true },
    select: { id: true, title: true, body: true, version: true },
  });
  if (!current) return null;

  const acked = await prisma.sopAcknowledgement.findFirst({
    where: { guardId, sopVersionId: current.id },
    select: { id: true },
  });
  if (acked) return null;
  return current;
}
