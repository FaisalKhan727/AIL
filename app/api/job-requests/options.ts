import { z } from "zod";
import { zDate, zOptId, zStr } from "@/lib/server/crud";

export const options = {
  model: "jobRequest",
  schema: z.object({
    subcontractorId: z.string().min(1),
    siteId: zOptId,
    description: zStr(500),
    startDate: zDate,
    endDate: zDate,
    headcount: z.coerce.number().int().min(1).max(500).optional(),
    status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "COMPLETED"]).optional(),
  }),
  refs: { subcontractorId: "subcontractor", siteId: "site" },
  include: { subcontractor: { select: { name: true } } },
  orderBy: { startDate: "desc" },
};
