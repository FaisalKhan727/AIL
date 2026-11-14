import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuard } from "@/lib/api";
import { refLabel } from "@/lib/ops";
import { todayUtc } from "@/lib/server/ops";

// Everything a guard has to action besides rostered shifts.
export async function GET() {
  const auth = await requireGuard();
  if ("error" in auth) return auth.error;
  const today = todayUtc();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const [alarms, jobs, enrollments, sites] = await Promise.all([
    prisma.alarm.findMany({ where: { guardId: auth.guardId, status: { in: ["DISPATCHED", "EN_ROUTE", "ON_SCENE"] } }, orderBy: { dispatchedAt: "desc" } }),
    // Tonight's runs, plus anything still open from last night (runs cross midnight).
    prisma.patrolJob.findMany({
      where: { guardId: auth.guardId, OR: [{ date: today }, { date: yesterday, status: { in: ["SCHEDULED", "ACTIVE"] } }, { status: "ACTIVE" }] },
      include: { run: { select: { code: true, name: true } }, scans: { select: { status: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.enrollment.findMany({ where: { guardId: auth.guardId }, include: { course: { select: { title: true, category: true, mandatory: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.site.findMany({ where: { companyId: auth.companyId, active: true }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
  ]);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  return NextResponse.json({
    dispatches: alarms.map((a) => ({
      id: a.id, ref: refLabel("ALM", a.ref), type: a.type, priority: a.priority, zone: a.zone, status: a.status, etaMins: a.etaMins,
      dispatchedAt: a.dispatchedAt, site: siteById.get(a.siteId) ?? { name: "Site", address: "" },
    })),
    patrols: jobs.map((j) => ({
      id: j.id, code: j.run.code, name: j.run.name, date: j.date.toISOString().slice(0, 10), status: j.status, stopCount: j.stopCount,
      done: j.scans.length,
    })),
    training: enrollments.map((e) => ({ id: e.id, title: e.course.title, category: e.course.category, mandatory: e.course.mandatory, status: e.status, score: e.score, dueAt: e.dueAt, expiresAt: e.expiresAt })),
    sites,
  });
}
