import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfWeekMon, endOfWeekSun } from "@/lib/date";

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

  const [shiftsThisWeek, pendingCount, rejectedCount, activeGuards, todayShifts, recentSms] = await Promise.all([
    prisma.shift.count({ where: { startAt: { gte: weekStart, lte: weekEnd } } }),
    prisma.shift.count({ where: { status: "PENDING", startAt: { gte: now } } }),
    prisma.shift.count({ where: { status: "REJECTED", startAt: { gte: now } } }),
    prisma.guard.count({ where: { active: true } }),
    prisma.shift.findMany({
      where: { startAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
    }),
    prisma.smsLog.findMany({
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
