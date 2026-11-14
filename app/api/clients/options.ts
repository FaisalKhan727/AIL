import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { zBool, zOptDate, zOptStr, zStr } from "@/lib/server/crud";

export const options = {
  model: "client",
  schema: z.object({
    name: zStr(),
    abn: zOptStr(20),
    contactName: zOptStr(),
    contactPhone: zOptStr(30),
    contactEmail: zOptStr(),
    billingEmail: zOptStr(),
    contractStart: zOptDate,
    contractEnd: zOptDate,
    paymentTermsDays: z.coerce.number().int().min(0).max(120).optional(),
    slaPatrolPct: z.coerce.number().int().min(0).max(100).optional(),
    slaAlarmMins: z.coerce.number().int().min(1).max(240).optional(),
    notes: zOptStr(2000),
    active: zBool,
  }),
  include: { sites: { select: { id: true, name: true } }, _count: { select: { runs: true, invoices: true } } },
  orderBy: [{ active: "desc" }, { name: "asc" }],
  guardDelete: async (row: { id: string }) =>
    (await prisma.invoice.count({ where: { clientId: row.id } })) > 0
      ? "This client has invoices. Mark it inactive instead of deleting it."
      : null,
};
