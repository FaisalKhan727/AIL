import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { zBool, zNum, zOptId, zOptStr, zStr } from "@/lib/server/crud";

export const runInclude = {
  stops: { orderBy: { position: "asc" as const } },
  client: { select: { id: true, name: true } },
  vehicle: { select: { id: true, code: true, rego: true } },
  _count: { select: { jobs: true } },
};

export const runSchema = z.object({
  code: zStr(12),
  name: zStr(120),
  clientId: zOptId,
  vehicleId: zOptId,
  rate: zNum.min(0),
  active: zBool,
  stops: z.array(z.object({ id: z.string().optional(), name: zStr(120), address: zOptStr(200), instructions: zOptStr(300) })).min(1, "Add at least one stop").max(50),
});

export async function refsOk(companyId: string, d: { clientId?: string | null; vehicleId?: string | null }) {
  const [c, v] = await Promise.all([
    d.clientId ? prisma.client.findFirst({ where: { id: d.clientId, companyId } }) : true,
    d.vehicleId ? prisma.vehicle.findFirst({ where: { id: d.vehicleId, companyId } }) : true,
  ]);
  return Boolean(c && v);
}

export const jobInclude = {
  run: { include: { stops: { orderBy: { position: "asc" as const } }, client: { select: { name: true } }, vehicle: { select: { code: true, rego: true } } } },
  scans: true,
};

