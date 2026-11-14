import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { actorName } from "@/lib/server/crud";
import { buildLines } from "@/lib/server/payroll";
import { payRunInclude, serialisePayRun } from "@/lib/server/payruns";

const load = (id: string, companyId: string) => prisma.payRun.findFirst({ where: { id, companyId }, include: payRunInclude });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = await load(params.id, auth.companyId);
  return run ? NextResponse.json(await serialisePayRun(run)) : jsonError("not found", 404);
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("recalculate") }),
  z.object({ action: z.literal("finalise") }),
  z.object({ action: z.literal("adjust"), guardId: z.string().min(1), note: z.string().trim().min(2).max(80), amount: z.coerce.number().finite().min(-100000).max(100000), superable: z.boolean() }),
  z.object({ action: z.literal("remove-adjustment"), lineId: z.string().min(1) }),
  z.object({ action: z.literal("mark-exported"), to: z.string().trim().min(2).max(40) }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "validation", 400);
  const a = parsed.data;
  const run = await load(params.id, auth.companyId);
  if (!run) return jsonError("not found", 404);
  const draftOnly = ["recalculate", "finalise", "adjust", "remove-adjustment"];
  if (draftOnly.includes(a.action) && run.status !== "DRAFT") return jsonError("This pay run is finalised and can't be changed.", 409);

  if (a.action === "recalculate") {
    // Re-applies the current pay rules and guard rates; adjustments are kept.
    const shifts = await prisma.shift.findMany({ where: { payRunId: run.id }, select: { id: true } });
    const { lines, missingRate, settings } = await buildLines(auth.companyId, shifts.map((s) => s.id));
    if (missingRate.length) return jsonError(`Set a pay rate for: ${missingRate.join(", ")}.`, 400);
    await prisma.$transaction([
      prisma.payRunLine.deleteMany({ where: { payRunId: run.id, category: { not: "ADJUSTMENT" } } }),
      prisma.payRunLine.createMany({ data: lines.map((l) => ({ ...l, payRunId: run.id })) }),
      prisma.payRun.update({ where: { id: run.id }, data: { superRate: settings.rules.superRate } }),
    ]);
  } else if (a.action === "adjust") {
    const g = await prisma.guard.findFirst({ where: { id: a.guardId, companyId: auth.companyId } });
    if (!g) return jsonError("guard not found", 404);
    await prisma.payRunLine.create({
      data: { payRunId: run.id, guardId: g.id, workDate: run.periodEnd, category: "ADJUSTMENT", hours: 0, baseRate: 0, multiplier: 1, amount: a.amount, superable: a.superable, note: a.note },
    });
  } else if (a.action === "remove-adjustment") {
    await prisma.payRunLine.deleteMany({ where: { id: a.lineId, payRunId: run.id, category: "ADJUSTMENT" } });
  } else if (a.action === "finalise") {
    await prisma.payRun.update({ where: { id: run.id }, data: { status: "FINALISED", finalisedAt: new Date(), finalisedBy: actorName(auth) } });
  } else if (a.action === "mark-exported") {
    if (run.status !== "FINALISED") return jsonError("Finalise the pay run before exporting it.", 409);
    await prisma.payRun.update({ where: { id: run.id }, data: { exportedAt: new Date(), exportedTo: a.to } });
  }
  const fresh = await load(run.id, auth.companyId);
  return NextResponse.json(await serialisePayRun(fresh!));
}

// Deleting a draft releases its timesheets so they can be corrected and
// included again. Finalised runs are the payroll record and stay.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const run = await prisma.payRun.findFirst({ where: { id: params.id, companyId: auth.companyId } });
  if (!run) return jsonError("not found", 404);
  if (run.status !== "DRAFT") return jsonError("Only a draft pay run can be deleted.", 409);
  await prisma.$transaction([
    prisma.shift.updateMany({ where: { payRunId: run.id }, data: { payRunId: null } }),
    prisma.payRun.delete({ where: { id: run.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
