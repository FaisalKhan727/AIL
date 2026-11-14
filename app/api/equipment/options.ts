import { z } from "zod";
import { zOptId, zOptStr, zStr } from "@/lib/server/crud";

export const options = {
  model: "equipment",
  schema: z.object({
    name: zStr(80),
    kind: zStr(40),
    serial: zOptStr(60),
    status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE", "LOST"]).optional(),
    guardId: zOptId,
    notes: zOptStr(1000),
  }),
  refs: { guardId: "guard" },
  orderBy: [{ kind: "asc" }, { name: "asc" }],
};
