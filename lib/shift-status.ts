import { prisma } from "@/lib/prisma";

/**
 * The one place a shift actually flips to CONFIRMED or REJECTED. Both the
 * inbound SMS webhook and the guard PWA's accept/reject routes call these
 * instead of writing the Prisma update inline — they used to duplicate this
 * exact field set independently, which is exactly the kind of thing that
 * silently drifts (e.g. one path forgetting to clear rejectionReason on a
 * re-confirm). Each caller keeps its own precondition checks (which prior
 * statuses are allowed to transition) since SMS and the PWA intentionally
 * differ there — SMS only ever acts on PENDING shifts, the PWA also lets a
 * guard change their mind on an already-decided shift.
 */
export async function markShiftConfirmed(shiftId: string) {
  return prisma.shift.update({
    where: { id: shiftId },
    data: { status: "CONFIRMED", confirmedAt: new Date(), rejectedAt: null, rejectionReason: null },
  });
}

export async function markShiftRejected(shiftId: string, reason: string | null = null) {
  return prisma.shift.update({
    where: { id: shiftId },
    data: { status: "REJECTED", rejectedAt: new Date(), confirmedAt: null, rejectionReason: reason },
  });
}
