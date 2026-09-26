import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun, startOfDayInTz, endOfDayInTz, APP_TZ } from "@/lib/date";

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
  const rosterScope = { roster: { companyId } };
  const [shiftsThisWeek, pendingCount, rejectedCount, activeGuards, todayShifts, recentSms] = await Promise.all([
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
  ]);

  return NextResponse.json({
    kpis: { shiftsThisWeek, pendingCount, rejectedCount, activeGuards },
    todayShifts,
    recentSms,
  });
}
