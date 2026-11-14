import { z } from "zod";
import { zOptDate, zOptInt, zOptStr, zStr } from "@/lib/server/crud";

export const options = {
  model: "vehicle",
  schema: z.object({
    code: zStr(20),
    rego: zStr(20),
    make: zOptStr(60),
    model: zOptStr(60),
    year: zOptInt,
    status: z.enum(["ACTIVE", "IN_SERVICE", "DECOMMISSIONED"]).optional(),
    odometer: zOptInt,
    serviceDue: zOptDate,
    insuranceExpiry: zOptDate,
    notes: zOptStr(1000),
  }),
  include: { runs: { select: { code: true } }, checks: { orderBy: { at: "desc" as const }, take: 1 } },
  orderBy: { code: "asc" },
};
