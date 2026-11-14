import { z } from "zod";
import { zBool, zOptInt, zOptStr, zStr } from "@/lib/server/crud";

const question = z.object({
  q: z.string().trim().min(3).max(300),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  answer: z.number().int().min(0),
}).refine((x) => x.answer < x.options.length, "The correct answer must be one of the options");

export const options = {
  model: "course",
  schema: z.object({
    title: zStr(),
    category: zStr(80),
    description: zOptStr(500),
    content: z.string().trim().min(1, "Add the course material").max(20000),
    mandatory: zBool,
    renewalMonths: zOptInt,
    passMark: z.coerce.number().int().min(1).max(100).optional(),
    questions: z.array(question).max(40).optional(),
    active: zBool,
  }),
  include: { enrollments: { select: { status: true } } },
  orderBy: [{ active: "desc" }, { title: "asc" }],
};
