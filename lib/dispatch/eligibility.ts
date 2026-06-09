import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Dispatch eligibility — the question "is this guard allowed on a shift?".
 *
 * A guard is dispatchable when EITHER:
 *  - onboardingStatus === "COMPLETE", or
 *  - dispatchOverride === true (admin explicitly approved early
 *    dispatch; recorded with a reason + review date in AuditLog)
 *
 * Centralised here so every dispatch surface (rosters, copy-roster,
 * shift edit, alarm assign, alarm dispatch) applies the same rule.
 * If a new dispatch path lands later, route it through these helpers
 * rather than re-implementing the check.
 */

export interface DispatchabilitySnapshot {
  guardId: string;
  firstName: string;
  lastName: string;
  onboardingStatus: string;
  dispatchOverride: boolean;
  canBeDispatched: boolean;
  /** Human-readable reason when blocked. Empty string when allowed. */
  blockedReason: string;
}

export function dispatchabilityFromRow(g: {
  id: string;
  firstName: string;
  lastName: string;
  onboardingStatus: string;
  dispatchOverride: boolean;
}): DispatchabilitySnapshot {
  const canBeDispatched =
    g.onboardingStatus === "COMPLETE" || g.dispatchOverride === true;
  const blockedReason = canBeDispatched
    ? ""
    : g.onboardingStatus === "NOT_STARTED"
      ? "Onboarding not started"
      : g.onboardingStatus === "IN_PROGRESS"
        ? "Onboarding incomplete"
        : "Onboarding required";
  return {
    guardId: g.id,
    firstName: g.firstName,
    lastName: g.lastName,
    onboardingStatus: g.onboardingStatus,
    dispatchOverride: g.dispatchOverride,
    canBeDispatched,
    blockedReason,
  };
}

/**
 * For a set of guard ids in a single company, returns the subset that
 * cannot be dispatched. Single DB query regardless of input length.
 * Filters by companyId so cross-tenant ids never leak through.
 */
export async function findBlockedGuards(
  guardIds: string[],
  companyId: string,
): Promise<DispatchabilitySnapshot[]> {
  if (guardIds.length === 0) return [];
  const rows = await prisma.guard.findMany({
    where: {
      id: { in: guardIds },
      companyId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      onboardingStatus: true,
      dispatchOverride: true,
    },
  });
  return rows.map(dispatchabilityFromRow).filter((d) => !d.canBeDispatched);
}

/**
 * Returns a 422 NextResponse describing the blocked guards, OR null
 * when every supplied id is dispatchable. Suitable for early-return
 * from route handlers:
 *
 *   const blocked = await assertCanDispatchOrError([guardId], companyId);
 *   if (blocked) return blocked;
 */
export async function assertCanDispatchOrError(
  guardIds: string[],
  companyId: string,
): Promise<NextResponse | null> {
  const blocked = await findBlockedGuards(guardIds, companyId);
  if (blocked.length === 0) return null;
  return NextResponse.json(
    {
      error: "dispatch_blocked",
      message:
        blocked.length === 1
          ? `${blocked[0].firstName} ${blocked[0].lastName} cannot be dispatched: ${blocked[0].blockedReason}. Complete onboarding first or apply a dispatch override.`
          : `${blocked.length} guards cannot be dispatched. Complete their onboarding first or apply a dispatch override.`,
      blocked: blocked.map((b) => ({
        guardId: b.guardId,
        name: `${b.firstName} ${b.lastName}`,
        reason: b.blockedReason,
        onboardingStatus: b.onboardingStatus,
      })),
    },
    { status: 422 },
  );
}
