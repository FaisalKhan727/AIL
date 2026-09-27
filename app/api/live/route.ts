import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { startOfDayInTz, endOfDayInTz, APP_TZ } from "@/lib/date";

const CHECKIN_GRACE_MINUTES = 15;
const UPCOMING_HOURS = 4;

/**
 * GET /api/live
 *
 * Backs the Live Operations page: who's on duty right now, who's due on
 * soon, who missed their check-in, and anything open that needs a
 * dispatcher's attention (incidents, active alarm responses). Also
 * returns a merged timeline of the last few hours of operational
 * activity (check-ins, SMS replies, incidents, alarm status changes) so
 * a supervisor can see what just happened without opening four tabs.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const companyId = auth.companyId;

  const tzRow = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: "timezone" } },
  });
  const tz = tzRow?.value || APP_TZ;

  const now = new Date();
  const dayStart = startOfDayInTz(now, tz);
  const dayEnd = endOfDayInTz(now, tz);
  const checkInGraceTime = new Date(now.getTime() - CHECKIN_GRACE_MINUTES * 60_000);
  const upcomingHorizon = new Date(now.getTime() + UPCOMING_HOURS * 3_600_000);
  const activityWindowStart = new Date(now.getTime() - 12 * 3_600_000);
  const rosterScope = { roster: { companyId } };

  const [
    onDuty,
    dueSoon,
    missedCheckIns,
    openIncidents,
    activeAlarms,
    recentClockEvents,
    recentInboundSms,
    recentIncidents,
  ] = await Promise.all([
    prisma.shift.findMany({
      where: {
        ...rosterScope,
        status: { in: ["CONFIRMED", "WORKED"] },
        workedStart: { not: null, lte: now },
        workedEnd: null,
        endAt: { gte: now },
      },
      orderBy: { workedStart: "asc" },
      include: { guard: true, site: true },
    }),
    prisma.shift.findMany({
      where: {
        ...rosterScope,
        status: "CONFIRMED",
        workedStart: null,
        startAt: { gte: now, lte: upcomingHorizon },
      },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
      take: 30,
    }),
    prisma.shift.findMany({
      where: {
        ...rosterScope,
        status: "CONFIRMED",
        startAt: { gte: dayStart, lte: checkInGraceTime },
        workedStart: null,
      },
      orderBy: { startAt: "asc" },
      include: { guard: true, site: true },
      take: 30,
    }),
    prisma.incidentReport.findMany({
      where: { companyId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      orderBy: { occurredAt: "desc" },
      include: { guard: true, site: true },
      take: 20,
    }),
    prisma.alarmJob.findMany({
      where: { companyId, status: { in: ["DISPATCHED", "ACKNOWLEDGED", "ONSITE"] } },
      orderBy: { receivedAt: "desc" },
      include: { responders: { orderBy: { dispatchedAt: "desc" }, take: 3 } },
      take: 20,
    }),
    prisma.clockEvent.findMany({
      where: { companyId, timestamp: { gte: activityWindowStart } },
      orderBy: { timestamp: "desc" },
      include: { guard: true, shift: { include: { site: true } } },
      take: 25,
    }),
    prisma.smsLog.findMany({
      where: { guard: { companyId }, direction: "INBOUND", receivedAt: { gte: activityWindowStart } },
      orderBy: { receivedAt: "desc" },
      include: { guard: true },
      take: 25,
    }),
    prisma.incidentReport.findMany({
      where: { companyId, createdAt: { gte: activityWindowStart } },
      orderBy: { createdAt: "desc" },
      include: { guard: true, site: true },
      take: 15,
    }),
  ]);

  type TimelineItem = {
    id: string;
    type: "CLOCK_IN" | "CLOCK_OUT" | "SMS_REPLY" | "INCIDENT";
    at: string;
    title: string;
    description: string;
    link?: string;
  };
  const timeline: TimelineItem[] = [];

  for (const ev of recentClockEvents) {
    if (ev.eventType !== "CLOCK_IN" && ev.eventType !== "CLOCK_OUT") continue;
    timeline.push({
      id: ev.id,
      type: ev.eventType,
      at: ev.timestamp.toISOString(),
      title: `${ev.guard.firstName} ${ev.guard.lastName} ${ev.eventType === "CLOCK_IN" ? "clocked in" : "clocked out"}`,
      description: ev.shift?.site?.name ?? "",
      link: ev.shiftId ? `/rosters/${ev.shiftId}` : undefined,
    });
  }
  for (const sms of recentInboundSms) {
    timeline.push({
      id: sms.id,
      type: "SMS_REPLY",
      at: sms.receivedAt.toISOString(),
      title: sms.guard ? `${sms.guard.firstName} ${sms.guard.lastName} replied` : "Reply received",
      description: sms.body,
    });
  }
  for (const inc of recentIncidents) {
    timeline.push({
      id: inc.id,
      type: "INCIDENT",
      at: inc.createdAt.toISOString(),
      title: `${inc.guard.firstName} ${inc.guard.lastName} logged a ${inc.severity.toLowerCase()} incident`,
      description: inc.site?.name ?? inc.incidentType,
      link: `/guards/${inc.guardId}`,
    });
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({
    onDuty,
    dueSoon,
    missedCheckIns,
    openIncidents,
    activeAlarms,
    timeline: timeline.slice(0, 40),
  });
}
