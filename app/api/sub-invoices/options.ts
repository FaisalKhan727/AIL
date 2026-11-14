import { z } from "zod";
import { zNum, zOptStr, zStr } from "@/lib/server/crud";

export const options = {
  model: "subInvoice",
  schema: z.object({
    subcontractorId: z.string().min(1),
    number: zStr(40),
    period: zOptStr(60),
    amount: zNum.min(0),
    status: z.enum(["PENDING", "APPROVED", "PAID", "DISPUTED"]).optional(),
    note: zOptStr(500),
  }),
  refs: { subcontractorId: "subcontractor" },
  include: { subcontractor: { select: { name: true } } },
  orderBy: { receivedAt: "desc" },
};
