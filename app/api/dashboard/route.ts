import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun, startOfDayInTz, endOfDayInTz, fmtDate, fmtTime, APP_TZ } from "@/lib/date";

const EXPIRY_WINDOW_DAYS = 60;
const CHECKIN_GRACE_MINUTES = 15;
const CONFIRMATION_HORIZON_HOURS = 48;

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const companyId = auth.companyId;

  // Same timezone-awareness as /api/timesheets: on a UTC server, boundaries
  // computed from the server's local clock would put shifts near midnight
  // (Melbourne time) in the wrong day/week.
  const tzRow = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: "timezone" } },
  });
  const tz = tzRow?.value || APP_TZ;

  const now = new Date();
  const weekStart = startOfWeekMon(now, tz);
  const weekEnd = endOfWeekSun(now, tz);
  const dayStart = startOfDayInTz(now, tz);
  const dayEnd = endOfDayInTz(now, tz);
  const expiryHorizon = new Date(now);
  expiryHorizon.setDate(expiryHorizon.getDate() + EXPIRY_WINDOW_DAYS);
  const checkInGraceTime = new Date(now.getTime() - CHECKIN_GRACE_MINUTES * 60_000);
  const confirmationHorizon = new Date(now.getTime() + CONFIRMATION_HORIZON_HOURS * 3_600_000);
  const rosterScope = { roster: { companyId } };
  const [
    shiftsThisWeek,
    pendingCount,
    rejectedCount,
    activeGuards,
    todayShifts,
    recentSms,
    onboardingCounts,
    currentSop,
    expiringWorkingRights,
    onDutyCount,
    unfilledShifts,
    lateCheckIns,
    rejectedList,
    missingConfirmations,
    expiringLicences,
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
      take: 6,
      include: { guard: true },
    }),
    // Grouped count of active guards by onboardingStatus — gives both
    // the headline "% onboarded" and the stacked breakdown the UI shows.
    prisma.guard.groupBy({
      by: ["onboardingStatus"],
      where: { companyId, active: true },
      _count: { _all: true },
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
    // Guards currently on duty: CONFIRMED/WORKED shifts spanning right now
    // that have actually been clocked in (workedStart set, no workedEnd yet).
    prisma.shift.count({
      where: {
        ...rosterScope,
        status: { in: ["CONFIRMED", "WORKED"] },
        workedStart: { not: null, lte: now },
        workedEnd: null,
        endAt: { gte: now },
      },
    }),
    // Unfilled: no guard assigned yet, still upcoming.
    prisma.shift.findMany({
      where: { ...rosterScope, guardId: null, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { site: true },
      take: 20,
    }),
    // Confirmed shifts that started (past grace period) but the guard never
    // clocked in — surfaced as a possible no-show / late arrival.
    prisma.shift.findMany({
      where: {
        ...rosterScope,
        status: "CONFIRMED",
        startAt: { gte: dayStart, lte: checkInGraceTime },
        workedStart: null,
      },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
      take: 20,
    }),
    prisma.shift.findMany({
      where: { ...rosterScope, status: "REJECTED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
      take: 20,
    }),
    // Awaiting SMS/PWA confirmation with the shift starting soon.
    prisma.shift.findMany({
      where: {
        ...rosterScope,
        status: "PENDING",
        startAt: { gte: now, lte: confirmationHorizon },
      },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
      take: 20,
    }),
    prisma.guard.findMany({
      where: { companyId, active: true, licenceExpiry: { not: null, lte: expiryHorizon } },
      select: { id: true, firstName: true, lastName: true, licenceNumber: true, licenceExpiry: true },
      orderBy: { licenceExpiry: "asc" },
      take: 20,
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

  const fmtRange = (start: Date, end: Date) => `${fmtDate(start)} ${fmtTime(start)}–${fmtTime(end)}`;

  // Attention required: one unified, pre-sorted feed of everything that
  // needs an admin's eyes right now. Each item links straight to the
  // record so clicking it takes you to where you'd act on it.
  type AttentionItem = {
    type: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    link: string;
  };
  const attention: AttentionItem[] = [];

  for (const s of rejectedList) {
    attention.push({
      type: "REJECTED_SHIFT",
      severity: "CRITICAL",
      title: `${s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Unassigned"} rejected a shift`,
      description: `${s.site.name} · ${fmtRange(s.startAt, s.endAt)}`,
      link: `/rosters/${s.rosterId}`,
    });
  }
  for (const s of lateCheckIns) {
    attention.push({
      type: "LATE_CHECKIN",
      severity: "HIGH",
      title: `${s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Guard"} hasn't checked in`,
      description: `${s.site.name} · shift started ${fmtRange(s.startAt, s.endAt)}`,
      link: `/rosters/${s.rosterId}`,
    });
  }
  for (const s of unfilledShifts) {
    attention.push({
      type: "UNFILLED_SHIFT",
      severity: "HIGH",
      title: `Unfilled shift at ${s.site.name}`,
      description: fmtRange(s.startAt, s.endAt),
      link: `/rosters/${s.rosterId}`,
    });
  }
  for (const s of missingConfirmations) {
    attention.push({
      type: "MISSING_CONFIRMATION",
      severity: "MEDIUM",
      title: `${s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "Guard"} hasn't confirmed`,
      description: `${s.site.name} · ${fmtRange(s.startAt, s.endAt)}`,
      link: `/rosters/${s.rosterId}`,
    });
  }
  for (const g of expiringLicences) {
    const daysUntil = Math.ceil((g.licenceExpiry!.getTime() - now.getTime()) / 86_400_000);
    attention.push({
      type: "LICENCE_EXPIRING",
      severity: daysUntil < 0 ? "CRITICAL" : daysUntil <= 14 ? "HIGH" : "MEDIUM",
      title: `${g.firstName} ${g.lastName}'s licence ${daysUntil < 0 ? "has expired" : "is expiring"}`,
      description: `${g.licenceNumber ?? "Licence"} · ${daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `in ${daysUntil}d`}`,
      link: `/guards/${g.id}`,
    });
  }
  for (const wr of workingRightsExpiring) {
    if (wr.severity === "OK") continue;
    attention.push({
      type: "WORKING_RIGHTS_EXPIRING",
      severity: wr.severity === "EXPIRED" ? "CRITICAL" : wr.severity === "URGENT" ? "HIGH" : "MEDIUM",
      title: `${wr.guardName}'s working rights ${wr.daysUntil < 0 ? "have expired" : "are expiring"}`,
      description: `${wr.visaSubclass ?? "Visa"} · ${wr.daysUntil < 0 ? `${Math.abs(wr.daysUntil)}d overdue` : `in ${wr.daysUntil}d`}`,
      link: `/guards/${wr.guardId}`,
    });
  }

  const severityRank: Record<AttentionItem["severity"], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return NextResponse.json({
    kpis: {
      shiftsThisWeek,
      pendingCount,
      rejectedCount,
      activeGuards,
      onDutyCount,
      unfilledCount: unfilledShifts.length,
      lateCheckInCount: lateCheckIns.length,
    },
    attention: attention.slice(0, 30),
    todayShifts,
    recentSms,
    onboarding: {
      totalActive,
      breakdown,
      onboardedPct,
      sopReackPending,
    },
    workingRightsExpiring,
  });
}
