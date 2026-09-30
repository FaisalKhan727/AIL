import { prisma } from "@/lib/prisma";
import { evaluateLicence, lookupLarsLicence, type LicenceCheckStatus } from "@/lib/licence/lars";

export interface LicenceCheckOutcome {
  status: LicenceCheckStatus;
  message: string;
}

/** Fields to clear whenever a guard's licence number changes. */
export const CLEARED_LICENCE_CHECK = {
  licenceCheckStatus: null,
  licenceCheckMessage: null,
  licenceCheckedAt: null,
  larsName: null,
  larsLicenceType: null,
  larsExpiry: null,
  larsActivities: null,
};

/**
 * Look the guard's licence up on the Victoria Police LARS register and store
 * the result on the Guard row. Never throws for LARS failures — those are
 * recorded as ERROR so a flaky register can't break the caller.
 */
export async function verifyGuardLicence(guardId: string): Promise<LicenceCheckOutcome | null> {
  const guard = await prisma.guard.findUnique({
    where: { id: guardId },
    select: { firstName: true, lastName: true, licenceNumber: true },
  });
  if (!guard?.licenceNumber) return null;

  const now = new Date();
  try {
    const result = await lookupLarsLicence(guard.licenceNumber);
    const ev = evaluateLicence(result, { ...guard, licenceNumber: guard.licenceNumber }, now);
    await prisma.guard.update({
      where: { id: guardId },
      data: {
        licenceCheckStatus: ev.status,
        licenceCheckMessage: result.dataCurrentAs ? `${ev.message} (register data as at ${result.dataCurrentAs})` : ev.message,
        licenceCheckedAt: now,
        larsName: ev.record?.name ?? null,
        larsLicenceType: ev.record?.type ?? null,
        larsExpiry: ev.record?.expiry ?? null,
        larsActivities: ev.record?.activities.join(", ") ?? null,
      },
    });
    return { status: ev.status, message: ev.message };
  } catch (e: unknown) {
    const message = `LARS lookup failed: ${e instanceof Error ? e.message : "unknown error"}`;
    // Keep the last successful LARS details; only flag that this attempt failed.
    await prisma.guard.update({
      where: { id: guardId },
      data: { licenceCheckStatus: "ERROR", licenceCheckMessage: message, licenceCheckedAt: now },
    });
    return { status: "ERROR", message };
  }
}
