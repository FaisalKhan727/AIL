import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATEGORIES, CATEGORY_LABEL, payTotals, type Category } from "@/lib/payroll";

export const payRunInclude = { lines: true, _count: { select: { shifts: true } } } satisfies Prisma.PayRunInclude;
type Row = Prisma.PayRunGetPayload<{ include: typeof payRunInclude }>;

const n = (d: Prisma.Decimal | number) => Number(d);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Pay run with per-guard summaries (hours, gross, super) and a breakdown by pay category. */
export async function serialisePayRun(run: Row) {
  const guardIds = Array.from(new Set(run.lines.map((l) => l.guardId)));
  const guards = await prisma.guard.findMany({
    where: { id: { in: guardIds } },
    select: { id: true, firstName: true, lastName: true, employmentType: true, payRate: true, payrollRef: true, externalEmployeeId: true },
  });
  const superRate = n(run.superRate);
  const people = guards
    .map((g) => {
      const ls = run.lines.filter((l) => l.guardId === g.id).map((l) => ({ ...l, hours: n(l.hours), amount: n(l.amount), baseRate: n(l.baseRate), multiplier: n(l.multiplier) }));
      const byCat = new Map<string, { category: string; label: string; hours: number; multiplier: number; amount: number }>();
      for (const l of ls) {
        const key = `${l.category}|${l.multiplier}|${l.category === "ADJUSTMENT" ? l.id : ""}`;
        const e = byCat.get(key) ?? { category: l.category, label: l.category === "ADJUSTMENT" ? l.note || "Adjustment" : CATEGORY_LABEL[l.category as Category], hours: 0, multiplier: l.multiplier, amount: 0 };
        e.hours = round2(e.hours + l.hours);
        e.amount = round2(e.amount + l.amount);
        byCat.set(key, e);
      }
      return {
        guardId: g.id,
        name: `${g.firstName} ${g.lastName}`,
        employmentType: g.employmentType,
        baseRate: ls.find((l) => l.category !== "ADJUSTMENT")?.baseRate ?? (g.payRate ? n(g.payRate) : 0),
        payrollRef: g.payrollRef,
        externalEmployeeId: g.externalEmployeeId,
        shifts: new Set(ls.filter((l) => l.shiftId).map((l) => l.shiftId)).size,
        ...payTotals(ls, superRate),
        // Award order, adjustments last.
        breakdown: Array.from(byCat.values()).sort((a, b) => CATEGORIES.indexOf(a.category as Category) - CATEGORIES.indexOf(b.category as Category)),
        adjustments: ls.filter((l) => l.category === "ADJUSTMENT").map((l) => ({ id: l.id, note: l.note, amount: l.amount, superable: l.superable })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const totals = people.reduce((t, p) => ({ hours: round2(t.hours + p.hours), gross: round2(t.gross + p.gross), super: round2(t.super + p.super) }), { hours: 0, gross: 0, super: 0 });
  return {
    id: run.id,
    number: run.number,
    status: run.status,
    periodStart: run.periodStart.toISOString().slice(0, 10),
    periodEnd: run.periodEnd.toISOString().slice(0, 10),
    payDate: run.payDate.toISOString().slice(0, 10),
    superRate,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    finalisedAt: run.finalisedAt,
    finalisedBy: run.finalisedBy,
    exportedAt: run.exportedAt,
    exportedTo: run.exportedTo,
    shiftCount: run._count.shifts,
    people,
    totals,
  };
}
