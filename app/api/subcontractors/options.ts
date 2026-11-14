import { z } from "zod";
import { zOptDate, zOptInt, zOptStr, zStr } from "@/lib/server/crud";

export const options = {
  model: "subcontractor",
  schema: z.object({
    name: zStr(),
    abn: zOptStr(20),
    contactName: zOptStr(),
    phone: zOptStr(30),
    email: zOptStr(),
    status: z.enum(["ACTIVE", "PENDING", "SUSPENDED"]).optional(),
    specialties: zOptStr(300),
    insuranceExpiry: zOptDate,
    rating: zOptInt.refine((v) => v == null || (v >= 1 && v <= 5), "Rating is 1 to 5"),
    notes: zOptStr(2000),
  }),
  include: {
    guards: { select: { id: true, firstName: true, lastName: true, active: true } },
    _count: { select: { jobRequests: true, invoices: true } },
  },
  orderBy: { name: "asc" },
};
