import { prisma } from "@/lib/prisma";
import { getSmsAdapter } from "@/lib/sms";

/** id -> display name maps for the plain foreign keys on the ops tables. */
export async function lookups(companyId: string) {
  const [sites, guards] = await Promise.all([
    prisma.site.findMany({ where: { companyId }, select: { id: true, name: true, address: true, clientId: true, active: true } }),
    prisma.guard.findMany({ where: { companyId }, select: { id: true, firstName: true, lastName: true, phone: true, active: true, subcontractorId: true } }),
  ]);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const guardById = new Map(guards.map((g) => [g.id, { ...g, name: `${g.firstName} ${g.lastName}` }]));
  return {
    sites,
    guards: guards.map((g) => ({ ...g, name: `${g.firstName} ${g.lastName}` })),
    siteName: (id: string | null | undefined) => (id ? siteById.get(id)?.name ?? "Unknown site" : "—"),
    guardName: (id: string | null | undefined) => (id ? guardById.get(id)?.name ?? "Unknown guard" : null),
    guard: (id: string | null | undefined) => (id ? guardById.get(id) ?? null : null),
    site: (id: string | null | undefined) => (id ? siteById.get(id) ?? null : null),
  };
}

/** Send an SMS without letting a gateway failure break the caller. */
export async function trySms(to: string, body: string, guardId?: string): Promise<boolean> {
  try {
    await getSmsAdapter().sendSms(to, body, guardId ? { guardId } : undefined);
    return true;
  } catch (e) {
    console.error("[sms] send failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Guards rostered right now (shift in progress), with whether they've clocked in. */
export async function guardsOnShift(companyId: string, now: Date = new Date()) {
  const shifts = await prisma.shift.findMany({
    where: {
      roster: { companyId },
      guardId: { not: null },
      status: { in: ["CONFIRMED", "WORKED"] },
      startAt: { lte: now },
      endAt: { gte: now },
    },
    select: { guardId: true, siteId: true, clockInAt: true, clockOutAt: true },
  });
  return shifts.map((s) => ({ guardId: s.guardId as string, siteId: s.siteId, clockedIn: Boolean(s.clockInAt && !s.clockOutAt) }));
}

export const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
export const todayUtc = () => dateOnly(new Date().toISOString());
