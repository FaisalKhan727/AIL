import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { INCIDENT_TYPES, PRIORITIES } from "@/lib/ops";
import { actorName, nextRef, zOptId, zOptStr } from "@/lib/server/crud";
import { lookups } from "@/lib/server/ops";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const [rows, look, alarms] = await Promise.all([
    prisma.incident.findMany({
      where: { companyId: auth.companyId },
      include: { updates: { orderBy: { at: "asc" } }, photo: { select: { mime: true } }, alarm: { select: { ref: true } } },
      orderBy: { occurredAt: "desc" },
      take: 500,
    }),
    lookups(auth.companyId),
    prisma.alarm.findMany({ where: { companyId: auth.companyId }, orderBy: { triggeredAt: "desc" }, take: 30, select: { id: true, ref: true, type: true, siteId: true } }),
  ]);
  return NextResponse.json({
    incidents: rows.map((i) => ({ ...i, photo: undefined, hasPhoto: Boolean(i.photo), siteName: look.siteName(i.siteId), guardName: look.guardName(i.guardId) })),
    sites: look.sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name })),
    guards: look.guards.filter((g) => g.active).map((g) => ({ id: g.id, name: g.name })),
    alarms: alarms.map((a) => ({ id: a.id, ref: a.ref, label: `${a.type} — ${look.siteName(a.siteId)}` })),
  });
}

const incidentSchema = z.object({
  siteId: z.string().min(1),
  guardId: zOptId,
  alarmId: zOptId,
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(PRIORITIES),
  zone: zOptStr(80),
  narrative: z.string().trim().min(10, "Describe what happened (at least a sentence)").max(5000),
  persons: zOptStr(1000),
  lossValue: z.union([z.number(), z.string()]).nullish().transform((v) => (v === undefined || v === null || v === "" ? null : Number(v))),
  notifyClient: z.boolean().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = incidentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const [site, guard, alarm] = await Promise.all([
    prisma.site.findFirst({ where: { id: d.siteId, companyId: auth.companyId } }),
    d.guardId ? prisma.guard.findFirst({ where: { id: d.guardId, companyId: auth.companyId } }) : null,
    d.alarmId ? prisma.alarm.findFirst({ where: { id: d.alarmId, companyId: auth.companyId } }) : null,
  ]);
  if (!site || (d.guardId && !guard) || (d.alarmId && !alarm)) return jsonError("site, guard or alarm not found", 404);
  const incident = await prisma.incident.create({
    data: {
      companyId: auth.companyId,
      ref: await nextRef("incident", auth.companyId),
      siteId: site.id,
      guardId: d.guardId ?? null,
      alarmId: d.alarmId ?? null,
      type: d.type,
      severity: d.severity,
      zone: d.zone ?? null,
      narrative: d.narrative,
      persons: d.persons ?? null,
      lossValue: d.lossValue,
      notifyClient: d.notifyClient ?? false,
      occurredAt: d.occurredAt ? new Date(d.occurredAt) : new Date(),
      updates: { create: { actor: actorName(auth), text: "Incident logged by the office" } },
    },
  });
  return NextResponse.json(incident, { status: 201 });
}
