import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun } from "@/lib/date";

const EXPIRY_WINDOW_DAYS = 60;
const OVERRIDE_REVIEW_WINDOW_DAYS = 7;

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const now = new Date();
  const weekStart = startOfWeekMon(now);
  const weekEnd = endOfWeekSun(now);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const expiryHorizon = new Date(now);
  expiryHorizon.setDate(expiryHorizon.getDate() + EXPIRY_WINDOW_DAYS);
  const overrideReviewHorizon = new Date(now);
  overrideReviewHorizon.setDate(overrideReviewHorizon.getDate() + OVERRIDE_REVIEW_WINDOW_DAYS);

  const companyId = auth.companyId;
  const rosterScope = { roster: { companyId } };
  const [
    shiftsThisWeek,
    pendingCount,
    rejectedCount,
    activeGuards,
    todayShifts,
    recentSms,
    onboardingCounts,
    overridesActive,
    overridesNeedingReview,
    currentSop,
    expiringWorkingRights,
  ] = await Promise.all([
    prisma.shift.count({ where: { ...rosterScope, startAt: { gte: weekStart, lte: weekEnd } } }),
    prisma.shift.count({ where: { ...rosterScope, status: "PENDING", startAt: { gte: now } } }),
    prisma.shift.count({ where: { ...rosterScope, status: "REJECTED", startAt: { gte: now } } }),
    prisma.guard.count({ where: { companyId, active: true } }),
    prisma.shift.findMany({
      where: { ...rosterScope, startAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
    }),
    prisma.smsLog.findMany({
      where: { guard: { companyId } },
      orderBy: { receivedAt: "desc" },
      take: 20,
      include: { guard: true },
    }),
    // Grouped count of active guards by onboardingStatus — gives both
    // the headline "% onboarded" and the stacked breakdown the UI shows.
    prisma.guard.groupBy({
      by: ["onboardingStatus"],
      where: { companyId, active: true },
      _count: { _all: true },
    }),
    // Total dispatch overrides currently in effect.
    prisma.guard.count({
      where: { companyId, active: true, dispatchOverride: true },
    }),
    // Overrides whose review window has either lapsed or is within the
    // next 7 days — admins should look at these now.
    prisma.guard.count({
      where: {
        companyId,
        active: true,
        dispatchOverride: true,
        OR: [
          { dispatchOverrideReviewAt: null },
          { dispatchOverrideReviewAt: { lte: overrideReviewHorizon } },
        ],
      },
    }),
    prisma.sopVersion.findFirst({
      where: { companyId, isCurrent: true },
      select: { id: true, version: true, title: true },
    }),
    // Working-rights feed: OnboardingData rows on a working visa whose
    // visa expires within EXPIRY_WINDOW_DAYS (or already lapsed). Joined
    // to Guard for display + filtered to active guards only below.
    prisma.onboardingData.findMany({
      where: {
        companyId,
        workingRightsStatus: "WORKING_VISA",
        visaExpiry: { not: null, lte: expiryHorizon },
      },
      select: {
        guardId: true,
        legalName: true,
        visaSubclass: true,
        visaExpiry: true,
      },
      orderBy: { visaExpiry: "asc" },
      take: 50,
    }),
  ]);

  // Pending SOP re-acks: completed guards who haven't acked the current
  // version under any source. Reduced to a single count rather than the
  // list — the per-guard detail lives on the Guards page already.
  let sopReackPending = 0;
  if (currentSop) {
    const ackedRows = await prisma.sopAcknowledgement.findMany({
      where: { companyId, sopVersionId: currentSop.id },
      select: { guardId: true },
    });
    const ackedSet = new Set(ackedRows.map((r) => r.guardId));
    const completed = await prisma.guard.findMany({
      where: { companyId, active: true, onboardingStatus: "COMPLETE" },
      select: { id: true },
    });
    sopReackPending = completed.filter((g) => !ackedSet.has(g.id)).length;
  }

  // Pull guard names for the working-rights feed (one batch query) and
  // filter to active guards in the same step.
  const expiryGuardIds = Array.from(new Set(expiringWorkingRights.map((r) => r.guardId)));
  const expiryGuards = expiryGuardIds.length
    ? await prisma.guard.findMany({
        where: { id: { in: expiryGuardIds }, companyId, active: true },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const guardNameById = new Map(expiryGuards.map((g) => [g.id, `${g.firstName} ${g.lastName}`]));

  const workingRightsExpiring = expiringWorkingRights
    .filter((r) => guardNameById.has(r.guardId))
    .map((r) => {
      const expiry = r.visaExpiry!;
      const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
      return {
        guardId: r.guardId,
        guardName: guardNameById.get(r.guardId)!,
        visaSubclass: r.visaSubclass,
        visaExpiry: expiry,
        daysUntil,
        severity:
          daysUntil < 0 ? "EXPIRED" : daysUntil <= 14 ? "URGENT" : daysUntil <= 30 ? "WARN" : "OK",
      };
    });

  const breakdown: Record<string, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    COMPLETE: 0,
    EXPIRED: 0,
  };
  for (const row of onboardingCounts) {
    breakdown[row.onboardingStatus] = row._count._all;
  }
  const totalActive =
    breakdown.NOT_STARTED + breakdown.IN_PROGRESS + breakdown.COMPLETE + breakdown.EXPIRED;
  const onboardedPct = totalActive === 0 ? 0 : Math.round((breakdown.COMPLETE / totalActive) * 100);

  return NextResponse.json({
    kpis: { shiftsThisWeek, pendingCount, rejectedCount, activeGuards },
    todayShifts,
    recentSms,
    onboarding: {
      totalActive,
      breakdown,
      onboardedPct,
      overridesActive,
      overridesNeedingReview,
      sopReackPending,
    },
    workingRightsExpiring,
  });
}
