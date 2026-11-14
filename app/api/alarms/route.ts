import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { ALARM_TYPES, PRIORITIES } from "@/lib/ops";
import { actorName, nextRef, zOptStr } from "@/lib/server/crud";
import { guardsOnShift, lookups } from "@/lib/server/ops";
import { getSettingValue } from "@/lib/server/licences";

interface AlarmContact { name: string; phone: string }

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const history = new URL(req.url).searchParams.get("scope") === "history";

  const [alarms, look, onShift, contactsRaw] = await Promise.all([
    prisma.alarm.findMany({
      where: { companyId: auth.companyId, status: history ? "RESOLVED" : { not: "RESOLVED" } },
      include: { events: { orderBy: { at: "asc" } } },
      orderBy: history ? { triggeredAt: "desc" } : { triggeredAt: "asc" },
      take: history ? 500 : undefined,
    }),
    lookups(auth.companyId),
    guardsOnShift(auth.companyId),
    getSettingValue(auth.companyId, "alarm_contacts"),
  ]);

  let contacts: AlarmContact[] = [];
  try { contacts = contactsRaw ? JSON.parse(contactsRaw) : []; } catch { /* stored value is not JSON; treat as empty */ }

  const busy = new Set(alarms.filter((a) => a.status !== "RESOLVED" && a.guardId).map((a) => a.guardId));
  const shiftByGuard = new Map(onShift.map((s) => [s.guardId, s]));
  return NextResponse.json({
    alarms: alarms.map((a) => ({ ...a, siteName: look.siteName(a.siteId), guardName: look.guardName(a.guardId), guardPhone: look.guard(a.guardId)?.phone ?? null })),
    sites: look.sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name })),
    // Everyone who could be sent, with what we know about where they are.
    guards: look.guards.filter((g) => g.active).map((g) => {
      const s = shiftByGuard.get(g.id);
      return { id: g.id, name: g.name, phone: g.phone, onShiftSiteId: s?.siteId ?? null, onShiftSite: s ? look.siteName(s.siteId) : null, clockedIn: s?.clockedIn ?? false, busy: busy.has(g.id) };
    }),
    contacts,
  });
}

const createSchema = z.object({
  siteId: z.string().min(1),
  zone: zOptStr(80),
  type: z.enum(ALARM_TYPES),
  priority: z.enum(PRIORITIES),
  note: zOptStr(500),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const d = parsed.data;
  const site = await prisma.site.findFirst({ where: { id: d.siteId, companyId: auth.companyId } });
  if (!site) return jsonError("site not found", 404);
  const alarm = await prisma.alarm.create({
    data: {
      companyId: auth.companyId,
      ref: await nextRef("alarm", auth.companyId),
      siteId: site.id,
      zone: d.zone ?? null,
      type: d.type,
      priority: d.priority,
      events: { create: { actor: actorName(auth), text: `Alarm logged${d.note ? ` — ${d.note}` : ""}` } },
    },
  });
  return NextResponse.json(alarm, { status: 201 });
}
