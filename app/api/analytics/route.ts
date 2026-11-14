import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { shiftHours } from "@/lib/hours";
import { guardCompliance } from "@/lib/licences";
import { jobBillable, responseSla } from "@/lib/ops";
import { lookups } from "@/lib/server/ops";

const tally = <T,>(items: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const days = Math.min(365, Math.max(7, parseInt(new URL(req.url).searchParams.get("days") || "30", 10) || 30));
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const companyId = auth.companyId;

  const [incidents, alarms, jobs, shifts, enrollments, guards, look] = await Promise.all([
    prisma.incident.findMany({ where: { companyId, occurredAt: { gte: since } }, select: { type: true, severity: true, siteId: true, guardId: true, occurredAt: true, status: true } }),
    prisma.alarm.findMany({ where: { companyId, triggeredAt: { gte: since } } }),
    prisma.patrolJob.findMany({ where: { companyId, date: { gte: since, lte: now }, status: { in: ["COMPLETED", "PARTIAL", "MISSED"] } }, include: { scans: { select: { status: true } }, run: { select: { code: true } } } }),
    prisma.shift.findMany({ where: { roster: { companyId }, startAt: { gte: since, lte: now }, status: { in: ["CONFIRMED", "WORKED"] } }, select: { guardId: true, siteId: true, status: true, startAt: true, endAt: true, workedStart: true, workedEnd: true } }),
    prisma.enrollment.findMany({ where: { companyId }, select: { status: true } }),
    prisma.guard.findMany({ where: { companyId, active: true }, include: { licences: { select: { type: true, expiryDate: true, verification: true } } } }),
    lookups(companyId),
  ]);

  // Daily series, oldest first, so charts read left to right.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const series = Array.from({ length: days }, (_, i) => ({ date: dayKey(new Date(since.getTime() + (i + 1) * 86_400_000)), incidents: 0, alarms: 0 }));
  const byDay = new Map(series.map((s) => [s.date, s]));
  for (const i of incidents) { const s = byDay.get(dayKey(i.occurredAt)); if (s) s.incidents++; }
  for (const a of alarms) { const s = byDay.get(dayKey(a.triggeredAt)); if (s) s.alarms++; }

  const resolved = alarms.filter((a) => a.status === "RESOLVED");
  const attended = alarms.filter((a) => a.onSceneAt);
  const avgResponse = attended.length
    ? attended.reduce((sum, a) => sum + ((a.onSceneAt as Date).getTime() - a.triggeredAt.getTime()), 0) / attended.length / 60_000
    : null;
  const genuine = resolved.filter((a) => a.verification !== "FALSE_ALARM");
  const withinSla = genuine.filter((a) => responseSla(a).state !== "breached").length;

  const stops = jobs.reduce((n, j) => n + j.stopCount, 0);
  const scanned = jobs.reduce((n, j) => n + j.scans.filter((s) => s.status === "SCANNED").length, 0);
  const revenue = jobs.reduce((n, j) => n + jobBillable({ status: j.status, rate: Number(j.rate), stopCount: j.stopCount, scanned: j.scans.filter((s) => s.status === "SCANNED").length }), 0);

  const hoursBySite = new Map<string, number>();
  const perGuard = new Map<string, { shifts: number; hours: number; incidents: number; patrols: number }>();
  const g = (id: string) => { if (!perGuard.has(id)) perGuard.set(id, { shifts: 0, hours: 0, incidents: 0, patrols: 0 }); return perGuard.get(id)!; };
  for (const s of shifts) {
    const h = shiftHours(s);
    hoursBySite.set(s.siteId, (hoursBySite.get(s.siteId) ?? 0) + h);
    if (s.guardId) { g(s.guardId).shifts++; g(s.guardId).hours += h; }
  }
  for (const i of incidents) if (i.guardId) g(i.guardId).incidents++;
  for (const j of jobs) if (j.guardId && j.status === "COMPLETED") g(j.guardId).patrols++;

  const cleared = guards.filter((x) => guardCompliance(x.licences, now).level !== "block").length;
  const done = enrollments.filter((e) => e.status === "PASSED").length;

  return NextResponse.json({
    days,
    series,
    totals: {
      incidents: incidents.length,
      openIncidents: incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "ARCHIVED").length,
      alarms: alarms.length,
      falseAlarmPct: resolved.length ? Math.round((resolved.filter((a) => a.verification === "FALSE_ALARM").length / resolved.length) * 100) : null,
      avgResponseMins: avgResponse === null ? null : Math.round(avgResponse * 10) / 10,
      slaPct: genuine.length ? Math.round((withinSla / genuine.length) * 100) : null,
      patrolJobs: jobs.length,
      patrolCompletionPct: stops ? Math.round((scanned / stops) * 100) : null,
      patrolRevenue: Math.round(revenue * 100) / 100,
      guardHours: Math.round(shifts.reduce((n, s) => n + shiftHours(s), 0) * 10) / 10,
      compliancePct: guards.length ? Math.round((cleared / guards.length) * 100) : null,
      trainingPct: enrollments.length ? Math.round((done / enrollments.length) * 100) : null,
    },
    incidentsByType: tally(incidents, (i) => i.type).slice(0, 8),
    incidentsBySite: tally(incidents, (i) => look.siteName(i.siteId)).slice(0, 8),
    alarmsByType: tally(alarms, (a) => a.type).slice(0, 8),
    hoursBySite: Array.from(hoursBySite, ([id, value]) => ({ label: look.siteName(id), value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value).slice(0, 8),
    patrolByRun: Array.from(
      jobs.reduce((m, j) => {
        const e = m.get(j.run.code) ?? { stops: 0, scanned: 0 };
        e.stops += j.stopCount; e.scanned += j.scans.filter((s) => s.status === "SCANNED").length;
        return m.set(j.run.code, e);
      }, new Map<string, { stops: number; scanned: number }>()),
      ([label, e]) => ({ label, value: e.stops ? Math.round((e.scanned / e.stops) * 100) : 0 }),
    ).sort((a, b) => a.label.localeCompare(b.label)),
    guards: Array.from(perGuard, ([id, v]) => ({ id, name: look.guardName(id) ?? "Unknown", ...v, hours: Math.round(v.hours * 10) / 10 })).sort((a, b) => b.hours - a.hours),
  });
}
