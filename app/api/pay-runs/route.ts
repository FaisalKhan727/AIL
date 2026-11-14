import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { actorName } from "@/lib/server/crud";
import { buildLines, getPaySettings, periodBounds } from "@/lib/server/payroll";
import { payRunInclude, serialisePayRun } from "@/lib/server/payruns";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const runs = await prisma.payRun.findMany({ where: { companyId: auth.companyId }, include: payRunInclude, orderBy: { number: "desc" }, take: 60 });
  return NextResponse.json(await Promise.all(runs.map(serialisePayRun)));
}

const schema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Draft a pay run from every approved timesheet in the period that hasn't
// been paid yet. Those timesheets are locked to the run until it is deleted.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick the period and pay date.", 400);
  const d = parsed.data;
  if (d.periodEnd < d.periodStart) return jsonError("The period ends before it starts.", 400);

  const settings = await getPaySettings(auth.companyId);
  const { from, to } = periodBounds(d.periodStart, d.periodEnd, settings.tz);
  const shifts = await prisma.shift.findMany({
    where: { roster: { companyId: auth.companyId }, guardId: { not: null }, tsStatus: "APPROVED", payRunId: null, startAt: { gte: from, lt: to } },
    select: { id: true },
  });
  if (shifts.length === 0) return jsonError("There are no approved, unpaid timesheets in this period.", 400);

  const { lines, missingRate } = await buildLines(auth.companyId, shifts.map((s) => s.id));
  if (missingRate.length) return jsonError(`Set a pay rate for: ${missingRate.join(", ")}.`, 400);

  const last = await prisma.payRun.findFirst({ where: { companyId: auth.companyId }, orderBy: { number: "desc" }, select: { number: true } });
  const run = await prisma.$transaction(async (tx) => {
    const r = await tx.payRun.create({
      data: {
        companyId: auth.companyId,
        number: (last?.number ?? 0) + 1,
        periodStart: new Date(`${d.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${d.periodEnd}T00:00:00.000Z`),
        payDate: new Date(`${d.payDate}T00:00:00.000Z`),
        superRate: settings.rules.superRate,
        createdBy: actorName(auth),
        lines: { createMany: { data: lines } },
      },
    });
    // Guard against a race with another pay run grabbing the same shifts.
    const linked = await tx.shift.updateMany({ where: { id: { in: shifts.map((s) => s.id) }, payRunId: null }, data: { payRunId: r.id } });
    if (linked.count !== shifts.length) throw new Error("Some timesheets were just added to another pay run. Try again.");
    return r;
  });
  return NextResponse.json({ id: run.id, number: run.number }, { status: 201 });
}
